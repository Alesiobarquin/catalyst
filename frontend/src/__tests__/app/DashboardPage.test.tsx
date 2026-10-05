import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DashboardPage from "@/app/page";
import * as api from "@/lib/api";
import type { TradeOrder, OrderStats, MarketQuote } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  getOrders: vi.fn(),
  getOrderStats: vi.fn(),
  getMarketBenchmarks: vi.fn(),
  searchTickers: vi.fn().mockResolvedValue([]),
  getQuote: vi.fn().mockResolvedValue(null),
  getQuotesBatch: vi.fn().mockResolvedValue({}),
  getBatchPerformance: vi.fn().mockResolvedValue({}),
}));

const mockStats: OrderStats = {
  total_orders: 15,
  avg_conviction: 84.2,
  hit_target_count: 9,
  hit_stop_count: 2,
  active_count: 4,
  win_rate_percent: 81.8,
  total_realized_pnl_usd: 1250.75,
  expired_count: 0,
  realized_pnl_percent: 18.2,
  strategy_breakdown: { Supernova: 6, Scalper: 4, Follower: 3, Drifter: 2, Fallback: 0 },
  catalyst_breakdown: { SUPERNOVA: 6, SCALPER: 4, FOLLOWER: 3, DRIFTER: 2, UNKNOWN: 0 },
  daily_volume: [{ date: "2026-09-28", count: 15 }],
  conviction_distribution: [{ bucket: "80–89", count: 15 }],
};

const mockBenchmarks: MarketQuote[] = [
  { ticker: "SPY", price: 540.25, change_percent: 0.45 },
  { ticker: "QQQ", price: 475.10, change_percent: -0.22 },
  { ticker: "DIA", price: 395.0, change_percent: 0.12 },
  { ticker: "IWM", price: 215.3, change_percent: 1.15 },
];

const mockOrder: TradeOrder = {
  id: 101,
  ticker: "NVDA",
  timestamp_utc: "2026-09-28T14:30:00.000Z",
  action: "BUY",
  strategy_used: "Supernova",
  recommended_size_usd: 5000,
  limit_price: 120.0,
  stop_loss: 114.0,
  target_price: 135.0,
  conviction_score: 92,
  catalyst_type: "SUPERNOVA",
  rationale: "Rapid short squeeze breakout.",
  regime_vix: 15.4,
  spy_above_200sma: true,
  status: "ACTIVE",
};

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getOrderStats).mockResolvedValue(mockStats);
    vi.mocked(api.getMarketBenchmarks).mockResolvedValue(mockBenchmarks);
  });

  it("renders dashboard header, benchmarks, stats, filters, and orders", async () => {
    vi.mocked(api.getOrders).mockResolvedValueOnce({
      items: [mockOrder],
      total: 1,
      page: 1,
      per_page: 15,
    });

    const page = await DashboardPage({
      searchParams: Promise.resolve({}),
    });

    render(page);

    expect(screen.getByRole("heading", { level: 1, name: /Signal Dashboard/i })).toBeInTheDocument();
    expect(screen.getByText("SPY")).toBeInTheDocument();
    expect(screen.getByText("QQQ")).toBeInTheDocument();
    expect(screen.getByText("Recommendations")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("NVDA")).toBeInTheDocument();
  });

  it("passes default query parameters when searchParams is empty", async () => {
    vi.mocked(api.getOrders).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      per_page: 15,
    });

    const page = await DashboardPage({
      searchParams: Promise.resolve({}),
    });

    render(page);

    expect(api.getOrders).toHaveBeenCalledWith({
      page: 1,
      per_page: 15,
      strategy: "all",
      date_range: "30d",
      status: undefined,
      ticker: undefined,
    });
  });

  it("correctly parses active filters and forwards them to getOrders", async () => {
    vi.mocked(api.getOrders).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 2,
      per_page: 15,
    });

    const page = await DashboardPage({
      searchParams: Promise.resolve({
        page: "2",
        strategy: "Supernova",
        date_range: "7d",
        status: "ACTIVE",
        ticker: "NVDA",
      }),
    });

    render(page);

    expect(api.getOrders).toHaveBeenCalledWith({
      page: 2,
      per_page: 15,
      strategy: "Supernova",
      date_range: "7d",
      status: "ACTIVE",
      ticker: "NVDA",
    });
  });
});
