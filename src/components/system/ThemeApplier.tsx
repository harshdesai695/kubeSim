"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/store/useSettingsStore";

/** Applies the selected theme to <html> (renders nothing). */
export function ThemeApplier() {
  const theme = useSettingsStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return null;
}
