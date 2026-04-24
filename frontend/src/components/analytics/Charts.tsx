"use client";

import type { OrderStats } from "@/types";
import { getStrategyColors } from "@/lib/utils";
import type { Strategy } from "@/types";

interface StrategyBreakdownProps {
  stats: OrderStats;
}

export function StrategyBreakdown({ stats }: StrategyBreakdownProps) {
  const total = Object.values(stats.strategy_breakdown).reduce((a, b) => a + b, 0);
  const entries = Object.entries(stats.strategy_breakdown).filter(([, v]) => v > 0) as [Strategy, number][];

  return (
    <div
      className="glass-card"
      style={{ padding: "20px 22px" }}
    >
      <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.06em", marginBottom: 18 }}>
        STRATEGY BREAKDOWN
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
            No strategy data yet.
          </p>
        )}
        {entries.map(([strategy, count]) => {
          const pct = total > 0 ? (count / total) * 100 : 0;
          const colors = getStrategyColors(strategy);
          return (
            <div key={strategy}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: colors.text }}>{strategy}</span>
                <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
                  {count} ({pct.toFixed(0)}%)
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--color-bg-overlay)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    borderRadius: 3,
                    background: colors.dot,
                    opacity: 0.85,
                    transition: "width 0.8s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Conviction histogram ───────────────────────────────────────────
export function ConvictionHistogram({ stats }: { stats: OrderStats }) {
  const max = Math.max(...stats.conviction_distribution.map((d) => d.count));

  return (
    <div className="glass-card" style={{ padding: "20px 22px" }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.06em", marginBottom: 18 }}>
        CONVICTION DISTRIBUTION
      </h3>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
        {stats.conviction_distribution.map((d) => {
          const heightPct = max > 0 ? (d.count / max) * 100 : 0;
          const bucket = parseInt(d.bucket.split("–")[0], 10);
          const color = bucket >= 80 ? "var(--color-green)" : bucket >= 70 ? "var(--color-teal)" : "var(--color-red)";
          return (
            <div key={d.bucket} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                {d.count}
              </span>
              <div
                style={{
                  width: "100%",
                  height: `${heightPct}%`,
                  minHeight: 4,
                  background: color,
                  borderRadius: "3px 3px 0 0",
                  opacity: 0.8,
                  transition: "height 0.8s ease",
                }}
              />
              <span style={{ fontSize: 9, color: "var(--color-text-muted)", textAlign: "center", letterSpacing: "-0.02em" }}>
                {d.bucket}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Signal volume timeline ─────────────────────────────────────────
export function SignalTimeline({ stats }: { stats: OrderStats }) {
  const max = Math.max(...stats.daily_volume.map((d) => d.count));

  return (
    <div className="glass-card" style={{ padding: "20px 22px" }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.06em", marginBottom: 18 }}>
        SIGNALS PER DAY
      </h3>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80, overflowX: "auto" }}>
        {stats.daily_volume.map((d) => {
          const heightPct = max > 0 ? (d.count / max) * 100 : 10;
          return (
            <div
              key={d.date}
              title={`${d.date}: ${d.count} signal${d.count !== 1 ? "s" : ""}`}
              style={{ flex: "0 0 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
            >
              <div
                style={{
                  width: "100%",
                  height: `${heightPct}%`,
                  minHeight: 4,
                  background: "var(--color-teal)",
                  borderRadius: "2px 2px 0 0",
                  opacity: 0.7,
                  transition: "height 0.6s ease",
                }}
              />
              <span style={{ fontSize: 9, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                {d.date.split(" ")[1]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Performance summary ────────────────────────────────────────────
export function PerformanceSummary({ stats }: { stats: OrderStats }) {
  const resolved = stats.hit_target_count + stats.hit_stop_count;
  const winRate  = resolved > 0 ? ((stats.hit_target_count / resolved) * 100).toFixed(1) : "—";

  return (
    <div className="glass-card" style={{ padding: "20px 22px" }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.06em", marginBottom: 18 }}>
        PERFORMANCE
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { label: "Closed Win Rate", value: `${winRate}%`,                     color: "var(--color-green)" },
          { label: "Avg Conv.",     value: `${stats.avg_conviction.toFixed(0)}`, color: "var(--color-teal)" },
          { label: "Hit Target",   value: `${stats.hit_target_count}`,          color: "var(--color-green)" },
          { label: "Hit Stop",     value: `${stats.hit_stop_count}`,            color: "var(--color-red)"   },
          { label: "Active",       value: `${stats.active_count}`,              color: "var(--color-teal)"  },
          { label: "Total",        value: `${stats.total_orders}`,              color: "var(--color-text-primary)" },
        ].map((item) => (
          <div key={item.label}>
            <p style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 2 }}>
              {item.label.toUpperCase()}
            </p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: item.color }}>
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
