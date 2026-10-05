"use client";

import { useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown } from "lucide-react";
import type { TradeOrder, PriceBar, TradeExecution } from "@/types";
import { PriceChart } from "@/components/charts/PriceChart";
import { getPriceHistory } from "@/lib/api";
import {
  formatCurrency,
  formatDateTime,
  formatRelative,
  calcRiskReward,
  getStatusConfig,
  getCatalystLabel,
} from "@/lib/utils";

interface TradeCardProps {
  order: TradeOrder;
  index?: number;
  onViewAnalysis?: (order: TradeOrder, trigger: HTMLButtonElement) => void;
}

function truncateThesis(text: string, maxWords = 20): string {
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text.trim();
  const words = firstSentence.split(/\s+/);
  if (words.length <= maxWords) return firstSentence;
  return words.slice(0, maxWords).join(" ") + "…";
}

function formatExecutionLabel(ex: TradeExecution): string {
  if (ex.execution_status === "filled" && ex.filled_avg_price != null) {
    return `Filled @ ${formatCurrency(ex.filled_avg_price)}`;
  }
  if (ex.execution_status === "rejected") {
    const em = ex.error_message;
    if (em && em.length > 40) return `Rejected (${em.slice(0, 40)}…)`;
    return em ? `Rejected (${em})` : "Rejected";
  }
  if (ex.execution_status === "pending") return "Pending";
  return ex.execution_status;
}

const ACTION_LINK: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  fontSize: 13,
  fontWeight: 500,
  color: "var(--color-link)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "0 4px",
  minHeight: 44,
};

