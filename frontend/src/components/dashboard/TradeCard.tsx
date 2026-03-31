"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Clock, Shield } from "lucide-react";
import type { TradeOrder } from "@/types";
import { PriceChart } from "@/components/charts/PriceChart";
import {
  formatCurrency,
  formatDateTime,
  formatRelative,
  calcRiskReward,
  getStrategyColors,
  getConvictionColor,
  getConvictionLabel,
  getStatusConfig,
  getCatalystLabel,
} from "@/lib/utils";

interface TradeCardProps {
  order: TradeOrder;
  index?: number;
}

export function TradeCard({ order, index = 0 }: TradeCardProps) {
  const [expanded, setExpanded] = useState(false);

  const stratColors = getStrategyColors(order.strategy_used);
  const convColor   = getConvictionColor(order.conviction_score);
  const rr          = calcRiskReward(order);
  const status      = order.status ?? "ACTIVE";
  const statusCfg   = getStatusConfig(status);

  const pnlColor = (order.pnl_pct ?? 0) >= 0 ? "var(--color-green)" : "var(--color-red)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
    >
      <div
        className="glass-card"
        style={{ overflow: "hidden", marginBottom: 12 }}
      >
        {/* ── Header row ────────────────────────────────────── */}
        <div style={{ padding: "18px 20px 16px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            {/* Ticker + action */}
            <div style={{ minWidth: 72 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 20,
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {order.ticker}
                </span>
                <span
                  style={{
                    padding: "2px 7px",
                    borderRadius: 5,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    background: "rgba(34,197,94,0.15)",
                    color: "var(--color-green)",
                    border: "1px solid rgba(34,197,94,0.3)",
                  }}
                >
                  {order.action}
                </span>
              </div>

              {/* Strategy badge */}
              <span
                style={{
                  display: "inline-block",
                  padding: "3px 9px",
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: 600,
                  background: stratColors.bg,
                  color: stratColors.text,
                  border: `1px solid ${stratColors.border}`,
                }}
              >
                {order.strategy_used}
              </span>
            </div>

            {/* Prices */}
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
              {[
                { label: "ENTRY",  value: order.limit_price,  color: "var(--color-gold)" },
                { label: "STOP",   value: order.stop_loss,    color: "var(--color-red)"  },
                { label: "TARGET", value: order.target_price, color: "var(--color-green)" },
              ].map((p) => (
                <div
                  key={p.label}
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: 8,
                    padding: "8px 10px",
                  }}
                >
                  <p style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 3 }}>
                    {p.label}
                  </p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: p.color }}>
                    {formatCurrency(p.value)}
                  </p>
                </div>
              ))}
            </div>

            {/* Right column: conviction + status + metrics */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 140, alignItems: "flex-end" }}>
              {/* Status badge */}
              <span
                style={{
                  padding: "3px 9px",
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: 600,
                  background: statusCfg.bg,
                  color: statusCfg.color,
                  border: `1px solid ${statusCfg.color}33`,
                }}
              >
                {statusCfg.label}
              </span>

              {/* P&L */}
              {order.pnl_pct !== undefined && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {order.pnl_pct >= 0
                    ? <TrendingUp size={13} color="var(--color-green)" />
                    : <TrendingDown size={13} color="var(--color-red)" />
                  }
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: pnlColor }}>
                    {order.pnl_pct >= 0 ? "+" : ""}{order.pnl_pct.toFixed(1)}%
                  </span>
                </div>
              )}

              {/* R:R */}
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                R:R&nbsp;
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", fontWeight: 600 }}>
                  1:{rr}
                </span>
              </span>
            </div>
          </div>

          {/* ── Conviction bar ────────────────────────────── */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 500 }}>
                CONVICTION  {" "}
                <span style={{ color: convColor, fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                  {order.conviction_score}
                </span>
                <span style={{ color: "var(--color-text-muted)" }}>
                  {" "}· {getConvictionLabel(order.conviction_score)}
                </span>
              </span>
              <div style={{ display: "flex", gap: 6, fontSize: 11, color: "var(--color-text-muted)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <Clock size={11} />
                  {formatRelative(order.timestamp_utc)}
                </span>
              </div>
            </div>
            <div
              style={{
                height: 5,
                borderRadius: 3,
                background: "var(--color-bg-overlay)",
                overflow: "hidden",
              }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${order.conviction_score}%` }}
                transition={{ duration: 0.8, delay: index * 0.05 + 0.2, ease: "easeOut" }}
                style={{
                  height: "100%",
                  borderRadius: 3,
                  background: `linear-gradient(90deg, ${convColor}99, ${convColor})`,
                  boxShadow: `0 0 8px ${convColor}44`,
                }}
              />
            </div>
          </div>

          {/* ── Metadata pill row ─────────────────────────── */}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <Pill label="Catalyst" value={getCatalystLabel(order.catalyst_type)} />
            <Pill label="VIX" value={`${order.regime_vix}`} mono />
            <Pill
              label="Regime"
              value={order.spy_above_200sma ? "SPY ↑ 200SMA" : "SPY ↓ 200SMA"}
              color={order.spy_above_200sma ? "var(--color-green)" : "var(--color-red)"}
            />
            <Pill label="Size" value={`$${(order.recommended_size_usd / 1000).toFixed(0)}k`} mono />
          </div>

          {/* ── Rationale ─────────────────────────────────── */}
          <p
            style={{
              marginTop: 12,
              fontSize: 13,
              color: "var(--color-text-secondary)",
              lineHeight: 1.6,
              borderLeft: "2px solid var(--color-border)",
              paddingLeft: 12,
            }}
          >
            {order.rationale}
          </p>

          {/* ── Expand / collapse button ──────────────────── */}
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              color: "var(--color-text-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontWeight: 500,
              transition: "color 150ms",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-gold)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)"; }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? "Hide chart" : "Show price chart"}
          </button>
        </div>

        {/* ── Expandable chart section ──────────────────────── */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              <div
                style={{
                  borderTop: "1px solid var(--color-border-subtle)",
                  padding: "16px 20px",
                  background: "var(--color-bg-base)",
                }}
              >
                {/* Chart legend */}
                <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                  {[
                    { color: "#f59e0b", label: "Entry",  style: "2px solid" },
                    { color: "#ef4444", label: "Stop",   style: "1px dashed" },
                    { color: "#22c55e", label: "Target", style: "1px dashed" },
                  ].map((l) => (
                    <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 20, height: 0, border: l.style, borderColor: l.color }} />
                      <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{l.label}</span>
                    </div>
                  ))}
                  <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-muted)" }}>
                    Signal: {formatDateTime(order.timestamp_utc)}
                  </div>
                </div>
                <PriceChart order={order} height={220} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Small pill helper ──────────────────────────────────────────────
function Pill({ label, value, color, mono }: {
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 5,
        border: "1px solid var(--color-border-subtle)",
        background: "var(--color-bg-elevated)",
      }}
    >
      <span style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.06em" }}>
        {label.toUpperCase()}
      </span>
      <span
        style={{
          fontSize: 11,
          fontFamily: mono ? "var(--font-mono)" : undefined,
          fontWeight: 600,
          color: color ?? "var(--color-text-secondary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}
