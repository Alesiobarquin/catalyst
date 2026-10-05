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

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
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
  Supernova: { bg: "var(--color-category-supernova-bg)", text: "var(--color-category-supernova)", border: "var(--color-category-supernova-border)", dot: "var(--color-category-supernova)" },
  Scalper:   { bg: "var(--color-category-scalper-bg)", text: "var(--color-category-scalper)", border: "var(--color-category-scalper-border)", dot: "var(--color-category-scalper)" },
  Follower:  { bg: "var(--color-category-follower-bg)", text: "var(--color-category-follower)", border: "var(--color-category-follower-border)", dot: "var(--color-category-follower)" },
  Drifter:   { bg: "var(--color-category-drifter-bg)", text: "var(--color-category-drifter)", border: "var(--color-category-drifter-border)", dot: "var(--color-category-drifter)" },
  Fallback:  { bg: "var(--color-category-fallback-bg)", text: "var(--color-category-fallback)", border: "var(--color-category-fallback-border)", dot: "var(--color-category-fallback)" },
};

export function getStrategyColors(strategy: Strategy) {
  return STRATEGY_COLORS[strategy] ?? STRATEGY_COLORS.Fallback;
}

export function getConvictionLabel(score: number): string {
  if (score >= 85) return "Very high";
  if (score >= 70) return "High";
  if (score >= 55) return "Moderate";
  if (score >= 40) return "Low";
  return "Minimal";
}

// ── Status config ──────────────────────────────────────────────────
// Labels and status meanings remain stable; colors resolve through the active theme.
export function getStatusConfig(status: TradeStatus | string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    HIT_TARGET:    { label: "Target hit",      color: "var(--color-profit)", bg: "var(--color-profit-bg)" },
    HIT_STOP:      { label: "Stopped",         color: "var(--color-loss)", bg: "var(--color-loss-bg)" },
    ACTIVE:        { label: "Active",          color: "var(--color-profit)", bg: "var(--color-profit-bg)" },
    EXPIRED:       { label: "Expired",         color: "var(--color-neutral)", bg: "var(--color-neutral-bg)" },
    RESOLVED_WIN:  { label: "Resolved (Win)",  color: "var(--color-profit)", bg: "var(--color-profit-bg)" },
    RESOLVED_LOSS: { label: "Resolved (Loss)", color: "var(--color-loss)", bg: "var(--color-loss-bg)" },
    SUBMITTED:     { label: "Submitted",       color: "var(--color-info)", bg: "var(--color-info-bg)" },
    PENDING_NEW:   { label: "Pending",         color: "var(--color-warning)", bg: "var(--color-warning-bg)" },
    NEW:           { label: "New",             color: "var(--color-info)", bg: "var(--color-info-bg)" },
    ACCEPTED:      { label: "Accepted",        color: "var(--color-info)", bg: "var(--color-info-bg)" },
    CANCELED:      { label: "Canceled",        color: "var(--color-neutral)", bg: "var(--color-neutral-bg)" },
    REJECTED:      { label: "Rejected",        color: "var(--color-loss)", bg: "var(--color-loss-bg)" },
  };
  return (
    map[status] ?? {
      label: String(status).replace("_", " "),
      color: "var(--color-neutral)",
      bg: "var(--color-neutral-bg)",
    }
  );
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
