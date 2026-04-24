import type { TradeOrder, SignalDetail, Strategy } from "@/types";
import {
  formatCurrency,
  formatDateTime,
  formatRelative,
  calcRiskReward,
  getCatalystLabel,
  getConvictionLabel,
} from "@/lib/utils";

// ── Panel display formatters ──────────────────────────────────────

/** $200.88 or — */
export function formatPrice(price: number | null | undefined): string {
  if (price == null) return "—";
  return `$${price.toFixed(2)}`;
}

/** +4.14% or −1.68% (Unicode minus, not hyphen) */
export function formatPercent(percent: number | null | undefined): string {
  if (percent == null) return "—";
  const sign = percent >= 0 ? "+" : "−";
  return `${sign}${Math.abs(percent).toFixed(2)}%`;
}

export const formatPnL = formatPercent;

/** +$5,027 or −$1,754 (Unicode minus sign) */
function formatPnLDollar(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)
    return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Safe string — never renders null/undefined/empty as blank */
export function safe(
  value: string | number | null | undefined,
  fallback = "—"
): string {
  if (value == null || value === "") return fallback;
  return String(value);
}

// ── Strategy → typical time horizon ──────────────────────────────

const HORIZON_BY_STRATEGY: Record<Strategy, string> = {
  Supernova: "3–14d",
  Scalper:   "1–3d",
  Follower:  "14–30d",
  Drifter:   "10–21d",
  Fallback:  "—",
};

// ── Signed-percent helper (uses hyphen-minus for label text) ──────

