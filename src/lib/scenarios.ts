"use client";

/**
 * Guided scenarios (Phase 7) — data-driven preset clusters with a narrated
 * walkthrough. Adding a scenario is just another entry in this array; the UI
 * renders whatever is here (satisfies the "configurable" brief requirement).
 */

import { useClusterStore } from "@/store/useClusterStore";
import { useFlowStore } from "@/store/useFlowStore";
import { useTerminalStore } from "@/store/useTerminalStore";

export interface Scenario {
  id: string;
  name: string;
  description: string;
  steps: string[];
  build: () => void;
}

function freshCluster(nodeCount: number) {
  const store = useClusterStore.getState();
  store.resetCluster();
  useFlowStore.getState().clear();
  useTerminalStore.getState().reset();
  store.setNamespace("default");
  for (let i = 0; i < nodeCount; i++) {
    store.addNode({ name: `node-${i + 1}`, cpuCapacity: 4, memCapacity: 8 });
  }
}

export const SCENARIOS: Scenario[] = [
  {
    id: "self-healing",
    name: "Self-Healing Demo",
    description:
      "A Deployment with 3 replicas across nodes. Kill a pod and watch the ReplicaSet controller recreate it.",
    steps: [
      "3 pods have been created by the 'web' Deployment and scheduled across your nodes.",
      "Hover a pod card and click the skull icon to kill it (simulated crash).",
      "Watch the killed pod flash red and disappear.",
      "Within ~2s the ReplicaSet controller spawns a replacement (yellow → green) to restore 3 replicas.",
    ],
    build: () => {
      freshCluster(2);
      useClusterStore
        .getState()
        .createDeployment({ name: "web", image: "nginx:1.25", replicas: 3 });
    },
  },
  {
    id: "rolling-update",
    name: "Rolling Update Demo",
    description:
      "A Deployment ready for a rolling update. Change the image and watch the old ReplicaSet scale down as the new one scales up.",
    steps: [
      "The 'api' Deployment is running nginx:1.25 with 3 replicas.",
      "Open the Workloads panel and edit the image field to nginx:1.27, then click Update.",
      "A new ReplicaSet (revision 2) appears and scales up one pod at a time.",
      "The old ReplicaSet scales to zero (retained for rollback). Try the Rollback ↩ button.",
    ],
    build: () => {
      freshCluster(2);
      useClusterStore
        .getState()
        .createDeployment({ name: "api", image: "nginx:1.25", replicas: 3 });
    },
  },
  {
    id: "load-balancing",
    name: "Load Balancing Demo",
    description:
      "A Service load-balancing across 3 backing pods. Fire bulk requests and watch round-robin distribution.",
    steps: [
      "The 'frontend' Deployment (3 pods) is exposed by the 'frontend' Service.",
      "Find the Service on the canvas (top area) or in the Workloads panel.",
      "Click 'x10' to fire 10 requests in quick succession.",
      "Watch the packet animate to each pod in turn — per-pod ⚡ counters show round-robin balancing.",
    ],
    build: () => {
      freshCluster(2);
      const store = useClusterStore.getState();
      store.createDeployment({ name: "frontend", image: "nginx:1.25", replicas: 3 });
      store.createService({
        name: "frontend",
        type: "ClusterIP",
        selector: { app: "frontend" },
        port: 80,
        targetPort: 80,
      });
    },
  },
  {
    id: "autoscaling",
    name: "Autoscaling Demo",
    description:
      "A Deployment with a HorizontalPodAutoscaler attached. Drag the load slider to trigger scale events.",
    steps: [
      "The 'checkout' Deployment starts at 2 replicas with an HPA (min 2, max 8, target 70% CPU).",
      "Open the Workloads panel and find the Autoscalers section.",
      "Drag the HPA's load slider upward past 70%.",
      "The HPA scales the Deployment up (respecting max 8); drop the load to watch it scale back down.",
    ],
    build: () => {
      freshCluster(3);
      const store = useClusterStore.getState();
      store.createDeployment({ name: "checkout", image: "nginx:1.25", replicas: 2 });
      const d = useClusterStore
        .getState()
        .deployments.find((x) => x.metadata.name === "checkout");
      if (d) {
        store.createHPA({
          targetKind: "Deployment",
          targetName: "checkout",
          targetUid: d.metadata.uid,
          minReplicas: 2,
          maxReplicas: 8,
          targetCPUUtilizationPercentage: 70,
        });
      }
    },
  },
  {
    id: "full-stack",
    name: "Full Stack Demo",
    description:
      "Ingress → Service → Deployment → ConfigMap/Secret → PVC, all wired together — the complete request-to-storage picture.",
    steps: [
      "The 'shop' Deployment consumes a ConfigMap, a Secret and a PVC (see the connector lines).",
      "It is fronted by the 'shop-svc' Service and the 'shop-ingress' Ingress (shop.local/).",
      "Click Send on the Ingress rule, or run: kubesim curl shop.local/",
      "Follow the packet: Client → Ingress → Service → Pod, then explore each object in the drawer.",
    ],
    build: () => {
      freshCluster(3);
      const store = useClusterStore.getState();
      store.createConfigMap({
        name: "app-config",
        data: { APP_ENV: "production", LOG_LEVEL: "info" },
      });
      store.createSecret({
        name: "app-secret",
        data: { API_KEY: "s3cr3t", DB_PASSWORD: "hunter2" },
      });
      store.createPVC({ name: "data", storage: 5, storageClassName: "standard" });
      store.createDeployment({
        name: "shop",
        image: "nginx:1.25",
        replicas: 3,
        refs: {
          configMaps: ["app-config"],
          secrets: ["app-secret"],
          pvcs: ["data"],
        },
      });
      store.createService({
        name: "shop-svc",
        type: "ClusterIP",
        selector: { app: "shop" },
        port: 80,
        targetPort: 80,
      });
      store.createIngress({
        name: "shop-ingress",
        rules: [
          { host: "shop.local", path: "/", serviceName: "shop-svc", servicePort: 80 },
        ],
      });
    },
  },
];
