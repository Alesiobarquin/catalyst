"use client";

import { useState } from "react";
import type { MarketQuote, ValidatedSignal } from "@/types";
import { formatCurrency, formatRelative, getCatalystLabel } from "@/lib/utils";
import { getQuote } from "@/lib/api";
import { Activity, AlertTriangle, ChevronDown, ChevronUp, TrendingDown, TrendingUp } from "lucide-react";

const GRID_COLS =
  "72px 92px 64px minmax(145px, 190px) minmax(180px, 1fr) minmax(110px, 130px)";

export function SignalRow({
  signal,
  isLast,
}: {
  signal: ValidatedSignal;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState(false);

  const convColor = "var(--color-link)";

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
    <>
      {/* ── Main row ─────────────────────────────── */}
      <div
        className="signal-row-main"
        role="row"
        style={{
          display: "grid",
          gridTemplateColumns: GRID_COLS,
          columnGap: 16,
          padding: "11px 20px",
          borderBottom: !isLast || expanded
            ? "1px solid var(--color-border)"
            : "none",
          alignItems: "center",
          cursor: "default",
        }}
      >
        {/* Ticker */}
        <div className="signal-cell signal-cell--ticker" role="cell">
          <span className="signal-cell-label">Ticker</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            {signal.ticker}
          </span>
          {signal.is_trap && (
            <AlertTriangle
              size={11}
              color="var(--color-warning)"
              aria-label="Trap detected"
            />
          )}
          </span>
        </div>

        {/* Time */}
        <div className="signal-cell signal-cell--time" role="cell">
          <span className="signal-cell-label">Time</span>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {formatRelative(signal.timestamp_utc)}
          </span>
        </div>

        {/* Conviction */}
        <div className="signal-cell signal-cell--conviction" role="cell" aria-label={"Conviction " + signal.conviction_score + " out of 100"}>
          <span className="signal-cell-label">Conviction</span>
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
              background: "var(--color-bg-row)",
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
        </div>

        {/* Catalyst */}
        <div className="signal-cell signal-cell--catalyst" role="cell">
          <span className="signal-cell-label">Catalyst</span>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }} title={getCatalystLabel(signal.catalyst_type)}>
            {getCatalystLabel(signal.catalyst_type)}
          </span>
        </div>

        {/* Rationale (expandable) */}
        <div className="signal-cell signal-cell--rationale" role="cell">
          <span className="signal-cell-label">Rationale</span>
          <button
            aria-expanded={expanded}
            aria-label={expanded ? "Hide signal rationale" : "Show signal rationale"}
            onClick={() => setExpanded((prev) => !prev)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              minHeight: 44,
              width: "100%",
              textAlign: "left",
              fontSize: 13,
              lineHeight: 1.45,
              color: "var(--color-text-secondary)",
              overflow: "hidden",
              padding: "4px 12px 4px 0",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
            title={signal.rationale}
          >
            <span className="signal-rationale-preview">{signal.rationale}</span>
            {expanded ? (
              <ChevronUp size={14} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} />
            ) : (
              <ChevronDown size={14} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} />
            )}
          </button>
        </div>

        {/* Confluence sources */}
        <div className="signal-cell signal-cell--sources" role="cell">
          <span className="signal-cell-label">Sources</span>
          <span style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {signal.confluence_sources.map((src) => (
            <span
              key={src}
              style={{
                padding: "2px 6px",
                borderRadius: 3,
                fontSize: 12,
                fontWeight: 500,
                background: "var(--color-bg-row)",
                border: "1px solid var(--color-border-subtle)",
                color: "var(--color-text-muted)",
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
              }}
            >
              {src}
            </span>
          ))}
          {signal.confluence_count && signal.confluence_count >= 2 && (
            <span
              title={`${signal.confluence_count} Confluence Sources`}
              aria-label={`${signal.confluence_count} Confluence Sources`}
              style={{
                padding: "2px 5px",
                borderRadius: 3,
                fontSize: 12,
                fontWeight: 600,
                background: "var(--color-info-bg)",
                border: "1px solid var(--color-info-border)",
                color: "var(--color-link)",
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
              }}
            >
              {signal.confluence_count}x
            </span>
          )}
          </span>
        </div>
      </div>

      {/* ── Expanded details ─────────────────────── */}
      {expanded && (
        <div className="signal-details-row" role="row">
          <div className="signal-details-cell" role="cell" aria-colspan={6}>
            <div
              style={{
                padding: "14px 20px 18px",
                borderBottom: !isLast ? "1px solid var(--color-border)" : "none",
                background: "var(--color-bg-page)",
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
              color: "var(--color-text-secondary)",
              borderLeft: "2px solid var(--color-border-subtle)",
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
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    padding: "2px 8px",
                    borderRadius: 3,
                    background: "var(--color-info-bg)",
                    border: "1px solid var(--color-info-border)",
                    color: "var(--color-link)",
                  }}
                >
                  Entry Zone: {signal.suggested_entry_zone}
                </span>
              )}
              {signal.suggested_stop && (
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    padding: "2px 8px",
                    borderRadius: 3,
                    background: "var(--color-loss-bg)",
                    border: "1px solid var(--color-loss-border)",
                    color: "var(--color-loss)",
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
              background: "var(--color-bg-page)",
              border: "1px solid var(--color-border-subtle)",
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
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                    Live Price:
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>
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
                      color: quote.change >= 0 ? "var(--color-profit)" : "var(--color-loss)",
                    }}
                  >
                    {quote.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {quote.change >= 0 ? "+" : ""}
                    {quote.change.toFixed(2)} ({quote.change_percent >= 0 ? "+" : ""}
                    {quote.change_percent.toFixed(2)}%)
                  </div>
                )}

                {quote.day_low != null && quote.day_high != null && (
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                    Day: {formatCurrency(quote.day_low)} – {formatCurrency(quote.day_high)}
                  </span>
                )}

                {quote.volume != null && (
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                    Vol: {quote.volume.toLocaleString()}
                  </span>
                )}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
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
                fontSize: 12,
                fontWeight: 600,
                background: quote ? "transparent" : "var(--color-bg-row)",
                border: "1px solid var(--color-border)",
                color: "var(--color-link)",
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
                    color: "var(--color-text-muted)",
                    lineHeight: 1.5,
                    position: "relative",
                  }}
                >
                  <AlertTriangle
                    size={10}
                    color="var(--color-loss)"
                    style={{ flexShrink: 0, marginTop: 2 }}
                    aria-hidden
                  />
                  {risk}
                </li>
              ))}
            </ul>
          )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
