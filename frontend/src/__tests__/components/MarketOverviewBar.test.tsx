import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MarketOverviewBar } from "@/components/dashboard/MarketOverviewBar";
import type { MarketQuote } from "@/types";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getMarketBenchmarks: vi.fn(),
}));

const mockQuotes: MarketQuote[] = [
  {
    ticker: "SPY",
    price: 520.5,
    change: 3.25,
    change_percent: 0.63,
    day_low: 518.2,
    day_high: 521.8,
    volume: 65000000,
  },
  {
    ticker: "QQQ",
    price: 445.2,
    change: -2.1,
    change_percent: -0.47,
    day_low: 443.5,
    day_high: 447.0,
    volume: 42000000,
  },
  {
    ticker: "DIA",
    price: 390.0,
    change: 0.0,
    change_percent: 0.0,
    day_low: 389.0,
    day_high: 391.0,
    volume: 12000000,
  },
  {
    ticker: "IWM",
    price: 205.8,
    change: 1.5,
    change_percent: 0.74,
    day_low: 203.8,
    day_high: 206.5,
    volume: 25000000,
  },
];

describe("MarketOverviewBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders header ribbon and all initial benchmark asset cards", () => {
    render(<MarketOverviewBar initialQuotes={mockQuotes} />);

    expect(screen.getByText("Market Benchmarks")).toBeInTheDocument();
    expect(screen.getByTitle("Live quote refresh available")).toBeInTheDocument();
    expect(screen.getByText("SPY")).toBeInTheDocument();
    expect(screen.getByText("S&P 500")).toBeInTheDocument();
    expect(screen.getByText("QQQ")).toBeInTheDocument();
    expect(screen.getByText("Nasdaq 100")).toBeInTheDocument();
    expect(screen.getByText("DIA")).toBeInTheDocument();
    expect(screen.getByText("Dow 30")).toBeInTheDocument();
    expect(screen.getByText("IWM")).toBeInTheDocument();
    expect(screen.getByText("Russell 2000")).toBeInTheDocument();
  });

  it("formats positive price changes with plus sign and high/low ranges", () => {
    render(<MarketOverviewBar initialQuotes={mockQuotes} />);

    expect(screen.getByText("+0.63%")).toBeInTheDocument();
    expect(screen.getByText("$520.50")).toBeInTheDocument();
    expect(screen.getByText("$518.20")).toBeInTheDocument();
    expect(screen.getByText("$521.80")).toBeInTheDocument();
    expect(screen.getAllByText("Day low")).toHaveLength(4);
    expect(screen.getAllByText("Day high")).toHaveLength(4);
  });

  it("formats negative price changes appropriately", () => {
    render(<MarketOverviewBar initialQuotes={mockQuotes} />);

    expect(screen.getByText("-0.47%")).toBeInTheDocument();
    expect(screen.getByText("$445.20")).toBeInTheDocument();
  });

  it("formats flat change without sign prefix", () => {
    render(<MarketOverviewBar initialQuotes={mockQuotes} />);

    expect(screen.getByText("0.00%")).toBeInTheDocument();
    expect(screen.getByText("$390.00")).toBeInTheDocument();
  });

  it("labels public benchmark quotes as scan-time values", () => {
    render(<MarketOverviewBar initialQuotes={mockQuotes} asOf="2026-10-05T14:00:00Z" />);

    expect(screen.getByTitle("Captured with the public scan")).toBeInTheDocument();
    expect(screen.getByText(/At scan ·/)).toBeInTheDocument();
    expect(screen.queryByTitle("Refresh benchmark quotes")).not.toBeInTheDocument();
  });

  it("triggers benchmark refresh when Sync button is clicked", async () => {
    const updatedQuotes: MarketQuote[] = [
      {
        ...mockQuotes[0],
        price: 525.0,
        change: 7.75,
        change_percent: 1.5,
      },
    ];

    vi.mocked(api.getMarketBenchmarks).mockResolvedValueOnce(updatedQuotes);

    render(<MarketOverviewBar initialQuotes={mockQuotes} />);

    const syncBtn = screen.getByTitle("Refresh benchmark quotes");
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(api.getMarketBenchmarks).toHaveBeenCalledTimes(1);
      expect(screen.getByText("$525.00")).toBeInTheDocument();
      expect(screen.getByText("+1.50%")).toBeInTheDocument();
    });
  });

  it("maintains current quotes if refresh fails", async () => {
    vi.mocked(api.getMarketBenchmarks).mockRejectedValueOnce(new Error("Network timeout"));

    render(<MarketOverviewBar initialQuotes={mockQuotes} />);

    const syncBtn = screen.getByTitle("Refresh benchmark quotes");
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(api.getMarketBenchmarks).toHaveBeenCalledTimes(1);
      // Keeps previous quote
      expect(screen.getByText("$520.50")).toBeInTheDocument();
    });
  });
});
