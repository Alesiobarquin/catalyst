import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import type { Strategy, CatalystType, TradeStatus, TradeOrder } from "@/types";

// ── Tailwind className helper ──────────────────────────────────────
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ── Currency formatting ────────────────────────────────────────────
export function formatCurrency(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

// ── Risk/reward calculation ────────────────────────────────────────
export function calcRiskReward(order: TradeOrder): number {
  const risk   = order.limit_price - order.stop_loss;
  const reward = order.target_price - order.limit_price;
  if (risk <= 0) return 0;
  return parseFloat((reward / risk).toFixed(2));
}

// ── Trade status derivation ────────────────────────────────────────
export function deriveStatus(order: TradeOrder, currentPrice?: number): TradeStatus {
  if (!currentPrice) return "ACTIVE";
  if (currentPrice >= order.target_price) return "HIT_TARGET";
  if (currentPrice <= order.stop_loss)    return "HIT_STOP";
  return "ACTIVE";
}

export function derivePnlPct(order: TradeOrder, currentPrice?: number): number | undefined {
  if (!currentPrice) return undefined;
  return parseFloat(
    (((currentPrice - order.limit_price) / order.limit_price) * 100).toFixed(2)
  );
}

// ── Date formatting ────────────────────────────────────────────────
export function formatDateTime(iso: string): string {
  return format(new Date(iso), "MMM d, yyyy HH:mm");
}

export function formatRelative(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

export function formatDateShort(iso: string): string {
  return format(new Date(iso), "MMM d");
}

// ── Strategy color palette ─────────────────────────────────────────
const STRATEGY_COLORS: Record<Strategy, { bg: string; text: string; border: string; dot: string }> = {
  Supernova: { bg: "rgba(249,115,22,0.12)", text: "#fb923c", border: "rgba(249,115,22,0.3)", dot: "#f97316" },
  Scalper:   { bg: "rgba(234,179,8,0.12)",  text: "#facc15", border: "rgba(234,179,8,0.3)",  dot: "#eab308" },
  Follower:  { bg: "rgba(59,130,246,0.12)", text: "#60a5fa", border: "rgba(59,130,246,0.3)", dot: "#3b82f6" },
  Drifter:   { bg: "rgba(168,85,247,0.12)", text: "#c084fc", border: "rgba(168,85,247,0.3)", dot: "#a855f7" },
  Fallback:  { bg: "rgba(107,114,128,0.12)",text: "#9ca3af", border: "rgba(107,114,128,0.3)",dot: "#6b7280" },
};

export function getStrategyColors(strategy: Strategy) {
  return STRATEGY_COLORS[strategy] ?? STRATEGY_COLORS.Fallback;
}

// ── Conviction color ───────────────────────────────────────────────
export function getConvictionColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

export function getConvictionLabel(score: number): string {
  if (score >= 85) return "VERY HIGH";
  if (score >= 70) return "HIGH";
  if (score >= 55) return "MODERATE";
  return "LOW";
}

// ── Status helpers ─────────────────────────────────────────────────
export function getStatusConfig(status: TradeStatus) {
  const map = {
    HIT_TARGET: { label: "Target Hit",  color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
    HIT_STOP:   { label: "Stop Hit",    color: "#ef4444", bg: "rgba(239,68,68,0.12)"  },
    ACTIVE:     { label: "Active",      color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
    EXPIRED:    { label: "Expired",     color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
  };
  return map[status];
}

// ── Catalyst type label ────────────────────────────────────────────
export function getCatalystLabel(type: CatalystType): string {
  const map: Record<CatalystType, string> = {
    SUPERNOVA: "Short Squeeze",
    SCALPER:   "Binary Event",
    FOLLOWER:  "Momentum",
    DRIFTER:   "Earnings Drift",
    UNKNOWN:   "Unknown",
  };
  return map[type] ?? type;
}
