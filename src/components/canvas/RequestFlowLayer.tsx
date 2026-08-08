"use client";

import { useEffect, useRef, useState } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import { useFlowStore, type RequestPlan } from "@/store/useFlowStore";

/**
 * RequestFlowLayer — visualizes the API request path across the canvas.
 *
 * Rendered inside <ReactFlow> so it can read node positions and the live
 * viewport transform. For each queued request it lights up the full route
 * client → (ingress) → service → node → pod as a glowing "marching-ants" line
 * with a fast comet head, then a green response path back to the client.
 * Blocked requests stop at the boundary in red with an ✗. Hides immediately
 * whenever there is no active request (e.g. after a cluster restart).
 */

type Pt = { x: number; y: number };
type Mode = "forward" | "back" | "blocked";

const SEG_MS = 320; // per-hop comet travel
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function RequestFlowLayer() {
  const { getNode } = useReactFlow();
  const { x: vx, y: vy, zoom } = useViewport();
  const active = useFlowStore((s) => s.active);
  const queueLen = useFlowStore((s) => s.queue.length);
  const startNext = useFlowStore((s) => s.startNext);
  const hitPod = useFlowStore((s) => s.hitPod);
  const finishActive = useFlowStore((s) => s.finishActive);

  const layerRef = useRef<HTMLDivElement>(null);
  const cometRef = useRef<SVGCircleElement>(null);
  const runningId = useRef<string | null>(null);

  const [visible, setVisible] = useState(false);
  const [points, setPoints] = useState<Pt[]>([]);
  const [mode, setMode] = useState<Mode>("forward");
  const [label, setLabel] = useState("");

  const view = useRef({ vx, vy, zoom });
  view.current = { vx, vy, zoom };

  // Pull the next request when idle.
  useEffect(() => {
    if (!active && queueLen > 0) startNext();
  }, [active, queueLen, startNext]);

  // Reactively hide when nothing is active (covers restart / clear).
  useEffect(() => {
    if (!active) {
      runningId.current = null;
      setVisible(false);
      setPoints([]);
      setLabel("");
    }
  }, [active]);

  useEffect(() => {
    if (!active || runningId.current === active.id) return;
    runningId.current = active.id;
    void run(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function center(id: string | undefined): Pt | null {
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

  // Locate the actual pod card in the DOM so the path reaches the pod itself.
  function podCenter(uid: string | undefined): Pt | null {
    if (!uid || !layerRef.current) return null;
    const el = document.querySelector(`[data-pod-uid="${uid}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const base = layerRef.current.getBoundingClientRect();
    return {
      x: r.left - base.left + r.width / 2,
      y: r.top - base.top + r.height / 2,
    };
  }

  function animateAttr(el: SVGCircleElement, from: Pt, to: Pt, duration: number) {
    return new Promise<void>((resolve) => {
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const e = t * (2 - t); // easeOut
        el.setAttribute("cx", String(from.x + (to.x - from.x) * e));
        el.setAttribute("cy", String(from.y + (to.y - from.y) * e));
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // Move the comet head along an ordered list of points (fast, linear).
  async function travel(pts: Pt[]) {
    const el = cometRef.current;
    if (!el || pts.length === 0) return;
    el.setAttribute("cx", String(pts[0].x));
    el.setAttribute("cy", String(pts[0].y));
    for (let i = 1; i < pts.length; i++) {
      await animateAttr(el, pts[i - 1], pts[i], SEG_MS);
    }
  }

  async function run(plan: RequestPlan) {
    const forwardPts = [
      "external-client",
      ...(plan.ingressId ? [plan.ingressId] : []),
      plan.serviceId,
    ]
      .map(center)
      .filter((p): p is Pt => p !== null);

    if (forwardPts.length < 2) {
      finishActive(record(plan));
      runningId.current = null;
      return;
    }

    const nodePt = center(plan.hostingNodeId);
    const podPt = podCenter(plan.chosenPodUid);

    setVisible(true);

    if (plan.blocked) {
      const svcPt = forwardPts[forwardPts.length - 1];
      const stopPt = nodePt
        ? {
            x: svcPt.x + (nodePt.x - svcPt.x) * 0.45,
            y: svcPt.y + (nodePt.y - svcPt.y) * 0.45,
          }
        : svcPt;
      const path = [...forwardPts, stopPt];
      setMode("blocked");
      setPoints(path);
      setLabel(plan.routeLabel);
      await travel(path);
      setLabel(plan.blockReason ?? "Blocked");
      await wait(900);
      setVisible(false);
      setPoints([]);
      finishActive(record(plan));
      runningId.current = null;
      return;
    }

    const forward = [...forwardPts];
    if (nodePt) forward.push(nodePt);
    if (podPt) forward.push(podPt);

    // Forward path (blue).
    setMode("forward");
    setPoints(forward);
    setLabel(plan.matchedRuleLabel ?? plan.routeLabel);
    await travel(forward);

    if (plan.chosenPodUid) hitPod(plan.chosenPodUid);
    setLabel(`${plan.chosenPodName} handling request…`);
    await wait(220);

    // Response path (green), reversed.
    const back = forward.slice().reverse();
    setMode("back");
    setPoints(back);
    setLabel(`response ← ${plan.chosenPodName}`);
    await travel(back);

    setLabel(`✓ completed in ${plan.latencyMs}ms`);
    await wait(320);
    setVisible(false);
    setPoints([]);
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

  const stroke =
    mode === "blocked" ? "#ef4444" : mode === "back" ? "#22c55e" : "#4d9dff";
  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  // Anchor the status label at the highest (top-most) point on the route.
  const labelAnchor = points.length
    ? points.reduce((a, b) => (b.y < a.y ? b : a))
    : null;

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 150ms" }}
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {points.length >= 2 && (
          <>
            {/* Soft glow underlay */}
            <polyline
              points={polyPoints}
              fill="none"
              stroke={stroke}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.18}
            />
            {/* Flowing marching-ants line */}
            <polyline
              points={polyPoints}
              fill="none"
              stroke={stroke}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="7 9"
              className={mode === "back" ? "flow-dash-rev" : "flow-dash"}
            />
          </>
        )}
        {points.length >= 1 && (
          <circle
            ref={cometRef}
            r={mode === "blocked" ? 7 : 5}
            fill={stroke}
            style={{ filter: `drop-shadow(0 0 6px ${stroke})` }}
          />
        )}
      </svg>

      {label && labelAnchor && (
        <div
          className={`absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold shadow-lg ${
            mode === "blocked"
              ? "border-status-failed/50 bg-status-failed/20 text-status-failed"
              : mode === "back"
                ? "border-status-running/50 bg-status-running/15 text-status-running"
                : "border-panel-600 bg-panel-850/95 text-slate-200"
          }`}
          style={{ left: labelAnchor.x, top: labelAnchor.y - 8 }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
