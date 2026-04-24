"use client";

import { useState } from "react";
import type { ValidatedSignal } from "@/types";
import { formatRelative, getCatalystLabel, getConvictionColor } from "@/lib/utils";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

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
  const convColor = getConvictionColor(signal.conviction_score);

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

      {/* ── Expanded rationale ─────────────────────── */}
      {expanded && (
        <div
          style={{
            padding: "10px 20px 14px",
            borderBottom: !isLast
              ? "1px solid rgba(255,255,255,0.06)"
              : "none",
            background: "#0B1121",
          }}
        >
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
          {signal.key_risks.length > 0 && (
            <ul
              style={{
                margin: "10px 0 0 0",
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
