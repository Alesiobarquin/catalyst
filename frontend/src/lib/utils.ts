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
// Original strategy names preserved exactly.
const STRATEGY_COLORS: Record<Strategy, { bg: string; text: string; border: string; dot: string }> = {
  Supernova: { bg: "rgba(249,115,22,0.10)",  text: "#fb923c", border: "rgba(249,115,22,0.25)", dot: "#f97316" },
  Scalper:   { bg: "rgba(14,165,233,0.10)",  text: "#38bdf8", border: "rgba(14,165,233,0.25)", dot: "#0ea5e9" },
  Follower:  { bg: "rgba(16,185,129,0.10)",  text: "#34d399", border: "rgba(16,185,129,0.25)", dot: "#10b981" },
  Drifter:   { bg: "rgba(168,85,247,0.10)",  text: "#c084fc", border: "rgba(168,85,247,0.25)", dot: "#a855f7" },
  Fallback:  { bg: "rgba(100,116,139,0.10)", text: "#94a3b8", border: "rgba(100,116,139,0.25)", dot: "#64748b" },
};

export function getStrategyColors(strategy: Strategy) {
  return STRATEGY_COLORS[strategy] ?? STRATEGY_COLORS.Fallback;
}

// ── Conviction color (kept for Charts.tsx compatibility) ───────────
export function getConvictionColor(score: number): string {
  if (score >= 80) return "#10B981";
  if (score >= 60) return "#CBD5E1";
  if (score >= 40) return "#F59E0B";
  return "#EF4444";
}

export function getConvictionLabel(score: number): string {
  if (score >= 85) return "Very high";
  if (score >= 70) return "High";
  if (score >= 55) return "Moderate";
  if (score >= 40) return "Low";
  return "Minimal";
}

// ── Status config ──────────────────────────────────────────────────
// Colors: only profit green for target hit, only loss red for stop hit.
export function getStatusConfig(status: TradeStatus) {
  const map: Record<TradeStatus, { label: string; color: string; bg: string }> = {
    HIT_TARGET: { label: "Target hit",   color: "#10B981", bg: "rgba(16,185,129,0.10)"  },
    HIT_STOP:   { label: "Stopped",      color: "#EF4444", bg: "rgba(239,68,68,0.10)"   },
    ACTIVE:     { label: "Active",       color: "#10B981", bg: "rgba(16,185,129,0.10)"  },
    EXPIRED:    { label: "Expired",      color: "#64748B", bg: "rgba(100,116,139,0.10)" },
  };
  return map[status];
}

// ── Catalyst type label ────────────────────────────────────────────
export function getCatalystLabel(type: CatalystType): string {
  const map: Record<CatalystType, string> = {
    SUPERNOVA: "Short-covering event detected",
    SCALPER:   "Binary catalyst identified",
    FOLLOWER:  "Insider accumulation detected",
    DRIFTER:   "Post-earnings drift signal",
    UNKNOWN:   "Unclassified signal",
  };
  return map[type] ?? type;
}
