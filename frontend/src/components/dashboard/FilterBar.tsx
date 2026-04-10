"use client";

import { useFilterStore } from "@/store/filters";
import type { Strategy } from "@/types";
import { Calendar, Filter } from "lucide-react";

const STRATEGIES: Array<{ value: Strategy | "all"; label: string }> = [
  { value: "all",       label: "All" },
  { value: "Supernova", label: "Supernova" },
  { value: "Scalper",   label: "Scalper" },
  { value: "Follower",  label: "Follower" },
  { value: "Drifter",   label: "Drifter" },
];

const DATE_RANGES: Array<{ value: "7d" | "30d" | "90d" | "all"; label: string }> = [
  { value: "7d",  label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "all", label: "All Time" },
];

export function FilterBar() {
  const { strategy, dateRange, setStrategy, setDateRange } = useFilterStore();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 20,
        flexWrap: "wrap",
      }}
    >
      {/* Strategy filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Filter size={13} color="var(--color-text-muted)" />
        <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 500 }}>
          Strategy:
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {STRATEGIES.map((s) => {
            const active = strategy === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setStrategy(s.value)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: "1px solid",
                  transition: "all 150ms",
                  background: active ? "rgba(245,158,11,0.15)" : "transparent",
                  borderColor: active ? "rgba(245,158,11,0.4)" : "var(--color-border)",
                  color: active ? "var(--color-gold)" : "var(--color-text-secondary)",
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ height: 20, width: 1, background: "var(--color-border)" }} />

      {/* Date range */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Calendar size={13} color="var(--color-text-muted)" />
        <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 500 }}>
          Range:
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {DATE_RANGES.map((d) => {
            const active = dateRange === d.value;
            return (
              <button
                key={d.value}
                onClick={() => setDateRange(d.value)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: "1px solid",
                  transition: "all 150ms",
                  background: active ? "rgba(245,158,11,0.1)" : "transparent",
                  borderColor: active ? "rgba(245,158,11,0.3)" : "var(--color-border)",
                  color: active ? "var(--color-gold)" : "var(--color-text-secondary)",
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
