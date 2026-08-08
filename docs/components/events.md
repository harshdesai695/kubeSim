# Events

**Folder:** `src/components/events/` — `EventsPanel.tsx`

## What it is

The **cluster event feed** — a chronological list of `Normal`/`Warning` events emitted by controllers and
actions (Scheduled, SuccessfulCreate, FailedScheduling, RollingUpdate, Preempting, RequestBlocked, etc.).
Mirrors `kubectl get events`.

## How to use

Toggle the Events panel from the top bar (it shows an unread count). Each event has a type, reason,
message, and involved object.

Events are appended by `useClusterStore.pushEvent(...)` from actions and the reconcile loop; the panel
reads `events` from [`useClusterStore`](../stores/useClusterStore.md). The same data is available in the
terminal via `kubectl get events`.
</content>
