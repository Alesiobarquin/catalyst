import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { KellySimulator } from "@/components/analytics/KellySimulator";

describe("KellySimulator Component", () => {
  it("renders with default metrics and positive edge banner", () => {
    render(<KellySimulator />);

    expect(screen.getByText("Half-Kelly sizing calculator")).toBeInTheDocument();
    expect(screen.getByText("Interactive model")).toBeInTheDocument();
    expect(screen.getByText("Positive modeled edge")).toBeInTheDocument();
    expect(screen.getByText("Illustrative allocation")).toBeInTheDocument();
    expect(screen.getByText("Capital at risk")).toBeInTheDocument();
    expect(screen.getByText("Half-Kelly fraction")).toBeInTheDocument();
  });

  it("updates conviction score and calculations when slider changes", () => {
    render(<KellySimulator />);

    const convictionSlider = screen.getByLabelText("Assumed win probability");
    expect(convictionSlider).toHaveValue("75");

    fireEvent.change(convictionSlider, { target: { value: "85" } });
    expect(convictionSlider).toHaveValue("85");
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("$9,875.00")).toBeInTheDocument();
  });

  it("displays negative edge when edge is non-positive", () => {
    render(<KellySimulator />);

    const convictionSlider = screen.getByLabelText("Assumed win probability");
    const payoffSlider = screen.getByLabelText("Reward / risk ratio");

    // Setting conviction to 50% and payoff to 1.0 gives f* = (1*0.5 - 0.5)/1 = 0
    fireEvent.change(convictionSlider, { target: { value: "50" } });
    fireEvent.change(payoffSlider, { target: { value: "1.0" } });

    expect(screen.getByText("No modeled edge · No allocation")).toBeInTheDocument();
    expect(screen.getAllByText("$0.00")).toHaveLength(3);
  });

  it("has accessible sliders with labels", () => {
    render(<KellySimulator />);

    expect(screen.getByLabelText("Account equity")).toBeInTheDocument();
    expect(screen.getByLabelText("Assumed win probability")).toBeInTheDocument();
    expect(screen.getByLabelText("Reward / risk ratio")).toBeInTheDocument();
    expect(screen.getByLabelText("Stop distance")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximum account risk")).toBeInTheDocument();
  });
});
