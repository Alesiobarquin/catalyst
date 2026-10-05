import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_THEME,
  THEME_BOOTSTRAP_SCRIPT,
  THEME_STORAGE_KEY,
  isTheme,
} from "@/lib/theme-config";
import {
  getCurrentTheme,
  getServerTheme,
  restoreSavedTheme,
  setTheme,
  useTheme,
} from "@/lib/theme-store";

function resetThemeDom() {
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.removeItem(THEME_STORAGE_KEY);
}

describe("theme-config", () => {
  it("accepts only explicit light/dark values and defaults to light", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(DEFAULT_THEME).toBe("light");
    expect(getServerTheme()).toBe("light");
  });

  it("emits a constant bootstrap script that only accepts saved light/dark values", () => {
    expect(THEME_BOOTSTRAP_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_BOOTSTRAP_SCRIPT).toContain('savedTheme === "light" || savedTheme === "dark"');
    expect(THEME_BOOTSTRAP_SCRIPT).not.toContain("matchMedia");
  });
});

describe("theme-store", () => {
  beforeEach(() => {
    resetThemeDom();
  });

  afterEach(() => {
    resetThemeDom();
    vi.restoreAllMocks();
  });

  it("defaults to light when nothing is saved", () => {
    expect(getCurrentTheme()).toBe("light");
    restoreSavedTheme();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("rejects invalid saved values and keeps light", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    restoreSavedTheme();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("restores a saved dark preference without reading OS preference", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    restoreSavedTheme();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(getCurrentTheme()).toBe("dark");
  });

  it("persists explicit choices and keeps the visible theme when storage throws", () => {
    setTheme("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    setItem.mockRestore();
  });

  it("survives throwing storage getters during restore", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => restoreSavedTheme()).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("light");
    getItem.mockRestore();
  });

  it("notifies subscribers and cleans up listeners on unsubscribe", () => {
    const { result, unmount } = renderHook(() => useTheme());
    expect(result.current).toBe("light");

    act(() => setTheme("dark"));
    expect(result.current).toBe("dark");

    unmount();
    act(() => setTheme("light"));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("applies cross-tab storage changes without rewriting storage", () => {
    const { result } = renderHook(() => useTheme());
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_STORAGE_KEY,
          newValue: "dark",
          storageArea: window.localStorage,
        })
      );
    });

    expect(result.current).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("restores light when storage is cleared in another tab", () => {
    document.documentElement.dataset.theme = "dark";
    const { result } = renderHook(() => useTheme());

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: null,
          newValue: null,
          storageArea: window.localStorage,
        })
      );
    });

    expect(result.current).toBe("light");
  });
});
