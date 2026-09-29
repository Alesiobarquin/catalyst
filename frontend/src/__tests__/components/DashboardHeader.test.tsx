import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";

describe("DashboardHeader", () => {
  it("renders heading and subtitle", () => {
    render(<DashboardHeader />);

    expect(
      screen.getByRole("heading", { name: "Signal Dashboard" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Multi-factor confluence analysis · Engine: Gemini · Half-Kelly · VIX regime/i)
    ).toBeInTheDocument();
  });
});
