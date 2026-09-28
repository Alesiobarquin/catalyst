import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatCompact,
  calcRiskReward,
  deriveStatus,
  derivePnlPct,
  cn,
} from "@/lib/utils";
import type { TradeOrder } from "@/types";

describe("utils", () => {
  describe("formatCurrency", () => {
    it("formats standard values correctly", () => {
      expect(formatCurrency(1234.56)).toBe("$1,234.56");
    });
    it("handles zero", () => {
      expect(formatCurrency(0)).toBe("$0.00");
    });
    it("handles negative numbers", () => {
      expect(formatCurrency(-500)).toBe("-$500.00");
    });
    it("handles large numbers", () => {
      expect(formatCurrency(1000000)).toBe("$1,000,000.00");
    });
    it("handles different decimals", () => {
      expect(formatCurrency(12.3456, 4)).toBe("$12.3456");
    });
  });

  describe("formatCompact", () => {
    it("compacts millions", () => {
      expect(formatCompact(1500000)).toBe("1.5M");
    });
    it("compacts thousands", () => {
      expect(formatCompact(1500)).toBe("1.5K");
    });
    it("handles small numbers", () => {
      expect(formatCompact(500)).toBe("500");
    });
  });

  describe("calcRiskReward", () => {
    const baseOrder: TradeOrder = {
      id: 1,
      ticker: "AAPL",
      timestamp_utc: new Date().toISOString(),
      action: "BUY",
      strategy_used: "Supernova",
      recommended_size_usd: 1000,
      limit_price: 100,
      stop_loss: 90,
      target_price: 120,
      rationale: "Test",
      conviction_score: 80,
      catalyst_type: "SUPERNOVA",
      regime_vix: 20,
      spy_above_200sma: true,
      status: "ACTIVE",
    };

    it("calculates standard risk/reward", () => {
      // Risk = 10 (100 - 90)
      // Reward = 20 (120 - 100)
      // R/R = 2.0
      expect(calcRiskReward(baseOrder)).toBe(2);
    });

    it("handles risk <= 0 gracefully", () => {
      const badOrder = { ...baseOrder, stop_loss: 100 }; // Risk = 0
      expect(calcRiskReward(badOrder)).toBe(0);
      
      const worseOrder = { ...baseOrder, stop_loss: 110 }; // Risk = -10
      expect(calcRiskReward(worseOrder)).toBe(0);
    });
  });

  describe("deriveStatus", () => {
    const order: TradeOrder = {
      id: 1,
      ticker: "AAPL",
      timestamp_utc: new Date().toISOString(),
      action: "BUY",
      strategy_used: "Supernova",
      recommended_size_usd: 1000,
      limit_price: 100,
      stop_loss: 90,
      target_price: 120,
      rationale: "Test",
      conviction_score: 80,
      catalyst_type: "SUPERNOVA",
      regime_vix: 20,
      spy_above_200sma: true,
      status: "ACTIVE",
    };

    it("returns ACTIVE if no current price", () => {
      expect(deriveStatus(order)).toBe("ACTIVE");
    });

    it("returns HIT_TARGET when price is >= target", () => {
      expect(deriveStatus(order, 120)).toBe("HIT_TARGET");
      expect(deriveStatus(order, 125)).toBe("HIT_TARGET");
    });

    it("returns HIT_STOP when price is <= stop loss", () => {
      expect(deriveStatus(order, 90)).toBe("HIT_STOP");
      expect(deriveStatus(order, 85)).toBe("HIT_STOP");
    });

    it("returns ACTIVE when price is between stop and target", () => {
      expect(deriveStatus(order, 105)).toBe("ACTIVE");
    });
  });

  describe("derivePnlPct", () => {
    const order: TradeOrder = {
      id: 1,
      ticker: "AAPL",
      timestamp_utc: new Date().toISOString(),
      action: "BUY",
      strategy_used: "Supernova",
      recommended_size_usd: 1000,
      limit_price: 100,
      stop_loss: 90,
      target_price: 120,
      rationale: "Test",
      conviction_score: 80,
      catalyst_type: "SUPERNOVA",
      regime_vix: 20,
      spy_above_200sma: true,
      status: "ACTIVE",
    };

    it("returns undefined if no current price", () => {
      expect(derivePnlPct(order)).toBeUndefined();
    });

    it("calculates positive PnL percentage", () => {
      expect(derivePnlPct(order, 110)).toBe(10.00);
    });

    it("calculates negative PnL percentage", () => {
      expect(derivePnlPct(order, 90)).toBe(-10.00);
    });
  });

  describe("cn", () => {
    it("merges classes correctly", () => {
      expect(cn("p-4", "p-2")).toBe("p-2");
      expect(cn("text-red-500", undefined, "bg-blue-500")).toBe("text-red-500 bg-blue-500");
    });
  });
});
