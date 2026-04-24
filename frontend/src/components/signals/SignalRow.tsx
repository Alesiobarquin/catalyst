"use client";

import { useState } from "react";
import type { ValidatedSignal } from "@/types";
import { formatRelative, getCatalystLabel } from "@/lib/utils";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

export function SignalRow({
  signal,
  isLast,
}: {
  signal: ValidatedSignal;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "80px 110px 80px 120px minmax(220px, 1fr) 130px",
          minWidth: 760,
          gap: 0,
          padding: "14px 20px",
          borderBottom: !isLast ? "1px solid var(--color-border-subtle)" : "none",
          alignItems: "center",
          transition: "background 150ms",
          cursor: "default",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background =
            "var(--color-bg-elevated)";
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
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            {signal.ticker}
          </span>
          {signal.is_trap && (
            <AlertTriangle
              size={12}
              color="var(--color-red)"
              aria-label="Trap detected"
            />
          )}
        </div>

        {/* Time */}
        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          {formatRelative(signal.timestamp_utc)}
        </span>

        {/* Conviction */}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 700,
            color:
              signal.conviction_score >= 80
                ? "var(--color-green)"
                : signal.conviction_score >= 60
                  ? "var(--color-teal)"
                  : "var(--color-red)",
          }}
        >
          {signal.conviction_score}
        </span>

        {/* Catalyst */}
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          {getCatalystLabel(signal.catalyst_type)}
        </span>

        {/* Rationale */}
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
            color: "var(--color-text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            paddingRight: 16,
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
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {/* Confluence sources */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {signal.confluence_sources.map((src) => (
            <span
              key={src}
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                background: "var(--color-bg-overlay)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
                letterSpacing: "0.04em",
              }}
            >
              {src}
            </span>
          ))}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "0 20px 14px 20px", marginTop: -6 }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: 1.6,
              color: "var(--color-text-secondary)",
              borderLeft: "2px solid var(--color-border-subtle)",
              paddingLeft: 10,
            }}
          >
            {signal.rationale}
          </p>
        </div>
      )}
    </div>
  );
}