function pctLabel(numerator: number, denominator: number): string {
  const pct = (numerator / denominator) * 100;
  const sign = pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

// ── TradeOrder → SignalDetail mapper ──────────────────────────────
// Maps the existing TradeOrder shape to the SignalDetail prop expected
// by <SignalDetailPanel />. Fields unavailable in TradeOrder render as "—".

export function orderToSignalDetail(order: TradeOrder): SignalDetail {
  const tradeStatus = order.status ?? "ACTIVE";
  const rr = calcRiskReward(order);

  const statusMap: Record<string, SignalDetail["status"]> = {
    ACTIVE: "Active",
    HIT_TARGET: "Target hit",
    HIT_STOP: "Stopped",
    EXPIRED: "Expired",
  };

  // Split rationale into paragraphs on double-newlines; fall back to single block.
  const paragraphs = order.rationale
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Compute scenario dollar P&L from position size and price levels.
  const posUsd = order.recommended_size_usd;
  const targetPct = (order.target_price - order.limit_price) / order.limit_price;
  const stopPct = (order.stop_loss - order.limit_price) / order.limit_price;
  const targetGainUsd = posUsd * targetPct;
  const stopLossUsd = posUsd * stopPct; // negative
  const baseGainUsd = targetGainUsd * 0.45;
  const basePctVal = targetPct * 100 * 0.45;

  // Derive confluence factors from available TradeOrder fields.
  const vixStrength: SignalDetail["confluence"]["factors"][0]["strength"] =
    order.regime_vix < 15 ? "LOW" : order.regime_vix < 22 ? "MODERATE" : "HIGH";
  const smaStrength: SignalDetail["confluence"]["factors"][0]["strength"] =
    order.spy_above_200sma ? "HIGH" : "LOW";
  const convictionStrength: SignalDetail["confluence"]["factors"][0]["strength"] =
    order.conviction_score >= 70 ? "HIGH" : order.conviction_score >= 50 ? "MODERATE" : "LOW";

  return {
    ticker: order.ticker,
    exchange: "—",
    sector: "—",
    action: order.action,
    status: statusMap[tradeStatus] ?? "Active",
    strategy: order.strategy_used,
    strategyDescription: getCatalystLabel(order.catalyst_type).toLowerCase(),
    convictionScore: order.conviction_score,
    convictionMax: 100,
    convictionLabel: getConvictionLabel(order.conviction_score).toUpperCase(),

    entryPrice: order.limit_price,
    stopLoss: order.stop_loss,
    targetPrice: order.target_price,
    currentPrice: order.current_price ?? null,
    pnlPercent: order.pnl_pct ?? null,

    riskReward: `1:${rr}`,
    positionSize: `$${(posUsd / 1_000).toFixed(0)}K`,
    timeHorizon: HORIZON_BY_STRATEGY[order.strategy_used] ?? "—",
    generatedAt: formatDateTime(order.timestamp_utc),
    age: formatRelative(order.timestamp_utc),
    signalId: `SIG-${order.id}`,

    thesis: {
      primaryCatalyst: getCatalystLabel(order.catalyst_type),
      bodyParagraphs: paragraphs.length > 0 ? paragraphs : [order.rationale],
      counterArguments: [],
    },

    confluence: {
      factors: [
        {
          source: "Catalyst signal",
          strength: convictionStrength,
          data: `${getCatalystLabel(order.catalyst_type)} · ${order.conviction_score}/100`,
        },
        {
          source: "Market regime (SPY vs 200SMA)",
          strength: smaStrength,
          data: order.spy_above_200sma ? "SPY above 200SMA" : "SPY below 200SMA",
        },
        {
          source: "VIX regime",
          strength: vixStrength,
          data: `VIX ${order.regime_vix}`,
        },
      ],
      summaryText: `Conviction score: ${order.conviction_score}/100 · ${getConvictionLabel(order.conviction_score)} confidence`,
    },

    risk: {
      parameters: [
        {
          label: "Entry",
          value: formatCurrency(order.limit_price),
        },
        {
          label: "Stop loss",
          value: `${formatCurrency(order.stop_loss)} (${pctLabel(order.stop_loss - order.limit_price, order.limit_price)})`,
          description: "Technical invalidation level",
        },
        {
          label: "Target",
          value: `${formatCurrency(order.target_price)} (${pctLabel(order.target_price - order.limit_price, order.limit_price)})`,
        },
        {
          label: "Position size",
          value: `$${(posUsd / 1_000).toFixed(0)}K`,
          description: `R:R 1:${rr}`,
        },
      ],
      exitTriggers: [
        { priority: 1, condition: "Target attained", action: "Take profit" },
        {
          priority: 2,
          condition: "Stop breach",
          action: "Market order exit, no exceptions",
        },
        {
          priority: 3,
          condition: "Catalyst invalidated",
          action: "Exit within 2 sessions",
        },
        {
          priority: 4,
          condition: "Time stop: 14 sessions",
          action: "Evaluate thesis validity",
        },
      ],
      scenarios: [
        {
          label: "Best case",
          value: `${formatPnLDollar(targetGainUsd)} (${pctLabel(order.target_price - order.limit_price, order.limit_price)})`,
          probability: "~25%",
          type: "best",
        },
        {
          label: "Base case",
          value: `${formatPnLDollar(baseGainUsd)} (+${basePctVal.toFixed(1)}%)`,
          probability: "~40%",
          type: "base",
        },
        {
          label: "Worst case",
          value: `${formatPnLDollar(stopLossUsd)} (${pctLabel(order.stop_loss - order.limit_price, order.limit_price)})`,
          probability: "~35%",
          type: "worst",
        },
      ],
      expectedValue: "—",
    },

    pipeline: {
      signalId: `SIG-${order.id}`,
      generatedAt: order.timestamp_utc,
      engineVersion: "—",
      timeline: [],
      rawFactors: {
        ticker: order.ticker,
        catalyst_type: order.catalyst_type,
        strategy_used: order.strategy_used,
        conviction_score: order.conviction_score,
        regime_vix: order.regime_vix,
        spy_above_200sma: order.spy_above_200sma,
        limit_price: order.limit_price,
        stop_loss: order.stop_loss,
        target_price: order.target_price,
        recommended_size_usd: order.recommended_size_usd,
        ...(order.current_price !== undefined && {
          current_price: order.current_price,
        }),
        ...(order.pnl_pct !== undefined && { pnl_pct: order.pnl_pct }),
        ...(order.status && { status: order.status }),
      },
    },
  };
}
