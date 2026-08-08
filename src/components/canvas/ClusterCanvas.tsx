"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import { useClusterStore } from "@/store/useClusterStore";
import type { Pod, WorkerNode } from "@/store/types";
import { endpointNodes } from "@/lib/network";
import { labelsMatchQuery } from "@/lib/selector";
import { canI } from "@/lib/rbac";
import { MasterNode } from "@/components/canvas/nodes/MasterNode";
import { WorkerNodeCard } from "@/components/canvas/nodes/WorkerNodeCard";
import { ServiceNode } from "@/components/canvas/nodes/ServiceNode";
import { IngressNode } from "@/components/canvas/nodes/IngressNode";
import { ClientNode } from "@/components/canvas/nodes/ClientNode";
import {
  ConfigMapNode,
  SecretNode,
} from "@/components/canvas/nodes/ConfigNodes";
import { PVNode, PVCNode } from "@/components/canvas/nodes/StorageNodes";
import { AddNodeControl } from "@/components/canvas/AddNodeControl";
import { SchedulingQueue } from "@/components/canvas/SchedulingQueue";
import { SelectorInspector } from "@/components/canvas/SelectorInspector";
import { RequestFlowLayer } from "@/components/canvas/RequestFlowLayer";
import { TrafficControl } from "@/components/canvas/TrafficControl";

/**
 * ClusterCanvas — the interactive pan/zoom cluster topology.
 *
 * Worker nodes, services, ingresses, config/secret boxes, the storage zone and
 * the external client are derived from the store and reconciled into React
 * Flow (preserving user-dragged positions). Namespaced objects are filtered by
 * the active namespace; the Selector Inspector dims non-matching pods/services.
 */

const MASTER_ID = "control-plane";
const CLIENT_ID = "external-client";
const MASTER_POSITION = { x: 60, y: 140 };
const CLIENT_POSITION = { x: 300, y: -300 };

function workerPosition(index: number): { x: number; y: number } {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return { x: 460 + col * 296, y: 24 + row * 300 };
}
const ingressPosition = (i: number) => ({ x: 560 + i * 300, y: -300 });
const servicePosition = (i: number) => ({ x: 560 + i * 300, y: -150 });
const configPosition = (i: number) => ({ x: -320, y: -40 + i * 84 });
const pvcPosition = (i: number) => ({ x: 460 + i * 210, y: 700 });
const pvPosition = (i: number) => ({ x: 460 + i * 210, y: 840 });

const nodeTypes: NodeTypes = {
  master: MasterNode,
  worker: WorkerNodeCard,
  service: ServiceNode,
  ingress: IngressNode,
  client: ClientNode,
  configmap: ConfigMapNode,
  secret: SecretNode,
  pv: PVNode,
  pvc: PVCNode,
};

