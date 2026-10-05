import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AnalyticsPage from "@/app/analytics/page";
import * as api from "@/lib/api";
import type { OrderStats } from "@/types";

vi.mock("@/lib/api", () => ({
  getOrderStats: vi.fn(),
}));

const mockFullStats: OrderStats = {
  total_orders: 50,
  avg_conviction: 85.4,
  hit_target_count: 32,
  hit_stop_count: 8,
  active_count: 10,
  win_rate_percent: 80.0,
  total_realized_pnl_usd: 12450.0,
  expired_count: 0,
  realized_pnl_percent: 24.5,
  total_recommended_volume_usd: 250000,
  strategy_breakdown: { Supernova: 20, Scalper: 15, Follower: 10, Drifter: 5, Fallback: 0 },
  catalyst_breakdown: { SUPERNOVA: 20, SCALPER: 15, FOLLOWER: 10, DRIFTER: 5, UNKNOWN: 0 },
  conviction_distribution: [
    { bucket: "50–59", count: 5 },
    { bucket: "60–69", count: 10 },
    { bucket: "70–79", count: 15 },
    { bucket: "80–89", count: 12 },
    { bucket: "90–100", count: 8 },
  ],
  daily_volume: [{ date: "2026-09-28", count: 12 }],
};

const mockEmptyStats: OrderStats = {
  total_orders: 0,
  avg_conviction: 0,
  hit_target_count: 0,
  hit_stop_count: 0,
  active_count: 0,
  win_rate_percent: undefined,
  total_realized_pnl_usd: 0,
  expired_count: 0,
  realized_pnl_percent: 0,
  total_recommended_volume_usd: 0,
  strategy_breakdown: { Supernova: 0, Scalper: 0, Follower: 0, Drifter: 0, Fallback: 0 },
  catalyst_breakdown: { SUPERNOVA: 0, SCALPER: 0, FOLLOWER: 0, DRIFTER: 0, UNKNOWN: 0 },
  conviction_distribution: [],
  daily_volume: [],
};

describe("AnalyticsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders analytics header, KPI ribbon, charts, and simulator", async () => {
    vi.mocked(api.getOrderStats).mockResolvedValueOnce(mockFullStats);

    const page = await AnalyticsPage();
    render(page);

    expect(screen.getByRole("heading", { level: 1, name: "Analytics" })).toBeInTheDocument();
    expect(screen.getAllByText("Total recommendations").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("50").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Modeled win rate").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/80/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Avg. conviction").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("85/100").length).toBeGreaterThanOrEqual(1);

    // Strategy & Catalyst breakdown
    expect(screen.getByText("Catalyst type breakdown")).toBeInTheDocument();
    expect(screen.getAllByText("Supernova").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Scalper").length).toBeGreaterThanOrEqual(1);

    // Half-Kelly simulator presence
    expect(screen.getByText("Half-Kelly sizing calculator")).toBeInTheDocument();
  });

  it("handles empty stats gracefully", async () => {
    vi.mocked(api.getOrderStats).mockResolvedValueOnce(mockEmptyStats);

    const page = await AnalyticsPage();
    render(page);

    expect(screen.getByRole("heading", { level: 1, name: "Analytics" })).toBeInTheDocument();
    expect(screen.getByText("No catalyst data yet.")).toBeInTheDocument();
    expect(screen.getAllByText("No stop/target outcomes yet").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("No recommendations yet").length).toBeGreaterThanOrEqual(1);
  });
});
