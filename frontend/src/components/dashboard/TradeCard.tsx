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
}

function truncateThesis(text: string, maxWords = 20): string {
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text.trim();
  const words = firstSentence.split(/\s+/);
  if (words.length <= maxWords) return firstSentence;
  return words.slice(0, maxWords).join(" ") + "…";
}

function signedPct(numerator: number, denominator: number): string {
  const pct = (numerator / denominator) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
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

/* ── Shared micro-styles ──────────────────────────────────────── */
const TAG: React.CSSProperties = {
  padding: "1px 6px",
  borderRadius: 2,
  background: "#1E293B",
  border: "1px solid rgba(255,255,255,0.08)",
  fontSize: 11,
  fontWeight: 500,
  color: "#CBD5E1",
  whiteSpace: "nowrap" as const,
};

const ACTION_LINK: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  fontSize: 13,
  fontWeight: 500,
  color: "#0284C7",           /* slightly darker sky blue — less "web app" */
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
};

export function TradeCard({ order, index = 0 }: TradeCardProps) {
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
  const pnlPct    = order.pnl_pct;
  const pnlColor  = pnlPct !== undefined && pnlPct < 0 ? "#EF4444" : "#10B981";

  const stopPct   = signedPct(order.stop_loss   - order.limit_price, order.limit_price);
  const targetPct = signedPct(order.target_price - order.limit_price, order.limit_price);
  const riskLine  = `Stop ${stopPct} prior swing, target ${targetPct} 1.618 fib  ·  VIX ${order.regime_vix} · SPY ${order.spy_above_200sma ? "↑" : "↓"} 200SMA`;

  const tags = [
    getCatalystLabel(order.catalyst_type),
    `VIX ${order.regime_vix}`,
    order.spy_above_200sma ? "SPY ↑ 200SMA" : "SPY ↓ 200SMA",
    `$${(order.recommended_size_usd / 1000).toFixed(0)}K position`,
  ];

  return (
    <div
      style={{
        background: "#111827",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 4,
        marginBottom: 16,
        overflow: "hidden",
        transition: "border-color 100ms ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.20)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.12)";
      }}
    >
      <div style={{ padding: "20px 24px" }}>

        {/* ════════════════════════════════════════════════
            HEADER — 2-row implicit grid
            Row 1: NVDA  [BUY]  Active          +4.10%
            Row 2: Supernova         R:R 1:2.86 · 3d ago
        ════════════════════════════════════════════════ */}
        <div style={{ marginBottom: 14 }}>

          {/* Row 1 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>

            {/* Left: ticker + action badge + status */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: "#F8FAFC",
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
                  background: "#1E293B",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#CBD5E1",
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
              {order.current_price !== undefined && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 500, color: "#CBD5E1" }}>
                  {formatCurrency(order.current_price)}
                </span>
              )}
              {pnlPct !== undefined ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {pnlPct >= 0
                    ? <TrendingUp size={12} color="#10B981" strokeWidth={2} />
                    : <TrendingDown size={12} color="#EF4444" strokeWidth={2} />}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600, color: pnlColor }}>
                    {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                  </span>
                </div>
              ) : (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600, color: "#64748B" }}>
                  —
                </span>
              )}
            </div>
          </div>

          {/* Row 2: strategy on left, R:R · age on right */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#64748B" }}>
              {order.strategy_used}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#64748B" }}>
              R:R 1:{rr}&nbsp;&nbsp;·&nbsp;&nbsp;{formatRelative(order.timestamp_utc)}
            </span>
          </div>
        </div>

        {/* ── Separator ──────────────────────────────────── */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 14 }} />

        {/* ════════════════════════════════════════════════
            EXECUTION PARAMETERS — three boxes
        ════════════════════════════════════════════════ */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[
            { label: "Entry",        value: formatCurrency(order.limit_price),  color: "#F8FAFC" },
            { label: "Stop loss",    value: formatCurrency(order.stop_loss),    color: "#F59E0B" },
            { label: "Price target", value: formatCurrency(order.target_price), color: "#10B981" },
          ].map((p) => (
            <div
              key={p.label}
              style={{
                flex: 1,
                background: "#0B1121",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 3,
                padding: "12px 14px",
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 500, color: "#64748B", marginBottom: 6, letterSpacing: "0.02em" }}>
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
              <span style={{ fontSize: 11, color: "#64748B" }}>Conviction</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "#CBD5E1" }}>
                {order.conviction_score}/100
              </span>
            </div>
            <div style={{ width: 72, height: 3, borderRadius: 2, background: "#1E293B", overflow: "hidden" }}>
              <div
                style={{
                  width: `${order.conviction_score}%`,
                  height: "100%",
                  borderRadius: 2,
                  background: "#64748B",
                }}
              />
            </div>
          </div>

          <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)", alignSelf: "center" }} />

          <div style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
            <span style={{ fontSize: 11, color: "#64748B" }}>Size</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "#CBD5E1" }}>
              ${(order.recommended_size_usd / 1000).toFixed(0)}K
            </span>
          </div>

          {order.execution && (
            <>
              <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)", alignSelf: "center" }} />
              <div style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
                <span style={{ fontSize: 11, color: "#64748B" }}>Execution</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "#CBD5E1" }}>
                  {formatExecutionLabel(order.execution)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Separator ──────────────────────────────────── */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 14 }} />

        {/* ════════════════════════════════════════════════
            BODY — 4 lines max
        ════════════════════════════════════════════════ */}

        {/* Line 1: catalyst label */}
        <p style={{ fontSize: 12, fontWeight: 600, color: "#CBD5E1", margin: "0 0 5px", lineHeight: 1.5 }}>
          Primary catalyst: {getCatalystLabel(order.catalyst_type)}
        </p>

        {/* Line 2: thesis */}
        <p style={{ fontSize: 13, color: "#CBD5E1", margin: "0 0 9px", lineHeight: 1.5 }}>
          {truncateThesis(order.rationale)}
        </p>

        {/* Line 3: compact tags */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 9 }}>
          {tags.map((t) => (
            <span key={t} style={TAG}>{t}</span>
          ))}
        </div>

        {/* Line 4: risk line */}
        <p style={{ fontSize: 12, color: "#64748B", margin: 0, lineHeight: 1.5 }}>
          Risk: {riskLine}
        </p>

        {/* ── Action bar ───────────────────────────────── */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <button
            onClick={handleToggleChart}
            aria-expanded={expanded}
            style={ACTION_LINK}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.72"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
          >
            {expanded ? <ChevronUp size={13} strokeWidth={2} /> : <ChevronDown size={13} strokeWidth={2} />}
            View chart
          </button>
          <button
            style={ACTION_LINK}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.72"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
          >
            Set alert
          </button>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────── */}
      <div
        style={{
          padding: "7px 24px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 11, color: "#64748B" }}>
          Source: Gemini · Options flow · SEC filings
        </span>
        <span style={{ fontSize: 11, color: "#64748B" }}>
          Generated: {formatDateTime(order.timestamp_utc)}
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
              style={{
                borderTop: "1px solid rgba(255,255,255,0.06)",
                padding: "16px 24px",
                background: "#0B1121",
              }}
            >
              <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                {[
                  { color: "rgba(255,255,255,0.4)", label: "Entry",  dashed: false },
                  { color: "#F59E0B",               label: "Stop",   dashed: true  },
                  { color: "#10B981",               label: "Target", dashed: true  },
                ].map((l) => (
                  <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div
                      style={{
                        width: 16,
                        height: 0,
                        borderTop: l.dashed ? `1px dashed ${l.color}` : `2px solid ${l.color}`,
                      }}
                    />
                    <span style={{ fontSize: 10, color: "#64748B" }}>{l.label}</span>
                  </div>
                ))}
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#64748B" }}>
                  Signal: {formatDateTime(order.timestamp_utc)}
                </span>
              </div>

              {historyStatus === "loading" && (
                <div style={{ height: 140, display: "flex", alignItems: "center" }}>
                  <p style={{ fontSize: 11, color: "#64748B" }}>Fetching price data…</p>
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


