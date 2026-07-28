"use client";

import { TopNav } from "@/components/layout/TopNav";
import { ClusterCanvas } from "@/components/canvas/ClusterCanvas";
import { SimTerminal } from "@/components/terminal/SimTerminal";
import { DetailDrawer } from "@/components/drawer/DetailDrawer";
import { EventsPanel } from "@/components/events/EventsPanel";
import { WorkloadsPanel } from "@/components/workloads/WorkloadsPanel";
import { ReconcileEngine } from "@/components/system/ReconcileEngine";

/**
 * Workspace — the top-level "control room" shell.
 *
 * Layout regions:
 *  - Top: navigation bar
 *  - Left (collapsible): workloads panel
 *  - Center: cluster canvas (React Flow)
 *  - Bottom (collapsible): simulated terminal
 *  - Right (slide-in): object detail drawer / events feed
 */
export function Workspace() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-panel-950">
      <ReconcileEngine />
      <TopNav />

      <div className="relative flex min-h-0 flex-1">
        {/* Workloads dock */}
        <WorkloadsPanel />

        {/* Canvas + terminal stack */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <ClusterCanvas />
          </div>
          <SimTerminal />
        </div>

        {/* Slide-in panels */}
        <EventsPanel />
        <DetailDrawer />
      </div>
    </div>
  );
}
