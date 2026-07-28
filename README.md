# kubeSim — Interactive Kubernetes Simulator

<p align="center">
  <strong>A fully client-side, web-based Kubernetes simulator that teaches and visualizes how a real cluster behaves — no real cluster, backend, or containers required.</strong>
</p>

<p align="center">
  <a href="https://github.com/harshdesai695/kubeSim">GitHub Repository</a>
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

---

## Features

- **Interactive cluster canvas** (pan/zoom) built on React Flow — control plane, worker nodes, pods,
  services, ingress, and a dedicated storage zone.
- **Live controllers** running on a continuous reconcile loop:
  - Scheduler (least-loaded placement)
  - ReplicaSet self-healing
  - Deployment rolling updates & rollback
  - StatefulSet ordered pods with stable per-pod storage
  - DaemonSet (one pod per node, auto add/remove)
  - Job / CronJob (with a simulated, accelerable clock)
  - HorizontalPodAutoscaler (load-slider driven)
- **API-flow visualization** — fire a request and watch an animated packet travel
  Client → Ingress → Service → Pod → back, with kube-proxy routing decisions, NetworkPolicy blocking,
  and latency read-outs.
- **Config & storage** — ConfigMaps, Secrets (masked + base64), PersistentVolumes/Claims with
  smallest-fit binding and dynamic provisioning.
- **Namespaces** with full canvas/panel/CLI filtering, plus a global **Selector Inspector**.
- **Full `kubectl`-style terminal** — `get/describe/create/apply -f/delete/scale/set image/rollout/
  expose/label/annotate/logs/exec/top/config`, with `-o yaml|json|wide`, command history, Tab
  completion, and multi-line manifest paste. GUI actions echo their equivalent command.
- **Detail drawer** for every object — YAML manifest, logs, exec, status, relationships, annotations.
- **Guided scenarios** — one-click presets (Self-Healing, Rolling Update, Load Balancing, Autoscaling,
  Full Stack) with narrated walkthroughs.
- **Configurable** — light/dark theme, simulation speed, terminal font size, CLI-echo toggle, and
  **snapshot export/import** to save or share a cluster as JSON.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript (strict) |
| Styling | Tailwind CSS |
| State | Zustand (a single in-memory "etcd" store) |
| Animation | Framer Motion |
| Canvas / graph | React Flow (`@xyflow/react`) |
| YAML editor | Monaco Editor (`@monaco-editor/react`) |
| Icons | Lucide |

Everything runs client-side; persistence (settings, snapshots) uses `localStorage` / file download only.

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
   kubectl logs <pod>            # ↑/↓ history · Tab completes
   kubesim curl svc/<service>    # animate the request flow on the canvas
   ```

   Paste a multi-line YAML manifest into the terminal to open the **apply** dialog.
7. **Configure & save** — open **Settings** (top bar) to switch theme, adjust simulation speed, toggle
   the CLI-echo, or **export/import** the whole cluster as a JSON snapshot.

---

## Project Structure

```
src/
├── app/                 # Next.js App Router entry (layout, page, globals.css)
├── components/
│   ├── canvas/          # React Flow canvas, custom nodes, request-flow animation
│   ├── drawer/          # Object detail drawer (YAML / logs / exec / status)
│   ├── workloads/       # Left panel: create & manage every object type
│   ├── terminal/        # kubectl-style shell
│   ├── scenarios/       # Guided scenarios menu + walkthrough
│   ├── settings/        # Settings panel (theme, speed, snapshot I/O)
│   ├── events/          # Events feed
│   ├── layout/          # Top nav + workspace shell
│   └── system/          # Reconcile engine, theme applier, onboarding tour
├── lib/                 # cli parser, manifest/yaml, scheduler, network, cron, storage
└── store/               # Zustand stores (cluster "etcd", flow, terminal, settings, ui)
```

---

## Scope & Limitations

- **Not a real orchestrator** — no real containers, networking, DNS, or images. All behavior is
  simulated for teaching purposes ("visual fidelity over literal accuracy").
- Pods render nested inside their Node boxes, so some connectors attach to the hosting node while the
  detail drawer and pod highlights convey the exact pod relationship.
- Simplified subsets of some semantics (cron parsing, NetworkPolicy, scheduling, latency).
- Out of scope: RBAC enforcement, CRDs/Operators, VPA, multi-cluster, real kubeconfig/port-forward.

---

## License

This project is provided as-is for educational and demonstration purposes.

---

<p align="center">
  Built with Next.js, React Flow, Zustand, and Framer Motion · 
  <a href="https://github.com/harshdesai695/kubeSim">github.com/harshdesai695/kubeSim</a>
</p>
