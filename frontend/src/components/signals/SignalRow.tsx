"use client";

import type { ValidatedSignal } from "@/types";
import { formatRelative, getCatalystLabel } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

export function SignalRow({
  signal,
  isLast,
}: {
  signal: ValidatedSignal;
  isLast: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "80px 110px 80px 120px 1fr 100px",
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
                ? "var(--color-gold)"
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
      <span
        style={{
          fontSize: 12,
          color: "var(--color-text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          paddingRight: 16,
        }}
      >
        {signal.rationale}
      </span>

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
  );
}
