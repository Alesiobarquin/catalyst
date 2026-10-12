import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignalTable } from "@/components/signals/SignalTable";
import type { ValidatedSignal } from "@/types";

const signal: ValidatedSignal = {
  analysis_method: "gemini_grounded",
  analysis_model: "gemini-3.8-flash",
  id: 12,
  ticker: "NVDA",
  timestamp_utc: "2026-10-05T14:00:00Z",
  conviction_score: 78,
  catalyst_type: "SUPERNOVA",
  rationale: "Volume and options activity confirm the catalyst.",
  is_trap: false,
  confluence_sources: ["squeeze", "whale"],
  confluence_count: 2,
  key_risks: ["Earnings volatility"],
};

describe("SignalTable", () => {
  it("labels every public-facing signal column for assistive technology", () => {
    render(<SignalTable signals={[signal]} />);

    expect(screen.getByRole("table", { name: "Validated signals" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Ticker",
      "Time",
      "Conviction",
      "Catalyst",
      "Rationale",
      "Sources",
    ]);
    expect(screen.getByRole("cell", { name: "Conviction 78 out of 100" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Ticker NVDA" })).toBeInTheDocument();
  });
  it("reveals the supplied provenance and risk in the keyboard-operable research disclosure", () => {
    render(<SignalTable signals={[signal]} asOf="2026-10-05T14:04:00Z" />);
    const disclosure = screen.getByRole("button", { name: "Show rationale for NVDA" });
    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("gemini_grounded")).toBeInTheDocument();
    expect(screen.getByText("gemini-3.8-flash")).toBeInTheDocument();
    expect(screen.getByText("Earnings volatility")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show quote at scan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check Live Quote" })).not.toBeInTheDocument();
  });
});
