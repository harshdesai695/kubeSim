# kubeSim — Interactive Kubernetes Simulator

<p align="center">
  <strong>A fully client-side, web-based Kubernetes simulator that teaches and visualizes how a real cluster behaves — no real cluster, backend, or containers required.</strong>
</p>

<p align="center">
  <a href="https://kubesim.netlify.app/">Live Demo</a>
</p>

---

## What is kubeSim?

**kubeSim** is a learning and visualization tool that recreates the behavior of a Kubernetes cluster
entirely in your browser. Every "node", "pod", and "container" is a simulated in-memory state object —
there is no real container runtime, no server, and no authentication. The goal is **conceptual and
visual fidelity** to real Kubernetes: you can *see* the cluster on an interactive canvas, *cause* changes
and *watch* their effects animate in real time, and drive everything through a `kubectl`-style terminal.

It's ideal for:

- Learning Kubernetes concepts without spinning up a real cluster.
- Demonstrating controller behavior (self-healing, rolling updates, autoscaling) live.
- Visualizing the request path from Ingress → Service → Pod.
- Teaching `kubectl` in a safe, resettable sandbox.
> **Full component documentation** lives in [`docs/`](./docs/README.md) — one page per module and
> component explaining what it is and how to use it. Start with the
> [Architecture Overview](./docs/architecture.md).

---

## Features

### Core

- **Interactive cluster canvas** (pan/zoom) built on React Flow — control plane, worker nodes, pods,
  services, ingress, and a dedicated storage zone.
- **Live controllers** running on a continuous reconcile loop:
  - Scheduler with a real **filter → score → bind** pipeline + **preemption**
  - ReplicaSet self-healing
  - Deployment rolling updates & rollback
  - StatefulSet ordered pods with stable per-pod storage
  - DaemonSet (one pod per node, auto add/remove)
  - Job / CronJob (with a simulated, accelerable clock)
  - HorizontalPodAutoscaler (load-slider driven, CPU/memory + stabilization window)
- **API-flow visualization** — fire a request and watch an animated packet travel
  Client → Ingress → Service → Pod → back, with kube-proxy routing decisions, NetworkPolicy blocking,
  and latency read-outs. A **Traffic Simulator** and continuous "auto traffic" make it work for any
  scenario.
- **Config & storage** — ConfigMaps, Secrets (masked + base64), PersistentVolumes/Claims with
  smallest-fit binding and dynamic provisioning.
- **Namespaces** with full canvas/panel/CLI filtering, plus a global **Selector Inspector**.
- **Full `kubectl`-style terminal** — `get/describe/create/apply -f/delete/scale/set image/rollout/
  expose/label/annotate/logs/exec/top/config`, `-o yaml|json|wide`, history, Tab completion, and
  multi-line manifest paste. GUI actions echo their equivalent command.
- **Detail drawer** for every object — YAML manifest, logs, exec, status, relationships, annotations.
- **Guided scenarios** and **snapshot export/import** to save or share a cluster as JSON.
- **RBAC & Security** — ServiceAccounts, Roles/ClusterRoles, RoleBindings/ClusterRoleBindings,
  `kubectl auth can-i`, a canvas **permission overlay** ("Inspect as" a subject), plus **ResourceQuota**
  and **LimitRange** admission.
- **Scheduling realism & pod health** — resource **requests/limits & QoS**, **taints/tolerations**,
  node affinity / anti-affinity / topology spread, **PriorityClass + preemption**, **PodDisruptionBudget**,
  and **liveness/readiness probes** (failing liveness auto-restarts; failing readiness drops from
  endpoints).
- **Extensibility** — **CustomResourceDefinitions** and **Custom Resources** (they appear in the CLI and
  GUI), driven by a built-in sample **Database operator** that reconciles owned children and
  garbage-collects them.
- **Networking depth** — cluster **DNS** (`svc.ns.svc.cluster.local`), **EndpointSlices**, and full
  **pod-to-pod NetworkPolicy** evaluation (`kubesim curl --from=<pod>`).
- **Storage & autoscaling depth** — PV **reclaim policies** (Retain/Delete/Recycle), **PVC resize**,
  **volume snapshots** & restore, **VerticalPodAutoscaler**, richer HPA, and ConfigMap **hot-reload**.
