import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatsBar } from "@/components/dashboard/StatsBar";
import type { OrderStats } from "@/types";

const mockStats: OrderStats = {
  total_orders: 45,
  avg_conviction: 84.2,
  hit_target_count: 24,
  hit_stop_count: 8,
  active_count: 13,
  expired_count: 0,
  win_rate_percent: 75.0,
  realized_pnl_percent: 18.5,
  total_realized_pnl_usd: 12500.0,
  total_recommended_volume_usd: 540000.0,
  strategy_breakdown: { Supernova: 30, Scalper: 15, Follower: 0, Drifter: 0, Fallback: 0 },
  catalyst_breakdown: { SUPERNOVA: 30, SCALPER: 15, FOLLOWER: 0, DRIFTER: 0, UNKNOWN: 0 },
  daily_volume: [],
  conviction_distribution: [],
};

describe("StatsBar", () => {
  it("renders all four primary KPI stat cards", () => {
    render(<StatsBar stats={mockStats} />);

    expect(screen.getByText("Active signals")).toBeInTheDocument();
    expect(screen.getByText("Avg confidence")).toBeInTheDocument();
    expect(screen.getByText("Win rate")).toBeInTheDocument();
    expect(screen.getByText("Stop rate")).toBeInTheDocument();
  });

  it("formats total orders and active counts accurately", () => {
    render(<StatsBar stats={mockStats} />);

    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("13 currently open")).toBeInTheDocument();
  });

  it("calculates and formats win rate when closed trades exist", () => {
    render(<StatsBar stats={mockStats} />);

    // 24 / (24 + 8) = 75%
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("24 of 32 closed")).toBeInTheDocument();
  });

  it("handles zero closed trades gracefully with fallback placeholder", () => {
    const zeroStats: OrderStats = {
      ...mockStats,
      hit_target_count: 0,
      hit_stop_count: 0,
      active_count: 10,
    };

    render(<StatsBar stats={zeroStats} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("No closed positions")).toBeInTheDocument();
    expect(screen.getByText("No risk events")).toBeInTheDocument();
  });

  it("formats average confidence correctly", () => {
    render(<StatsBar stats={mockStats} />);

    expect(screen.getByText("84/100")).toBeInTheDocument();
    expect(screen.getByText("out of 100")).toBeInTheDocument();
  });
});
