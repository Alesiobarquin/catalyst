"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  isTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme-config";

function readRootTheme(): Theme {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const value = document.documentElement.dataset.theme;
  return isTheme(value) ? value : DEFAULT_THEME;
}

export function getServerTheme(): Theme {
  return DEFAULT_THEME;
}

export function getCurrentTheme(): Theme {
  return readRootTheme();
}

function notifySubscribers() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  notifySubscribers();
}

export function setTheme(theme: Theme) {
  if (!isTheme(theme)) return;
  if (typeof window === "undefined") return;
  applyTheme(theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The current tab still changes theme when storage is unavailable.
  }
}

export function restoreSavedTheme() {
  if (typeof window === "undefined") {
    applyTheme(DEFAULT_THEME);
    return;
  }
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Keep the light HTML default when storage is unavailable.
  }
  applyTheme(isTheme(saved) ? saved : DEFAULT_THEME);
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    applyTheme(isTheme(event.newValue) ? event.newValue : DEFAULT_THEME);
  };

  window.addEventListener(THEME_CHANGE_EVENT, callback);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getCurrentTheme, getServerTheme);
}
