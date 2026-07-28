"use client";

import { useEffect, useRef, useState } from "react";
import { useAnimate } from "framer-motion";
import { useReactFlow, useViewport } from "@xyflow/react";
import { X } from "lucide-react";
import { useFlowStore, type RequestPlan } from "@/store/useFlowStore";

/**
 * RequestFlowLayer — animates the API-flow packet across the canvas.
 *
 * Rendered inside <ReactFlow> so it can read node positions and the live
 * viewport transform. For each queued request it moves a packet
 * client → (ingress) → service → node(hosting chosen pod) and back, showing a
 * routing-decision label at each hop, flashing the chosen pod, and reporting
 * latency. Blocked requests stop at the boundary with a red X.
 */

const SEG_MS = 360;

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function RequestFlowLayer() {
  const { getNode } = useReactFlow();
  const { x: vx, y: vy, zoom } = useViewport();
  const active = useFlowStore((s) => s.active);
  const queueLen = useFlowStore((s) => s.queue.length);
  const startNext = useFlowStore((s) => s.startNext);
  const hitPod = useFlowStore((s) => s.hitPod);
  const finishActive = useFlowStore((s) => s.finishActive);

  const [scope, animate] = useAnimate();
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState("");
  const [blocked, setBlocked] = useState(false);
  const runningId = useRef<string | null>(null);

  // Keep transform available to the async runner without re-triggering it.
  const view = useRef({ vx, vy, zoom });
  view.current = { vx, vy, zoom };

  // Pull the next request when idle.
  useEffect(() => {
    if (!active && queueLen > 0) startNext();
  }, [active, queueLen, startNext]);

  useEffect(() => {
    if (!active || runningId.current === active.id) return;
    runningId.current = active.id;
    void run(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function center(id: string | undefined): { x: number; y: number } | null {
    if (!id) return null;
    const n = getNode(id);
    if (!n) return null;
    const w = n.measured?.width ?? 200;
    const h = n.measured?.height ?? 100;
    const { vx: tx, vy: ty, zoom: z } = view.current;
    return {
      x: (n.position.x + w / 2) * z + tx,
      y: (n.position.y + h / 2) * z + ty,
    };
  }

  async function moveTo(pt: { x: number; y: number }, duration: number) {
    await animate(
      scope.current,
      { left: pt.x, top: pt.y },
      { duration, ease: "easeInOut" },
    );
  }

  async function run(plan: RequestPlan) {
    const forwardIds = [
      "external-client",
      ...(plan.ingressId ? [plan.ingressId] : []),
      plan.serviceId,
    ];
    const forwardPts = forwardIds
      .map(center)
      .filter((p): p is { x: number; y: number } => p !== null);

    if (forwardPts.length < 2) {
      finishActive(record(plan));
      runningId.current = null;
      return;
    }

    const labels = [
      plan.matchedRuleLabel ?? `→ ${plan.serviceName}`,
      plan.ingressId ? `→ ${plan.serviceName}` : plan.routeLabel,
      plan.routeLabel,
    ];

    setBlocked(false);
    setVisible(true);
    await moveTo(forwardPts[0], 0);

    // Forward through client → (ingress) → service.
    for (let i = 0; i < forwardPts.length - 1; i++) {
      setLabel(labels[i] ?? "");
      await moveTo(forwardPts[i + 1], SEG_MS);
    }

    const nodePt = center(plan.hostingNodeId);

    if (plan.blocked) {
      // Stop at the boundary toward the pod with a red X.
      const svcPt = forwardPts[forwardPts.length - 1];
      if (nodePt) {
        const mid = {
          x: svcPt.x + (nodePt.x - svcPt.x) * 0.45,
          y: svcPt.y + (nodePt.y - svcPt.y) * 0.45,
        };
        setLabel(plan.routeLabel);
        await moveTo(mid, SEG_MS);
      }
      setBlocked(true);
      setLabel(plan.blockReason ?? "Blocked");
      await wait(1100);
      setVisible(false);
      finishActive(record(plan));
      runningId.current = null;
      return;
    }

    // Reach the hosting node, flash the chosen pod.
    if (nodePt) {
      setLabel(plan.routeLabel);
      await moveTo(nodePt, SEG_MS);
      if (plan.chosenPodUid) hitPod(plan.chosenPodUid);
      setLabel(`${plan.chosenPodName} handling request…`);
      await wait(300);
    }

    // Response path back to the client.
    const backPts = nodePt ? [nodePt, ...forwardPts.slice().reverse()] : forwardPts.slice().reverse();
    for (let i = 0; i < backPts.length - 1; i++) {
      setLabel("response ←");
      await moveTo(backPts[i + 1], SEG_MS);
    }

    setLabel(`✓ completed in ${plan.latencyMs}ms`);
    await wait(450);
    setVisible(false);
    finishActive(record(plan));
    runningId.current = null;
  }

  function record(plan: RequestPlan) {
    return {
      id: plan.id,
      target: plan.ingressId
        ? plan.matchedRuleLabel ?? plan.serviceName
        : `svc/${plan.serviceName}`,
      podName: plan.chosenPodName,
      latencyMs: plan.latencyMs,
      blocked: plan.blocked,
      blockReason: plan.blockReason,
      timestamp: Date.now(),
    };
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        ref={scope}
        className="absolute"
        style={{ left: 0, top: 0, transform: "translate(-50%, -50%)" }}
      >
        {blocked ? (
          <div className="grid h-6 w-6 place-items-center rounded-full bg-status-failed shadow-glow">
            <X className="h-4 w-4 text-white" />
          </div>
        ) : (
          <div className="h-3.5 w-3.5 rounded-full bg-kube-400 shadow-[0_0_12px_2px_rgba(77,157,255,0.9)]" />
        )}
        {label && (
          <div
            className={`absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold shadow-lg ${
              blocked
                ? "border-status-failed/50 bg-status-failed/20 text-status-failed"
                : "border-panel-600 bg-panel-850/95 text-slate-200"
            }`}
          >
            {label}
          </div>
        )}
      </div>
    </div>
  );
}
