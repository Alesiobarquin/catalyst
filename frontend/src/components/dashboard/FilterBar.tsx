"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFilterStore } from "@/store/filters";
import type { Strategy } from "@/types";

/* Original strategy codenames — do not rename */
const STRATEGIES: Array<{ value: Strategy | "all"; label: string }> = [
  { value: "all",       label: "All"       },
  { value: "Supernova", label: "Supernova" },
  { value: "Scalper",   label: "Scalper"   },
  { value: "Follower",  label: "Follower"  },
  { value: "Drifter",   label: "Drifter"   },
];

const DATE_RANGES: Array<{ value: "7d" | "30d" | "90d" | "all"; label: string }> = [
  { value: "7d",  label: "7D"  },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "All" },
];

type DateRange = "7d" | "30d" | "90d" | "all";

interface FilterBarProps {
  initialStrategy: Strategy | "all";
  initialDateRange: DateRange;
}

export function FilterBar({ initialStrategy, initialDateRange }: FilterBarProps) {
  const { strategy, dateRange, setStrategy, setDateRange } = useFilterStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    setStrategy(initialStrategy);
    setDateRange(initialDateRange);
  }, [initialDateRange, initialStrategy, setDateRange, setStrategy]);

  function updateQuery(nextStrategy: Strategy | "all", nextDateRange: DateRange) {
    const qs = new URLSearchParams(searchParams.toString());
    qs.delete("page");
    if (nextStrategy === "all") qs.delete("strategy");
    else qs.set("strategy", nextStrategy);
    if (nextDateRange === "all") qs.delete("date_range");
    else qs.set("date_range", nextDateRange);
    const next = qs.toString();
    router.push(next ? `/?${next}` : "/");
  }

  function pillStyle(active: boolean): React.CSSProperties {
    return {
      padding: "6px 14px",
      borderRadius: 4,
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
      border: `1px solid ${active ? "#D97706" : "rgba(255,255,255,0.12)"}`,
      background: active ? "#D97706" : "transparent",
      color: active ? "#ffffff" : "var(--color-text-secondary)",
      transition: "border-color 100ms ease",
    };
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        marginBottom: 20,
        flexWrap: "wrap",
      }}
    >
      {/* ── Strategy ────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--color-text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          Strategy:
        </span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {STRATEGIES.map((s) => {
            const active = strategy === s.value;
            return (
              <button
                key={s.value}
                aria-pressed={active}
                onClick={() => {
                  setStrategy(s.value);
                  updateQuery(s.value, dateRange);
                }}
                style={pillStyle(active)}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.20)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.12)";
                  }
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Divider ─────────────────────────────────────── */}
      <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.10)" }} />

      {/* ── Range ───────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--color-text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          Range:
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {DATE_RANGES.map((d) => {
            const active = dateRange === d.value;
            return (
              <button
                key={d.value}
                aria-pressed={active}
                onClick={() => {
                  setDateRange(d.value);
                  updateQuery(strategy, d.value);
                }}
                style={pillStyle(active)}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.20)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.12)";
                  }
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
