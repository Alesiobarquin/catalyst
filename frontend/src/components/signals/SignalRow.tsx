"use client";

import { useState } from "react";
import type { ValidatedSignal } from "@/types";
import { formatCurrency, formatRelative, getCatalystLabel, getConvictionColor } from "@/lib/utils";
import { getQuote } from "@/lib/api";
import { Activity, AlertTriangle, ChevronDown, ChevronUp, TrendingDown, TrendingUp } from "lucide-react";

const GRID_COLS =
  "80px 110px 80px 120px minmax(220px, 1fr) 130px";

export function SignalRow({
  signal,
  isLast,
}: {
  signal: ValidatedSignal;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [quote, setQuote] = useState<{
    price?: number;
    change?: number;
    change_percent?: number;
    day_high?: number;
    day_low?: number;
    volume?: number;
    fifty_two_week_high?: number;
    fifty_two_week_low?: number;
    market_cap?: number;
  } | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState(false);

  const convColor = getConvictionColor(signal.conviction_score);

  async function handleFetchQuote() {
    if (loadingQuote) return;
    setLoadingQuote(true);
    setQuoteError(false);
    try {
      const q = await getQuote(signal.ticker);
      if (q) {
        setQuote(q);
      } else {
        setQuoteError(true);
      }
    } catch {
      setQuoteError(true);
    } finally {
      setLoadingQuote(false);
    }
  }

  return (
    <div>
      {/* ── Main row ─────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID_COLS,
          minWidth: 760,
          padding: "11px 20px",
          borderBottom: !isLast || expanded
            ? "1px solid rgba(255,255,255,0.06)"
            : "none",
          alignItems: "center",
          transition: "background 100ms ease",
          cursor: "default",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = "#1E293B";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      >
        {/* Ticker */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 700,
              color: "#F8FAFC",
            }}
          >
            {signal.ticker}
          </span>
          {signal.is_trap && (
            <AlertTriangle
              size={11}
              color="#EF4444"
              aria-label="Trap detected"
            />
          )}
        </div>

        {/* Time */}
        <span style={{ fontSize: 11, color: "#64748B" }}>
          {formatRelative(signal.timestamp_utc)}
        </span>

        {/* Conviction */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 700,
              color: convColor,
              lineHeight: 1,
            }}
          >
            {signal.conviction_score}
          </span>
          <div
            style={{
              width: 48,
              height: 3,
              borderRadius: 2,
              background: "#1E293B",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${signal.conviction_score}%`,
                height: "100%",
                borderRadius: 2,
                background: convColor,
              }}
            />
          </div>
        </div>

        {/* Catalyst */}
        <span style={{ fontSize: 12, color: "#CBD5E1" }}>
          {getCatalystLabel(signal.catalyst_type)}
        </span>

        {/* Rationale (expandable) */}
        <button
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            textAlign: "left",
            fontSize: 12,
            color: "#CBD5E1",
            overflow: "hidden",
            paddingRight: 12,
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
          title={signal.rationale}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {signal.rationale}
          </span>
          {expanded ? (
            <ChevronUp size={11} style={{ flexShrink: 0, color: "#64748B" }} />
          ) : (
            <ChevronDown size={11} style={{ flexShrink: 0, color: "#64748B" }} />
          )}
        </button>

        {/* Confluence sources */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {signal.confluence_sources.map((src) => (
            <span
              key={src}
              style={{
                padding: "2px 6px",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 500,
                background: "#1E293B",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#94A3B8",
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
              }}
            >
              {src}
            </span>
          ))}
        </div>
      </div>

      {/* ── Expanded details ─────────────────────── */}
      {expanded && (
        <div
          style={{
            padding: "12px 20px 16px",
            borderBottom: !isLast
              ? "1px solid rgba(255,255,255,0.06)"
              : "none",
            background: "#0B1121",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Rationale paragraph */}
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.65,
              color: "#CBD5E1",
              borderLeft: "2px solid rgba(255,255,255,0.08)",
              paddingLeft: 12,
            }}
          >
            {signal.rationale}
          </p>

          {/* Suggested Targets & Stops */}
          {(signal.suggested_entry_zone || signal.suggested_stop) && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {signal.suggested_entry_zone && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    padding: "2px 8px",
                    borderRadius: 3,
                    background: "rgba(14,165,233,0.12)",
                    border: "1px solid rgba(14,165,233,0.3)",
                    color: "#38BDF8",
                  }}
                >
                  Entry Zone: {signal.suggested_entry_zone}
                </span>
              )}
              {signal.suggested_stop && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    padding: "2px 8px",
                    borderRadius: 3,
                    background: "rgba(239,68,68,0.12)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    color: "#F87171",
                  }}
                >
                  Suggested Stop: {String(signal.suggested_stop)}
                </span>
              )}
            </div>
          )}

          {/* Live Quote Inspection */}
          <div
            style={{
              padding: "10px 14px",
              background: "#0F172A",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            {quote ? (
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase" }}>
                    Live Price:
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#F8FAFC" }}>
                    {quote.price != null ? formatCurrency(quote.price) : "—"}
                  </span>
                </div>

                {quote.change != null && quote.change_percent != null && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      color: quote.change >= 0 ? "#10B981" : "#EF4444",
                    }}
                  >
                    {quote.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {quote.change >= 0 ? "+" : ""}
                    {quote.change.toFixed(2)} ({quote.change_percent >= 0 ? "+" : ""}
                    {quote.change_percent.toFixed(2)}%)
                  </div>
                )}

                {quote.day_low != null && quote.day_high != null && (
                  <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: "var(--font-mono)" }}>
                    Day: {formatCurrency(quote.day_low)} – {formatCurrency(quote.day_high)}
                  </span>
                )}

                {quote.volume != null && (
                  <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: "var(--font-mono)" }}>
                    Vol: {quote.volume.toLocaleString()}
                  </span>
                )}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: "#64748B" }}>
                {quoteError ? "Quote data temporarily unavailable." : "Inspect real-time market quote and trading volume."}
              </span>
            )}

            <button
              type="button"
              onClick={handleFetchQuote}
              disabled={loadingQuote}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 3,
                fontSize: 11,
                fontWeight: 600,
                background: quote ? "transparent" : "#1E293B",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#38BDF8",
                cursor: loadingQuote ? "wait" : "pointer",
              }}
            >
              <Activity size={12} />
              {loadingQuote ? "Fetching..." : quote ? "Refresh Quote" : "Check Live Quote"}
            </button>
          </div>

          {/* Key risks */}
          {signal.key_risks.length > 0 && (
            <ul
              style={{
                margin: "2px 0 0 0",
                padding: "0 0 0 14px",
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 5,
              }}
            >
              {signal.key_risks.map((risk, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    gap: 7,
                    fontSize: 12,
                    color: "#94A3B8",
                    lineHeight: 1.5,
                    position: "relative",
                  }}
                >
                  <AlertTriangle
                    size={10}
                    color="#EF4444"
                    style={{ flexShrink: 0, marginTop: 2 }}
                    aria-hidden
                  />
                  {risk}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

