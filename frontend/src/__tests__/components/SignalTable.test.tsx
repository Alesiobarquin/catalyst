import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignalTable } from "@/components/signals/SignalTable";
import type { ValidatedSignal } from "@/types";

const signal: ValidatedSignal = {
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
});
