import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Navbar } from "@/components/layout/Navbar";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn() }),
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
    expect(screen.getByText("Market signal research")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Dark mode" })).toBeInTheDocument();
  });

  it("renders all core navigation links including How it works", () => {
    render(<Navbar />);

    const dashboardLink = screen.getByRole("link", { name: "Overview" });
    const analyticsLink = screen.getByRole("link", { name: "Outcomes" });
    const signalsLink = screen.getByRole("link", { name: "Signals" });
    const howItWorksLink = screen.getByRole("link", { name: "How it works" });
    const settingsLink = screen.getByRole("link", { name: "Settings" });

    expect(dashboardLink).toHaveAttribute("href", "/");
    expect(analyticsLink).toHaveAttribute("href", "/analytics");
    expect(signalsLink).toHaveAttribute("href", "/signals");
    expect(howItWorksLink).toHaveAttribute("href", "/architecture");
    expect(settingsLink).toHaveAttribute("href", "/settings");
  });

  it("marks Overview as the current page on the root route", () => {
    mockPathname = "/";
    render(<Navbar />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Signals" })).not.toHaveAttribute("aria-current");
  });

  it("marks How it works as the current page on /architecture", () => {
    mockPathname = "/architecture";
    render(<Navbar />);

    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute("aria-current", "page");
  });

  it("marks Signals as the current page on /signals", () => {
    mockPathname = "/signals";
    render(<Navbar />);

    expect(screen.getByRole("link", { name: "Signals" })).toHaveAttribute("aria-current", "page");
  });
});
