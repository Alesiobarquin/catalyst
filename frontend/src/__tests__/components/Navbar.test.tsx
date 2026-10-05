import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Navbar } from "@/components/layout/Navbar";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("Navbar", () => {
  beforeEach(() => {
    mockPathname = "/";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ api: "ok", database: "ok", redis: "ok", engine: "UP", ready: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("renders the typographic Catalyst brand, theme switch, and subtitle", () => {
    render(<Navbar />);

    expect(screen.getByRole("link", { name: "Catalyst home" })).toBeInTheDocument();
    expect(screen.getByText("Catalyst")).toBeInTheDocument();
    expect(screen.getByText("Signal intelligence platform")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Dark mode" })).toBeInTheDocument();
  });

  it("renders all core navigation links including How It Works", () => {
    render(<Navbar />);

    const dashboardLink = screen.getByText("Dashboard").closest("a");
    const analyticsLink = screen.getByText("Analytics").closest("a");
    const signalsLink = screen.getByText("Signals").closest("a");
    const howItWorksLink = screen.getByText("How It Works").closest("a");
    const settingsLink = screen.getByText("Settings").closest("a");

    expect(dashboardLink).toHaveAttribute("href", "/");
    expect(analyticsLink).toHaveAttribute("href", "/analytics");
    expect(signalsLink).toHaveAttribute("href", "/signals");
    expect(howItWorksLink).toHaveAttribute("href", "/architecture");
    expect(settingsLink).toHaveAttribute("href", "/settings");
  });

  it("marks Dashboard as the current page on the root route", () => {
    mockPathname = "/";
    render(<Navbar />);

    expect(screen.getByText("Dashboard").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Signals").closest("a")).not.toHaveAttribute("aria-current");
  });

  it("marks How It Works as the current page on /architecture", () => {
    mockPathname = "/architecture";
    render(<Navbar />);

    expect(screen.getByText("How It Works").closest("a")).toHaveAttribute("aria-current", "page");
  });

  it("marks Signals as the current page on /signals", () => {
    mockPathname = "/signals";
    render(<Navbar />);

    expect(screen.getByText("Signals").closest("a")).toHaveAttribute("aria-current", "page");
  });
});
