"use client";

import { useEffect } from "react";
import { TopNav } from "@/components/layout/TopNav";
import { ClusterCanvas } from "@/components/canvas/ClusterCanvas";
import { SimTerminal } from "@/components/terminal/SimTerminal";
import { DetailDrawer } from "@/components/drawer/DetailDrawer";
import { EventsPanel } from "@/components/events/EventsPanel";
import { WorkloadsPanel } from "@/components/workloads/WorkloadsPanel";
import { ReconcileEngine } from "@/components/system/ReconcileEngine";
import { ThemeApplier } from "@/components/system/ThemeApplier";
import { OnboardingTour } from "@/components/system/OnboardingTour";
import { ScenariosMenu } from "@/components/scenarios/ScenariosMenu";
import { Walkthrough } from "@/components/scenarios/Walkthrough";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { useClusterStore } from "@/store/useClusterStore";

/**
 * Workspace — the top-level "control room" shell.
 */
export function Workspace() {
  // Collapse the docked panels on small screens for a usable mobile layout.
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth >= 768) return;
    const ui = useClusterStore.getState().ui;
    if (ui.workloadsOpen) useClusterStore.getState().toggleWorkloads();
    if (ui.terminalOpen) useClusterStore.getState().toggleTerminal();
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-panel-950">
      <ReconcileEngine />
      <ThemeApplier />
      <TopNav />

      <div className="relative flex min-h-0 flex-1">
        {/* Workloads dock */}
        <WorkloadsPanel />

        {/* Canvas + terminal stack */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <ClusterCanvas />
            <Walkthrough />
          </div>
          <SimTerminal />
        </div>

        {/* Slide-in panels */}
        <EventsPanel />
        <DetailDrawer />
        <ScenariosMenu />
        <SettingsPanel />
      </div>

      <OnboardingTour />
    </div>
  );
}
