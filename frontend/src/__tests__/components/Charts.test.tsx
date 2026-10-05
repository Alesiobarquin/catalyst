import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  StrategyBreakdown,
  ConvictionHistogram,
  SignalTimeline,
  PerformanceSummary,
} from "@/components/analytics/Charts";
import type { OrderStats } from "@/types";

const mockOrderStats: OrderStats = {
  total_orders: 15,
  avg_conviction: 78.4,
  hit_target_count: 8,
  hit_stop_count: 2,
  active_count: 5,
  strategy_breakdown: {
    Supernova: 6,
    Scalper: 4,
    Follower: 3,
    Drifter: 2,
    Fallback: 0,
  },
  catalyst_breakdown: {
    SUPERNOVA: 6,
    SCALPER: 4,
    FOLLOWER: 3,
    DRIFTER: 2,
    UNKNOWN: 0,
  },
  daily_volume: [
    { date: "2026-09-27", count: 7 },
    { date: "2026-09-28", count: 8 },
  ],
  conviction_distribution: [
    { bucket: "50–59", count: 2 },
    { bucket: "60–69", count: 3 },
    { bucket: "70–79", count: 4 },
    { bucket: "80–89", count: 5 },
    { bucket: "90–100", count: 1 },
  ],
  win_rate_percent: 80.0,
  total_realized_pnl_usd: 1450.25,
};

describe("Analytics Charts", () => {
  describe("StrategyBreakdown", () => {
    it("renders strategy names and counts", () => {
      render(<StrategyBreakdown stats={mockOrderStats} />);

      expect(screen.getByText("Strategy breakdown")).toBeInTheDocument();
      expect(screen.getByText("Supernova")).toBeInTheDocument();
      expect(screen.getByText("Scalper")).toBeInTheDocument();
      expect(screen.getByText("Follower")).toBeInTheDocument();
      expect(screen.getByText("Drifter")).toBeInTheDocument();
      expect(screen.getByText("6 · 40%")).toBeInTheDocument();
    });

    it("renders empty state message when no strategies have values", () => {
      const emptyStats: OrderStats = {
        ...mockOrderStats,
        strategy_breakdown: {
          Supernova: 0,
          Scalper: 0,
          Follower: 0,
          Drifter: 0,
          Fallback: 0,
        },
      };

      render(<StrategyBreakdown stats={emptyStats} />);
      expect(screen.getByText("No strategy data in this snapshot.")).toBeInTheDocument();
    });
  });

  describe("ConvictionHistogram", () => {
    it("renders all conviction distribution buckets", () => {
      render(<ConvictionHistogram stats={mockOrderStats} />);

      expect(screen.getByText("Conviction score distribution")).toBeInTheDocument();
      expect(screen.getByText("50–59")).toBeInTheDocument();
      expect(screen.getByText("60–69")).toBeInTheDocument();
      expect(screen.getByText("70–79")).toBeInTheDocument();
      expect(screen.getByText("80–89")).toBeInTheDocument();
      expect(screen.getByText("90–100")).toBeInTheDocument();
    });
  });

  describe("SignalTimeline", () => {
    it("renders signals per day title and dates", () => {
      render(<SignalTimeline stats={mockOrderStats} />);

      expect(screen.getByText("Recommendations by day")).toBeInTheDocument();
      expect(screen.getByText(/Sep 27 – Sep 28/)).toBeInTheDocument();
      expect(
        screen.getByTitle("2026-09-27: 7 recommendations")
      ).toBeInTheDocument();
      expect(
        screen.getByTitle("2026-09-28: 8 recommendations")
      ).toBeInTheDocument();
    });
  });

  describe("PerformanceSummary", () => {
    it("renders win rate and performance metrics", () => {
      render(<PerformanceSummary stats={mockOrderStats} />);

      expect(screen.getByText("Performance")).toBeInTheDocument();
      expect(screen.getByText("Modeled win rate")).toBeInTheDocument();
      // 8 / (8 + 2) = 80.0%
      expect(screen.getByText("80.0%")).toBeInTheDocument();
      expect(screen.getByText("Avg. conviction")).toBeInTheDocument();
      expect(screen.getByText("78/100")).toBeInTheDocument();
      expect(screen.getByText("Targets reached")).toBeInTheDocument();
      expect(screen.getAllByText("8").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Stops reached")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("Open now")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("Total recommendations")).toBeInTheDocument();
      expect(screen.getByText("15")).toBeInTheDocument();
    });

    it("renders dash for win rate when 0 closed trades exist", () => {
      const zeroClosedStats: OrderStats = {
        ...mockOrderStats,
        hit_target_count: 0,
        hit_stop_count: 0,
      };

      render(<PerformanceSummary stats={zeroClosedStats} />);
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("explains when a chart has no observations", () => {
      const noOrders: OrderStats = {
        ...mockOrderStats,
        total_orders: 0,
        strategy_breakdown: { Supernova: 0, Scalper: 0, Follower: 0, Drifter: 0, Fallback: 0 },
        conviction_distribution: [],
        daily_volume: [],
      };

      render(
        <>
          <StrategyBreakdown stats={noOrders} />
          <ConvictionHistogram stats={noOrders} />
          <SignalTimeline stats={noOrders} />
        </>
      );

      expect(screen.getByText("No strategy data in this snapshot.")).toBeInTheDocument();
      expect(screen.getByText("No conviction data in this snapshot.")).toBeInTheDocument();
      expect(screen.getByText("No recommendation history in this snapshot.")).toBeInTheDocument();
    });
  });
});
