import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { THEME_STORAGE_KEY } from "@/lib/theme-config";

function resetThemeDom() {
  document.documentElement.dataset.theme = "light";
  window.localStorage.removeItem(THEME_STORAGE_KEY);
}

describe("ThemeSwitcher", () => {
  beforeEach(() => {
    resetThemeDom();
  });

  afterEach(() => {
    resetThemeDom();
  });

  it("renders from the stable light server snapshot without browser globals", () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    try {
      Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
      Object.defineProperty(globalThis, "document", { configurable: true, value: undefined });
      const markup = renderToString(<ThemeSwitcher />);
      expect(markup).toContain('aria-checked="false"');
      expect(markup).toContain("Light");
      expect(markup).toContain("Dark");
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    }
  });

  it("exposes a stable Dark mode switch with Light/Dark labels", () => {
    render(<ThemeSwitcher />);
    const toggle = screen.getByRole("switch", { name: "Dark mode" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
  });

  it("toggles exactly once on click and persists the choice", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);
    const toggle = screen.getByRole("switch", { name: "Dark mode" });

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("toggles with Space and Enter without double-firing", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);
    const toggle = screen.getByRole("switch", { name: "Dark mode" });
    toggle.focus();

    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
