import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignalRow } from "@/components/signals/SignalRow";
import type { ValidatedSignal, MarketQuote } from "@/types";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getQuote: vi.fn(),
}));

const mockSignal: ValidatedSignal = {
  id: 1,
  ticker: "NVDA",
  timestamp_utc: new Date(Date.now() - 3600 * 1000).toISOString(),
  conviction_score: 92,
  catalyst_type: "SUPERNOVA",
  rationale: "High short interest squeeze with institutional call sweeps and volume expansion.",
  is_trap: false,
  confluence_sources: ["squeeze", "whale"],
  key_risks: ["Upcoming Fed rate decision", "Semiconductor sector volatility"],
  suggested_entry_zone: "128.00 - 131.00",
  suggested_stop: 122.50,
};

const mockQuote: MarketQuote = {
  ticker: "NVDA",
  price: 135.5,
  change: 4.25,
  change_percent: 3.24,
  day_low: 131.2,
  day_high: 136.0,
  volume: 45000000,
};

describe("SignalRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders collapsed signal row with basic info and confluence tags", () => {
    render(<SignalRow signal={mockSignal} isLast={false} />);

    expect(screen.getByText("NVDA")).toBeInTheDocument();
    expect(screen.getByText("92")).toBeInTheDocument();
    expect(screen.getByText("Short-covering event detected")).toBeInTheDocument();
    expect(screen.getByText("squeeze")).toBeInTheDocument();
    expect(screen.getByText("whale")).toBeInTheDocument();
    expect(screen.getByText("Ticker")).toBeInTheDocument();
    expect(screen.getByText("Conviction")).toBeInTheDocument();
    expect(screen.getByText("Rationale")).toBeInTheDocument();
    expect(screen.queryByText(/Upcoming Fed rate decision/)).not.toBeInTheDocument();
  });

  it("renders trap indicator when is_trap is true", () => {
    const trapSignal: ValidatedSignal = {
      ...mockSignal,
      is_trap: true,
    };

    render(<SignalRow signal={trapSignal} isLast={false} />);

    expect(screen.getByLabelText("Trap detected")).toBeInTheDocument();
  });

  it("expands to reveal full rationale, suggested zones, and risks when clicked", () => {
    render(<SignalRow signal={mockSignal} isLast={false} />);

    const expandBtn = screen.getByRole("button", { name: "Show signal rationale" });
    expect(expandBtn).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(expandBtn);

    expect(expandBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Entry Zone: 128.00 - 131.00")).toBeInTheDocument();
    expect(screen.getByText("Suggested Stop: 122.5")).toBeInTheDocument();
    expect(screen.getByText("Upcoming Fed rate decision")).toBeInTheDocument();
    expect(screen.getByText("Semiconductor sector volatility")).toBeInTheDocument();
  });

  it("fetches and displays live quote details when Check Live Quote is clicked", async () => {
    vi.mocked(api.getQuote).mockResolvedValueOnce(mockQuote);

    render(<SignalRow signal={mockSignal} isLast={false} />);

    // Expand first
    const expandBtn = screen.getByRole("button", { name: "Show signal rationale" });
    fireEvent.click(expandBtn);

    const quoteBtn = screen.getByText("Check Live Quote");
    fireEvent.click(quoteBtn);

    await waitFor(() => {
      expect(screen.getByText("$135.50")).toBeInTheDocument();
      expect(screen.getByText("+4.25 (+3.24%)")).toBeInTheDocument();
      expect(screen.getByText(/Day: \$131\.20 – \$136\.00/)).toBeInTheDocument();
      expect(screen.getByText(/Vol: 45,000,000/)).toBeInTheDocument();
    });
  });

  it("handles live quote fetch failure gracefully", async () => {
    vi.mocked(api.getQuote).mockRejectedValueOnce(new Error("Network error"));

    render(<SignalRow signal={mockSignal} isLast={false} />);

    const expandBtn = screen.getByRole("button", { name: "Show signal rationale" });
    fireEvent.click(expandBtn);

    const quoteBtn = screen.getByText("Check Live Quote");
    fireEvent.click(quoteBtn);

    await waitFor(() => {
      expect(screen.getByText("Quote data temporarily unavailable.")).toBeInTheDocument();
    });
  });

  it("renders confluence multiplier badge when confluence_count >= 2", () => {
    const multiSignal: ValidatedSignal = {
      ...mockSignal,
      confluence_count: 3,
    };

    render(<SignalRow signal={multiSignal} isLast={false} />);
    expect(screen.getByLabelText("3 Confluence Sources")).toBeInTheDocument();
    expect(screen.getByText("3x")).toBeInTheDocument();
  });
});
