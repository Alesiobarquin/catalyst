import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SignalsPage from "@/app/signals/page";
import * as api from "@/lib/api";
import type { ValidatedSignal, SignalStats } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  getSignals: vi.fn(),
  getSignalStats: vi.fn(),
  searchTickers: vi.fn().mockResolvedValue([]),
  getQuote: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/components/signals/LiveStreamBanner", () => ({
  LiveStreamBanner: () => <div data-testid="live-stream-banner">LiveStreamBanner</div>,
}));

const mockStats: SignalStats = {
  total_signals: 42,
  clean_count: 36,
  trap_count: 6,
  trap_rate_percent: 14.3,
  avg_conviction: 82.5,
  high_conviction_count: 28,
  catalyst_breakdown: { SQUEEZE: 20, CLINICAL_TRIAL: 15, INSIDER_BUY: 7 },
};

const mockSignal: ValidatedSignal = {
  id: 1,
  ticker: "NVDA",
  timestamp_utc: "2026-09-28T20:00:00.000Z",
  conviction_score: 88,
  catalyst_type: "SUPERNOVA",
  rationale: "High short interest of 28% with surging volume.",
  confluence_sources: ["squeeze", "whale"],
  is_trap: false,
  key_risks: ["Earnings volatility", "Market pullback"],
};

describe("SignalsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getSignalStats).mockResolvedValue(mockStats);
  });

  it("renders empty state when no signals are found without filters", async () => {
    vi.mocked(api.getSignals).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      per_page: 15,
    });

    const page = await SignalsPage({
      searchParams: Promise.resolve({}),
    });

    render(page);

    expect(screen.getByRole("heading", { level: 1, name: "Validated signals" })).toBeInTheDocument();
    expect(screen.getByText("No validated signals yet")).toBeInTheDocument();
    expect(screen.getByTestId("live-stream-banner")).toBeInTheDocument();
    expect(screen.getByText("Total Pipeline Signals")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders empty filtered state with reset button when filters are active", async () => {
    vi.mocked(api.getSignals).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      per_page: 15,
    });

    const page = await SignalsPage({
      searchParams: Promise.resolve({ ticker: "TSLA", catalyst_type: "SQUEEZE" }),
    });

    render(page);

    expect(screen.getByText("No matching signals found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reset all filters/i })).toBeInTheDocument();
  });

  it("renders signals table and key risks when signals are available", async () => {
    vi.mocked(api.getSignals).mockResolvedValueOnce({
      items: [mockSignal],
      total: 1,
      page: 1,
      per_page: 15,
    });

    const page = await SignalsPage({
      searchParams: Promise.resolve({}),
    });

    render(page);

    expect(screen.getAllByText("NVDA").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/High short interest of 28%/i)).toBeInTheDocument();
    expect(screen.getByText(/Earnings volatility/i)).toBeInTheDocument();
    expect(screen.getByText(/Market pullback/i)).toBeInTheDocument();
  });

  it("forwards parsed searchParams to getSignals correctly", async () => {
    vi.mocked(api.getSignals).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 2,
      per_page: 15,
    });

    const page = await SignalsPage({
      searchParams: Promise.resolve({
        page: "2",
        catalyst_type: "SQUEEZE",
        min_conviction: "75",
        is_trap: "true",
        ticker: "AAPL",
        date_range: "7d",
      }),
    });

    render(page);

    expect(api.getSignals).toHaveBeenCalledWith({
      page: 2,
      per_page: 15,
      catalyst_type: "SQUEEZE",
      min_conviction: 75,
      is_trap: true,
      ticker: "AAPL",
      date_range: "7d",
    });
  });
});