export function ClusterCanvas() {
  const storeNodes = useClusterStore((s) => s.nodes);
  const pods = useClusterStore((s) => s.pods);
  const services = useClusterStore((s) => s.services);
  const ingresses = useClusterStore((s) => s.ingresses);
  const configMaps = useClusterStore((s) => s.configMaps);
  const secrets = useClusterStore((s) => s.secrets);
  const persistentVolumes = useClusterStore((s) => s.persistentVolumes);
  const persistentVolumeClaims = useClusterStore(
    (s) => s.persistentVolumeClaims,
  );
  const namespace = useClusterStore((s) => s.namespace);
  const selectorQuery = useClusterStore((s) => s.ui.selectorQuery);
  const rbacSubject = useClusterStore((s) => s.ui.rbacSubject);
  const roles = useClusterStore((s) => s.roles);
  const clusterRoles = useClusterStore((s) => s.clusterRoles);
  const roleBindings = useClusterStore((s) => s.roleBindings);
  const clusterRoleBindings = useClusterStore((s) => s.clusterRoleBindings);
  const openDrawer = useClusterStore((s) => s.openDrawer);

  // RBAC permission overlay: can the selected subject `get` this resource?
  const rbacAllowed = useCallback(
    (resource: string) => {
      if (!rbacSubject) return true;
      return canI(
        { roles, clusterRoles, roleBindings, clusterRoleBindings },
        rbacSubject,
        "get",
        resource,
        namespace,
      );
    },
    [rbacSubject, roles, clusterRoles, roleBindings, clusterRoleBindings, namespace],
  );

  // Namespace-scoped views (Nodes/PVs are cluster-scoped → unfiltered).
  const nsPods = useMemo(
    () => pods.filter((p) => p.metadata.namespace === namespace),
    [pods, namespace],
  );
  const nsServices = useMemo(
    () => services.filter((s) => s.metadata.namespace === namespace),
    [services, namespace],
  );
  const nsIngresses = useMemo(
    () => ingresses.filter((i) => i.metadata.namespace === namespace),
    [ingresses, namespace],
  );
  const nsConfigMaps = useMemo(
    () => configMaps.filter((c) => c.metadata.namespace === namespace),
    [configMaps, namespace],
  );
  const nsSecrets = useMemo(
    () => secrets.filter((c) => c.metadata.namespace === namespace),
    [secrets, namespace],
  );
  const nsPVCs = useMemo(
    () =>
      persistentVolumeClaims.filter((c) => c.metadata.namespace === namespace),
    [persistentVolumeClaims, namespace],
  );

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([
    {
      id: MASTER_ID,
      type: "master",
      position: MASTER_POSITION,
      data: {},
      draggable: true,
    },
  ]);
  const [rfEdges, setRfEdges] = useEdgesState<Edge>([]);

  // Reconcile store objects into React Flow, preserving positions.
  useEffect(() => {
    setRfNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      const next: Node[] = [];
      const upsert = (
        id: string,
        type: string,
        fallbackPos: { x: number; y: number },
        data: Record<string, unknown>,
        style?: React.CSSProperties,
      ) => {
        const existing = prevById.get(id);
        next.push({
          id,
          type,
          position: existing?.position ?? fallbackPos,
          data,
          draggable: true,
          style,
        });
      };

      upsert(MASTER_ID, "master", MASTER_POSITION, {});

      storeNodes.forEach((wn, i) => {
        upsert(wn.id, "worker", workerPosition(i), { node: wn });
      });

      if (nsServices.length > 0 || nsIngresses.length > 0) {
        upsert(CLIENT_ID, "client", CLIENT_POSITION, {});
      }

      nsIngresses.forEach((ing, i) => {
        upsert(ing.metadata.uid, "ingress", ingressPosition(i), {
          ingress: ing,
        });
      });

      nsServices.forEach((svc, i) => {
        const match = labelsMatchQuery(svc.metadata.labels, selectorQuery);
        const opacity = match && rbacAllowed("services") ? 1 : 0.25;
        upsert(
          svc.metadata.uid,
          "service",
          servicePosition(i),
          { service: svc },
          { opacity },
        );
      });

      nsConfigMaps.forEach((cm, i) => {
        upsert(
          cm.metadata.uid,
          "configmap",
          configPosition(i),
          { configMap: cm },
          { opacity: rbacAllowed("configmaps") ? 1 : 0.25 },
        );
      });
      nsSecrets.forEach((sec, i) => {
        upsert(
          sec.metadata.uid,
          "secret",
          configPosition(nsConfigMaps.length + i),
          { secret: sec },
          { opacity: rbacAllowed("secrets") ? 1 : 0.25 },
        );
      });

      nsPVCs.forEach((pvc, i) => {
        upsert(
          pvc.metadata.uid,
          "pvc",
          pvcPosition(i),
          { pvc },
          { opacity: rbacAllowed("persistentvolumeclaims") ? 1 : 0.25 },
        );
      });
      persistentVolumes.forEach((pv, i) => {
        upsert(pv.metadata.uid, "pv", pvPosition(i), { pv });
      });

      return next;
    });
  }, [
    storeNodes,
    nsServices,
    nsIngresses,
    nsConfigMaps,
    nsSecrets,
    nsPVCs,
    persistentVolumes,
    selectorQuery,
    rbacAllowed,
    setRfNodes,
  ]);

  // Edges: heartbeat + networking + config/storage (all live-updating).
  const edges = useMemo<Edge[]>(() => {
    const list: Edge[] = [];

    for (const wn of storeNodes) {
      const alive = wn.status === "Ready" && !wn.draining;
      list.push({
        id: `hb-${wn.id}`,
        source: wn.id,
        target: MASTER_ID,
        sourceHandle: "kubelet",
        targetHandle: "cp",
        animated: alive,
        style: alive
          ? { stroke: "#326ce5", strokeWidth: 1.5 }
          : { stroke: "#ef4444", strokeWidth: 1.5, strokeDasharray: "5 5" },
      });
    }

    for (const ing of nsIngresses) {
      list.push({
        id: `cl-${ing.metadata.uid}`,
        source: CLIENT_ID,
        target: ing.metadata.uid,
        sourceHandle: "client-out",
        targetHandle: "ing-in",
        style: { stroke: "#64748b", strokeWidth: 1.5, strokeDasharray: "4 4" },
      });
      for (const rule of ing.spec.rules) {
        const svc = nsServices.find((s) => s.metadata.name === rule.serviceName);
        if (!svc) continue;
        list.push({
          id: `ing-${ing.metadata.uid}-${svc.metadata.uid}`,
          source: ing.metadata.uid,
          target: svc.metadata.uid,
          sourceHandle: "ing-out",
          targetHandle: "svc-in",
          style: { stroke: "#eab308", strokeWidth: 1.5 },
        });
      }
    }

    for (const svc of nsServices) {
      for (const nodeName of endpointNodes(svc, nsPods)) {
        const wn = storeNodes.find((n) => n.name === nodeName);
        if (!wn) continue;
        list.push({
          id: `ep-${svc.metadata.uid}-${wn.id}`,
          source: svc.metadata.uid,
          target: wn.id,
          sourceHandle: "svc-out",
          targetHandle: "svc",
          animated: true,
          style: { stroke: svc.color, strokeWidth: 1.5 },
        });
      }
    }

    const consumerNodes = (selector: (p: Pod) => boolean): string[] => {
      const names = new Set<string>();
      for (const p of nsPods) {
        if (p.spec.nodeName && selector(p)) names.add(p.spec.nodeName);
      }
      return Array.from(names);
    };

    for (const cm of nsConfigMaps) {
      for (const nodeName of consumerNodes((p) =>
        (p.spec.configMaps ?? []).includes(cm.metadata.name),
      )) {
        const wn = storeNodes.find((n) => n.name === nodeName);
        if (!wn) continue;
        list.push({
          id: `cm-${cm.metadata.uid}-${wn.id}`,
          source: cm.metadata.uid,
          target: wn.id,
          sourceHandle: "cm-out",
          targetHandle: "data",
          label: "env/mount",
          labelStyle: { fill: "#38bdf8", fontSize: 9 },
          style: { stroke: "#38bdf8", strokeWidth: 1.25, strokeDasharray: "3 3" },
        });
      }
    }

    for (const sec of nsSecrets) {
      for (const nodeName of consumerNodes((p) =>
        (p.spec.secrets ?? []).includes(sec.metadata.name),
      )) {
        const wn = storeNodes.find((n) => n.name === nodeName);
        if (!wn) continue;
        list.push({
          id: `sec-${sec.metadata.uid}-${wn.id}`,
          source: sec.metadata.uid,
          target: wn.id,
          sourceHandle: "sec-out",
          targetHandle: "data",
          label: "secret",
          labelStyle: { fill: "#fbbf24", fontSize: 9 },
          style: { stroke: "#fbbf24", strokeWidth: 1.25, strokeDasharray: "3 3" },
        });
      }
    }

    for (const pvc of nsPVCs) {
      for (const nodeName of consumerNodes((p) =>
        (p.spec.pvcs ?? []).includes(pvc.metadata.name),
      )) {
        const wn = storeNodes.find((n) => n.name === nodeName);
        if (!wn) continue;
        list.push({
          id: `pvc-node-${pvc.metadata.uid}-${wn.id}`,
          source: pvc.metadata.uid,
          target: wn.id,
          sourceHandle: "pvc-up",
          targetHandle: "data",
          style: { stroke: "#22c55e", strokeWidth: 1.25 },
        });
      }
      if (pvc.boundPVUid) {
        list.push({
          id: `pvc-pv-${pvc.metadata.uid}`,
          source: pvc.metadata.uid,
          target: pvc.boundPVUid,
          sourceHandle: "pvc-pv",
          targetHandle: "pv-in",
          animated: true,
          style: { stroke: "#22c55e", strokeWidth: 1.5 },
        });
      }
    }

    return list;
  }, [
    storeNodes,
    nsServices,
    nsIngresses,
    nsPods,
    nsConfigMaps,
    nsSecrets,
    nsPVCs,
  ]);

  useEffect(() => {
    setRfEdges(edges);
  }, [edges, setRfEdges]);

  return (
    <div className="relative h-full w-full">
      <AddNodeControl />
      <SelectorInspector />
      <SchedulingQueue />
      <TrafficControl />
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => {
          if (node.type === "worker") {
            const wn = (node.data as { node: WorkerNode }).node;
            openDrawer({ kind: "Node", name: wn.name, id: wn.id });
          }
        }}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: false }}
        className="bg-panel-950"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#1c2a3d"
        />
        <Controls
          showInteractive={false}
          position="bottom-left"
          className="!bottom-4 !left-4"
        />
        <RequestFlowLayer />
      </ReactFlow>
    </div>
  );
}
