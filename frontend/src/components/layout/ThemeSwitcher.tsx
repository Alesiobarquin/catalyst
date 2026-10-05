"use client";

import { useLayoutEffect } from "react";
import { getCurrentTheme, restoreSavedTheme, setTheme, useTheme } from "@/lib/theme-store";

export function ThemeSwitcher() {
  const theme = useTheme();

  useLayoutEffect(() => {
    restoreSavedTheme();
  }, []);

  return (
    <button
      type="button"
      role="switch"
      aria-label="Dark mode"
      aria-checked={theme === "dark"}
      className="theme-switch"
      onClick={() => setTheme(getCurrentTheme() === "dark" ? "light" : "dark")}
    >
      <span className="theme-switch-label-light">Light</span>
      <span className="theme-switch-track" aria-hidden="true">
        <span className="theme-switch-thumb" />
      </span>
      <span className="theme-switch-label-dark">Dark</span>
    </button>
  );
}
