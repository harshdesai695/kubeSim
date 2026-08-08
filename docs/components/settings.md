# Settings

**Folder:** `src/components/settings/` — `SettingsPanel.tsx`

## What it is

The **settings panel** (opened from the top bar) for personalization and cluster snapshot I/O.

## What you can do

- **Theme** — switch dark/light (applied live by [`ThemeApplier`](./system.md)).
- **Simulation speed** — scale the reconcile cadence.
- **Terminal font size**.
- **CLI-echo toggle** — whether GUI actions echo their `kubectl` command.
- **Export snapshot** — download the whole cluster as a JSON file.
- **Import snapshot** — load a cluster from a JSON file (see [Sample scenarios](../samples.md)).
- **Reset cluster** — clear all objects.

## How to use

Open **Settings** in the top bar. Export/Import call
`useClusterStore.exportSnapshot()` / `importSnapshot(data)`; preferences persist via
[`useSettingsStore`](../stores/useSettingsStore.md). Open/closed state lives in
[`useUIStore`](../stores/useUIStore.md).
</content>