- **Control-plane realism & multi-cluster** — cascade **garbage collection**, **finalizers** that block
  deletion, `cordon`/`uncordon`/`drain`, `rollout restart`, and **multiple cluster contexts** you switch
  with the top-bar selector or `kubectl config use-context`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js](https://nextjs.org/) 14 (App Router), React 18, TypeScript 5 (strict) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) 3 (CSS-variable theming for light/dark) |
| State | [Zustand](https://github.com/pmndrs/zustand) 5 — a single in-memory "etcd" store (+ `persist` for settings) |
| Animation | [Framer Motion](https://www.framer.com/motion/) 11 |
| Canvas / graph | [React Flow](https://reactflow.dev/) (`@xyflow/react` 12) |
| YAML editor | [Monaco Editor](https://microsoft.github.io/monaco-editor/) (`@monaco-editor/react` 4) |
| Icons | [Lucide](https://lucide.dev/) (`lucide-react`) |
| Tooling | ESLint (`eslint-config-next`), PostCSS, Autoprefixer |

Everything runs **client-side**; persistence (settings, snapshots) uses `localStorage` / file download
only. There is no backend, database, or container runtime.

See [`docs/architecture.md`](./docs/architecture.md) for how these layers interact and the reconcile
loop that drives the simulation.

---

## Getting Started

### Prerequisites

- **Node.js 18+** (developed on Node 24)
- **npm** (or your preferred package manager)

### Install & run

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev

# 3. Open the app
# http://localhost:3000
```

### Other scripts

```bash
npm run build   # production build
npm run start   # serve the production build
npm run lint    # run ESLint
```

---

## How to Use

1. **First run** — an onboarding tour introduces the Canvas, Terminal, Drawer, and Scenarios menu.
2. **Try a scenario** — click **Scenarios** in the top bar and load, e.g., *Full Stack Demo*. A preset
   cluster is created and a step-by-step walkthrough guides you.
3. **Build it yourself** — open the **Workloads** panel (left) → **New** to create a Deployment,
   Service, ConfigMap, PVC, StatefulSet, Job, CronJob, or HPA.
4. **Watch it live** — pods schedule across nodes, self-heal when killed, and roll out on image updates.
5. **Inspect anything** — click any object on the canvas or in a panel to open its detail drawer
   (YAML, logs, exec, status, relationships).
6. **Use the terminal** — everything is scriptable with `kubectl`-style commands:

   ```bash
   kubectl get pods -o wide
   kubectl scale deployment web --replicas=5
   kubectl set image deployment/web nginx=nginx:1.27
   kubectl rollout undo deployment/web
   kubectl rollout restart deployment/web
   kubectl auth can-i get pods --as=alice     # RBAC check
   kubectl get crds                           # extensibility
   kubectl cordon worker-2                     # control-plane ops
   kubectl config use-context <cluster>        # multi-cluster
   kubesim curl web.default.svc.cluster.local  # DNS + animate the flow
   ```

   Paste a multi-line YAML manifest into the terminal to open the **apply** dialog.
   See [`docs/libraries/cli.md`](./docs/libraries/cli.md) for the full command reference.
7. **Configure & save** — open **Settings** (top bar) to switch theme, adjust simulation speed, toggle
   the CLI-echo, or **export/import** the whole cluster as a JSON snapshot.

---

## Project Structure

```
src/
├── app/                 # Next.js App Router entry (layout, page, globals.css)
├── components/
│   ├── canvas/          # React Flow canvas, custom nodes, request-flow animation, traffic sim
│   ├── drawer/          # Object detail drawer (YAML / logs / exec / status / actions)
│   ├── workloads/       # Left panel: create & manage every object type
│   ├── terminal/        # kubectl-style shell
│   ├── scenarios/       # Guided scenarios menu + walkthrough
│   ├── settings/        # Settings panel (theme, speed, snapshot I/O)
│   ├── events/          # Events feed
│   ├── layout/          # Top nav (context/namespace) + workspace shell
│   └── system/          # Reconcile engine, theme applier, onboarding tour
├── lib/                 # cli, scheduler, network, operator, rbac, storage, cron, manifest, yaml, …
└── store/               # Zustand stores (cluster "etcd", flow, terminal, settings, ui) + types
docs/                    # Per-module & per-component documentation (see docs/README.md)
samples/                 # Importable cluster snapshots (JSON)
```

Each folder and module is documented in detail under [`docs/`](./docs/README.md):

- **Stores:** [useClusterStore](./docs/stores/useClusterStore.md) ·
  [useFlowStore](./docs/stores/useFlowStore.md) ·
  [useTerminalStore](./docs/stores/useTerminalStore.md) ·
  [useSettingsStore](./docs/stores/useSettingsStore.md) ·
  [useUIStore](./docs/stores/useUIStore.md) · [types](./docs/stores/types.md)
- **Libraries:** [cli](./docs/libraries/cli.md) · [scheduler](./docs/libraries/scheduler.md) ·
  [network](./docs/libraries/network.md) · [operator](./docs/libraries/operator.md) ·
  [rbac](./docs/libraries/rbac.md) · [storage](./docs/libraries/storage.md) ·
  [cron](./docs/libraries/cron.md) · [manifest](./docs/libraries/manifest.md) ·
  [yaml](./docs/libraries/yaml.md) · [workloads](./docs/libraries/workloads.md) ·
  [scenarios](./docs/libraries/scenarios.md) · [controlPlane](./docs/libraries/controlPlane.md) ·
  [selector](./docs/libraries/selector.md) · [status](./docs/libraries/status.md) ·
  [logs](./docs/libraries/logs.md) · [echo](./docs/libraries/echo.md) · [time](./docs/libraries/time.md)
- **Components:** [Canvas](./docs/components/canvas.md) ·
  [Canvas Nodes](./docs/components/canvas-nodes.md) · [Drawer](./docs/components/drawer.md) ·
  [Workloads](./docs/components/workloads.md) · [Terminal](./docs/components/terminal.md) ·
  [Scenarios](./docs/components/scenarios.md) · [Settings](./docs/components/settings.md) ·
  [Events](./docs/components/events.md) · [Layout](./docs/components/layout.md) ·
  [System](./docs/components/system.md)

---

## Scope & Limitations

- **Not a real orchestrator** — no real containers, networking, DNS, or images. All behavior is
  simulated for teaching purposes ("visual fidelity over literal accuracy").
- Pods render nested inside their Node boxes, so some connectors attach to the hosting node while the
  detail drawer and pod highlights convey the exact pod relationship.
- Simplified subsets of some semantics (cron parsing, NetworkPolicy, scheduling scoring, latency, YAML
  parsing). RBAC, CRDs/operators, VPA, snapshots, and multi-cluster are **simulated** (no real tokens,
  controllers, kubeconfig, or volumes).
- A few sub-features are intentionally deferred and noted in the docs (e.g. CoreDNS canvas box, Ingress
  TLS visuals, informer/watch feed, full `kubectl patch`/`edit` write-apply).

---

## License

This project is provided as-is for educational and demonstration purposes.

---

<p align="center">
  Built with Next.js, React Flow, Zustand, and Framer Motion · 
  <a href="https://github.com/harshdesai695/kubeSim">github.com/harshdesai695/kubeSim</a>
</p>
