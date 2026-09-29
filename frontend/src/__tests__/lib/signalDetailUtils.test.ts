import { describe, it, expect } from "vitest";
import {
  formatPrice,
  formatPercent,
  safe,
  orderToSignalDetail,
} from "@/lib/signalDetailUtils";
import type { TradeOrder } from "@/types";

describe("signalDetailUtils", () => {
  describe("formatPrice", () => {
    it("returns dash for null or undefined", () => {
      expect(formatPrice(null)).toBe("—");
      expect(formatPrice(undefined)).toBe("—");
    });

    it("formats valid prices with dollar sign and 2 decimals", () => {
      expect(formatPrice(125.5)).toBe("$125.50");
      expect(formatPrice(0)).toBe("$0.00");
      expect(formatPrice(1499.999)).toBe("$1500.00");
    });
  });

  describe("formatPercent", () => {
    it("returns dash for null or undefined", () => {
      expect(formatPercent(null)).toBe("—");
      expect(formatPercent(undefined)).toBe("—");
    });

    it("formats positive percent with plus sign", () => {
      expect(formatPercent(4.14)).toBe("+4.14%");
      expect(formatPercent(0)).toBe("+0.00%");
    });

    it("formats negative percent with unicode minus sign", () => {
      expect(formatPercent(-1.68)).toBe("−1.68%");
    });
  });

  describe("safe", () => {
    it("returns fallback for null, undefined, or empty string", () => {
      expect(safe(null)).toBe("—");
      expect(safe(undefined)).toBe("—");
      expect(safe("")).toBe("—");
      expect(safe("", "N/A")).toBe("N/A");
    });

    it("returns string representation of value", () => {
      expect(safe("AAPL")).toBe("AAPL");
      expect(safe(42)).toBe("42");
    });
  });

  describe("orderToSignalDetail", () => {
    const baseOrder: TradeOrder = {
      id: 42,
      ticker: "NVDA",
      action: "BUY",
      strategy_used: "Supernova",
      catalyst_type: "SUPERNOVA",
      limit_price: 120.0,
      stop_loss: 110.0,
      target_price: 140.0,
      recommended_size_usd: 10000.0,
      conviction_score: 85,
      timestamp_utc: "2026-09-28T14:30:00Z",
      rationale: "High short squeeze momentum with heavy call buying.\n\nInstitutional accumulation confirmed.",
      regime_vix: 16.5,
      spy_above_200sma: true,
      current_price: 126.0,
      pnl_pct: 5.0,
    };

    it("correctly maps basic order properties", () => {
      const detail = orderToSignalDetail(baseOrder);

      expect(detail.ticker).toBe("NVDA");
      expect(detail.action).toBe("BUY");
      expect(detail.status).toBe("Active");
      expect(detail.entryPrice).toBe(120.0);
      expect(detail.stopLoss).toBe(110.0);
      expect(detail.targetPrice).toBe(140.0);
      expect(detail.currentPrice).toBe(126.0);
      expect(detail.pnlPercent).toBe(5.0);
      expect(detail.signalId).toBe("SIG-42");
      expect(detail.thesis.bodyParagraphs).toHaveLength(2);
      expect(detail.thesis.bodyParagraphs[0]).toContain("High short squeeze");
    });

    it("maps RESOLVED_WIN status to Target hit", () => {
      const winOrder: TradeOrder = {
        ...baseOrder,
        status: "RESOLVED_WIN",
      };
      const detail = orderToSignalDetail(winOrder);
      expect(detail.status).toBe("Target hit");
    });

    it("maps RESOLVED_LOSS status to Stopped", () => {
      const lossOrder: TradeOrder = {
        ...baseOrder,
        status: "RESOLVED_LOSS",
      };
      const detail = orderToSignalDetail(lossOrder);
      expect(detail.status).toBe("Stopped");
    });

    it("maps EXPIRED status to Expired", () => {
      const expiredOrder: TradeOrder = {
        ...baseOrder,
        status: "EXPIRED",
      };
      const detail = orderToSignalDetail(expiredOrder);
      expect(detail.status).toBe("Expired");
    });

    it("derives confluence factors from VIX and SPY regime", () => {
      const detail = orderToSignalDetail(baseOrder);

      expect(detail.confluence.factors).toHaveLength(3);
      const smaFactor = detail.confluence.factors.find((f) =>
        f.source.includes("SPY vs 200SMA")
      );
      expect(smaFactor?.strength).toBe("HIGH");
      expect(smaFactor?.data).toBe("SPY above 200SMA");

      const vixFactor = detail.confluence.factors.find((f) =>
        f.source.includes("VIX regime")
      );
      expect(vixFactor?.strength).toBe("MODERATE"); // 16.5 is between 15 and 22
    });

    it("computes scenario parameters accurately", () => {
      const detail = orderToSignalDetail(baseOrder);

      expect(detail.risk.scenarios).toHaveLength(3);
      const best = detail.risk.scenarios.find((s) => s.type === "best");
      expect(best?.label).toBe("Best case");
      expect(best?.probability).toBe("~25%");

      const worst = detail.risk.scenarios.find((s) => s.type === "worst");
      expect(worst?.label).toBe("Worst case");
      expect(worst?.probability).toBe("~35%");
    });
  });
});
