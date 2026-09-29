import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { KellySimulator } from "@/components/analytics/KellySimulator";

describe("KellySimulator Component", () => {
  it("renders with default metrics and positive edge banner", () => {
    render(<KellySimulator />);

    expect(screen.getByText("Half-Kelly Quantitative Sizer")).toBeInTheDocument();
    expect(screen.getByText("ENGINE SIMULATOR")).toBeInTheDocument();
    expect(screen.getByText(/POSITIVE EDGE/)).toBeInTheDocument();
    expect(screen.getByText("Recommended Size")).toBeInTheDocument();
    expect(screen.getByText("Capital at Risk")).toBeInTheDocument();
    expect(screen.getByText("Half-Kelly Fraction")).toBeInTheDocument();
  });

  it("updates conviction score and calculations when slider changes", () => {
    render(<KellySimulator />);

    const convictionSlider = screen.getByLabelText("AI Conviction Score Slider");
    expect(convictionSlider).toHaveValue("75");

    fireEvent.change(convictionSlider, { target: { value: "85" } });
    expect(convictionSlider).toHaveValue("85");
    expect(screen.getByText("85/100 (85%)")).toBeInTheDocument();
  });

  it("displays negative edge when edge is non-positive", () => {
    render(<KellySimulator />);

    const convictionSlider = screen.getByLabelText("AI Conviction Score Slider");
    const payoffSlider = screen.getByLabelText("Reward to Risk Ratio Slider");

    // Setting conviction to 50% and payoff to 1.0 gives f* = (1*0.5 - 0.5)/1 = 0
    fireEvent.change(convictionSlider, { target: { value: "50" } });
    fireEvent.change(payoffSlider, { target: { value: "1.0" } });

    expect(screen.getByText(/NEGATIVE EDGE: NO ALLOCATION/)).toBeInTheDocument();
  });

  it("has accessible sliders with labels", () => {
    render(<KellySimulator />);

    expect(screen.getByLabelText("Account Equity Slider")).toBeInTheDocument();
    expect(screen.getByLabelText("AI Conviction Score Slider")).toBeInTheDocument();
    expect(screen.getByLabelText("Reward to Risk Ratio Slider")).toBeInTheDocument();
    expect(screen.getByLabelText("Stop Loss Percentage Slider")).toBeInTheDocument();
    expect(screen.getByLabelText("Max Portfolio Risk Cap Slider")).toBeInTheDocument();
  });
});
