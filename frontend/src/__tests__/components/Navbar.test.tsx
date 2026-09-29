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
  });

  it("renders brand logo, platform title, and subtitle", () => {
    render(<Navbar />);

    expect(screen.getByText("CATALYST")).toBeInTheDocument();
    expect(screen.getByText("Signal intelligence platform")).toBeInTheDocument();
  });

  it("renders all core navigation links", () => {
    render(<Navbar />);

    const dashboardLink = screen.getByText("Dashboard").closest("a");
    const analyticsLink = screen.getByText("Analytics").closest("a");
    const signalsLink = screen.getByText("Signals").closest("a");
    const settingsLink = screen.getByText("Settings").closest("a");

    expect(dashboardLink).toHaveAttribute("href", "/");
    expect(analyticsLink).toHaveAttribute("href", "/analytics");
    expect(signalsLink).toHaveAttribute("href", "/signals");
    expect(settingsLink).toHaveAttribute("href", "/settings");
  });

  it("highlights Dashboard when on root route", () => {
    mockPathname = "/";
    render(<Navbar />);

    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink).toHaveStyle({ borderBottom: "2px solid #0EA5E9" });
  });

  it("highlights Signals when on /signals route", () => {
    mockPathname = "/signals";
    render(<Navbar />);

    const signalsLink = screen.getByText("Signals").closest("a");
    expect(signalsLink).toHaveStyle({ borderBottom: "2px solid #0EA5E9" });
  });

  it("renders static live indicator badge", () => {
    render(<Navbar />);

    expect(screen.getByText("LIVE")).toBeInTheDocument();
  });
});