export function TradeCard({ order, index = 0, onViewAnalysis }: TradeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [historyStatus, setHistoryStatus] = useState<"idle" | "loading" | "live" | "synthetic">("idle");
  const historyCompletedRef = useRef(false);
  const historyInFlightRef  = useRef(false);

  function handleToggleChart() {
    setExpanded((v) => {
      const next = !v;
      if (next && !historyCompletedRef.current && !historyInFlightRef.current) {
        historyInFlightRef.current = true;
        setHistoryStatus("loading");
        getPriceHistory(order.ticker, order.timestamp_utc)
          .then((data) => {
            setBars(data.length > 0 ? data : []);
            setHistoryStatus(data.length > 0 ? "live" : "synthetic");
          })
          .catch(() => setHistoryStatus("synthetic"))
          .finally(() => {
            historyInFlightRef.current  = false;
            historyCompletedRef.current = true;
          });
      }
      return next;
    });
  }

  const rr        = calcRiskReward(order);
  const status    = order.status ?? "ACTIVE";
  const statusCfg = getStatusConfig(status);
  const pnlPct    = order.pnl_percent ?? order.pnl_pct;
  const pnlColor  = pnlPct !== undefined && pnlPct < 0 ? "var(--color-loss)" : "var(--color-profit)";


  return (
    <div
      className="trade-card"
      style={{
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <div className="trade-card-content" style={{ padding: "20px 24px" }}>

        {/* ════════════════════════════════════════════════
            HEADER — 2-row implicit grid
            Row 1: NVDA  [BUY]  Active          +4.10%
            Row 2: Supernova         R:R 1:2.86 · 3d ago
        ════════════════════════════════════════════════ */}
        <div style={{ marginBottom: 14 }}>

          {/* Row 1 */}
          <div className="trade-card-heading-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>

            {/* Left: ticker + action badge + status */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  letterSpacing: "0.01em",
                  lineHeight: 1,
                }}
              >
                {order.ticker}
              </span>

              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: 3,
                  fontSize: 11,
                  fontWeight: 500,
                  background: "var(--color-bg-row)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-secondary)",
                  letterSpacing: "0.04em",
                }}
              >
                {order.action}
              </span>

              <span style={{ fontSize: 12, fontWeight: 500, color: statusCfg.color }}>
                {statusCfg.label}
              </span>
            </div>

            {/* Right: current price + P&L */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {(order.current_price !== undefined || order.resolved_price != null) && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)" }}>
                  {formatCurrency(order.resolved_price ?? order.current_price ?? 0)}
                </span>
              )}
              {pnlPct !== undefined ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {pnlPct >= 0
                    ? <TrendingUp size={12} color="var(--color-profit)" strokeWidth={2} />
                    : <TrendingDown size={12} color="var(--color-loss)" strokeWidth={2} />}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600, color: pnlColor }}>
                    {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                  </span>
                </div>
              ) : (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600, color: "var(--color-text-muted)" }}>
                  —
                </span>
              )}
            </div>
          </div>

          {/* Row 2: strategy on left, R:R · age on right */}
          <div className="trade-card-meta-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {order.strategy_used}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text-muted)" }}>
              R:R 1:{rr}&nbsp;&nbsp;·&nbsp;&nbsp;{formatRelative(order.timestamp_utc)}
            </span>
          </div>
        </div>

        {/* ── Separator ──────────────────────────────────── */}
        <div style={{ height: 1, background: "var(--color-bg-row)", marginBottom: 14 }} />

        {/* ════════════════════════════════════════════════
            EXECUTION PARAMETERS — three boxes
        ════════════════════════════════════════════════ */}
        <div className="trade-price-levels" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[
            { label: "Entry",        value: formatCurrency(order.limit_price),  color: "var(--color-text-primary)" },
            { label: "Stop loss",    value: formatCurrency(order.stop_loss),    color: "var(--color-warning)" },
            { label: "Price target", value: formatCurrency(order.target_price), color: "var(--color-profit)" },
          ].map((p) => (
            <div
              key={p.label}
              style={{
                flex: 1,
                background: "var(--color-bg-page)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: 3,
                padding: "12px 14px",
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-muted)", marginBottom: 6, letterSpacing: "0.02em" }}>
                {p.label}
              </p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600, color: p.color, margin: 0 }}>
                {p.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Metadata strip ───────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
          {/* Conviction with bar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Conviction</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                {order.conviction_score}/100
              </span>
            </div>
            <div style={{ width: 72, height: 3, borderRadius: 2, background: "var(--color-bg-row)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${order.conviction_score}%`,
                  height: "100%",
                  borderRadius: 2,
                  background: "var(--color-text-muted)",
                }}
              />
            </div>
          </div>

          <div style={{ width: 1, height: 28, background: "var(--color-bg-row)", alignSelf: "center" }} />

          <div style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Size</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>
              ${(order.recommended_size_usd / 1000).toFixed(0)}K
            </span>
          </div>

          {order.execution && (
            <>
              <div style={{ width: 1, height: 28, background: "var(--color-bg-row)", alignSelf: "center" }} />
              <div style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Execution</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                  {formatExecutionLabel(order.execution)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Separator ──────────────────────────────────── */}
        <div style={{ height: 1, background: "var(--color-bg-row)", marginBottom: 14 }} />

        {/* ════════════════════════════════════════════════
            BODY — 4 lines max
        ════════════════════════════════════════════════ */}

        <div className="trade-card-summary">
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: "0 0 12px", lineHeight: 1.6 }}>
            {truncateThesis(order.rationale, 28)}
          </p>
          <div className="trade-card-context">
            <p><span>Catalyst</span>{getCatalystLabel(order.catalyst_type)}</p>
            <p><span>Market at recommendation</span>VIX {order.regime_vix} · SPY {order.spy_above_200sma ? "above" : "below"} 200-day average</p>
          </div>
        </div>

        {/* ── Action bar ───────────────────────────────── */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid var(--color-border-subtle)",
          }}
        >
          <button
            className="text-action-link"
            onClick={handleToggleChart}
            aria-expanded={expanded}
            aria-label={(expanded ? "Hide" : "View") + " chart for " + order.ticker}
            style={ACTION_LINK}
          >
            {expanded ? <ChevronUp size={13} strokeWidth={2} /> : <ChevronDown size={13} strokeWidth={2} />}
            View chart
          </button>
          {onViewAnalysis && (
            <button
              className="text-action-link"
              onClick={(e) => onViewAnalysis(order, e.currentTarget as HTMLButtonElement)}
              aria-label={"View analysis for " + order.ticker}
              style={ACTION_LINK}
            >
              View analysis
            </button>
          )}
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────── */}
      <div
        style={{
          padding: "7px 24px",
          borderTop: "1px solid var(--color-border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >

        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Recommendation generated {formatDateTime(order.timestamp_utc)}
        </span>
      </div>

      {/* ── Expandable chart ─────────────────────────────── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="trade-chart-content"
              style={{
                borderTop: "1px solid var(--color-border-subtle)",
                padding: "16px 24px",
                background: "var(--color-bg-page)",
              }}
            >
              <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                {[
                  { color: "var(--color-text-muted)", label: "Entry",  dashed: false },
                  { color: "var(--color-warning)",               label: "Stop",   dashed: true  },
                  { color: "var(--color-profit)",               label: "Target", dashed: true  },
                ].map((l) => (
                  <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div
                      style={{
                        width: 16,
                        height: 0,
                        borderTop: l.dashed ? `1px dashed ${l.color}` : `2px solid ${l.color}`,
                      }}
                    />
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{l.label}</span>
                  </div>
                ))}
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-text-secondary)" }}>
                  Signal: {formatDateTime(order.timestamp_utc)}
                </span>
              </div>

              {historyStatus === "loading" && (
                <div style={{ height: 140, display: "flex", alignItems: "center" }}>
                  <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Fetching price data…</p>
                </div>
              )}
              {(historyStatus === "live" || historyStatus === "synthetic") && (
                <PriceChart
                  order={order}
                  bars={bars.length > 0 ? bars : undefined}
                  height={200}
                  dataSource={historyStatus === "live" ? "live" : "synthetic"}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
