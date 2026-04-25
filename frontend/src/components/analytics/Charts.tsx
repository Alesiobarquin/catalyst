"use client";

import type { OrderStats } from "@/types";
import { getStrategyColors, getConvictionColor } from "@/lib/utils";
import type { Strategy } from "@/types";

// Shared section-title style matching the dashboard's card heading pattern.
const SECTION_TITLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#F8FAFC",
  letterSpacing: 0,
  marginBottom: 18,
};

interface StrategyBreakdownProps {
  stats: OrderStats;
}

// ── Strategy breakdown ────────────────────────────────────────────
export function StrategyBreakdown({ stats }: StrategyBreakdownProps) {
  const total = Object.values(stats.strategy_breakdown).reduce((a, b) => a + b, 0);
  const entries = Object.entries(stats.strategy_breakdown).filter(
    ([, v]) => v > 0
  ) as [Strategy, number][];

  return (
    <div className="glass-card" style={{ padding: "20px 22px" }}>
      <h3 style={SECTION_TITLE}>Strategy breakdown</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {entries.length === 0 && (
          <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>
            No strategy data yet.
          </p>
        )}
        {entries.map(([strategy, count]) => {
          const pct = total > 0 ? (count / total) * 100 : 0;
          const colors = getStrategyColors(strategy);
          return (
            <div key={strategy}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: colors.text,
                  }}
                >
                  {strategy}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    color: "#64748B",
                  }}
                >
                  {count}&nbsp;({pct.toFixed(0)}%)
                </span>
              </div>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: "#1E293B",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    borderRadius: 2,
                    background: colors.dot,
                    transition: "width 0.6s ease",
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

// ── Conviction histogram ──────────────────────────────────────────
export function ConvictionHistogram({ stats }: { stats: OrderStats }) {
  const max = Math.max(...stats.conviction_distribution.map((d) => d.count), 1);

  return (
    <div className="glass-card" style={{ padding: "20px 22px" }}>
      <h3 style={SECTION_TITLE}>Conviction distribution</h3>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          height: 100,
        }}
      >
        {stats.conviction_distribution.map((d) => {
          const heightPct = max > 0 ? (d.count / max) * 100 : 0;
          const bucket = parseInt(d.bucket.split("–")[0], 10);
          // Use the same color scale as getConvictionColor() in utils
          const barColor =
            bucket >= 80
              ? "#10B981"
              : bucket >= 60
                ? "#F59E0B"
                : bucket >= 40
                  ? "#CBD5E1"
                  : "#EF4444";
          return (
            <div
              key={d.bucket}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: "#64748B",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {d.count}
              </span>
              <div
                style={{
                  width: "100%",
                  height: `${heightPct}%`,
                  minHeight: 4,
                  background: barColor,
                  borderRadius: "2px 2px 0 0",
                  opacity: 0.85,
                }}
                title={`${d.bucket}: ${d.count}`}
              />
              <span
                style={{
                  fontSize: 9,
                  color: "#64748B",
                  textAlign: "center",
                  letterSpacing: "-0.01em",
                }}
              >
                {d.bucket}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Signal volume timeline ────────────────────────────────────────
export function SignalTimeline({ stats }: { stats: OrderStats }) {
  const max = Math.max(...stats.daily_volume.map((d) => d.count), 1);

  return (
    <div className="glass-card" style={{ padding: "20px 22px" }}>
      <h3 style={SECTION_TITLE}>Signals per day</h3>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 6,
          height: 80,
          overflowX: "auto",
        }}
      >
        {stats.daily_volume.map((d) => {
          const heightPct = max > 0 ? (d.count / max) * 100 : 10;
          return (
            <div
              key={d.date}
              title={`${d.date}: ${d.count} signal${d.count !== 1 ? "s" : ""}`}
              style={{
                flex: "0 0 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: `${heightPct}%`,
                  minHeight: 4,
                  background: "#64748B",
                  borderRadius: "2px 2px 0 0",
                }}
              />
              <span
                style={{
                  fontSize: 9,
                  color: "#64748B",
                  whiteSpace: "nowrap",
                }}
              >
                {d.date.split(" ")[1]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Performance summary ───────────────────────────────────────────
export function PerformanceSummary({ stats }: { stats: OrderStats }) {
  const resolved = stats.hit_target_count + stats.hit_stop_count;
  const winRate =
    resolved > 0
      ? `${((stats.hit_target_count / resolved) * 100).toFixed(1)}%`
      : "—";

  const items = [
    {
      label: "Win rate",
      value: winRate,
      color: "#10B981",
    },
    {
      label: "Avg conviction",
      value: stats.avg_conviction.toFixed(0),
      color: getConvictionColor(stats.avg_conviction),
    },
    {
      label: "Hit target",
      value: String(stats.hit_target_count),
      color: "#10B981",
    },
    {
      label: "Hit stop",
      value: String(stats.hit_stop_count),
      color: "#EF4444",
    },
    {
      label: "Active",
      value: String(stats.active_count),
      color: "#F8FAFC",
    },
    {
      label: "Total signals",
      value: String(stats.total_orders),
      color: "#F8FAFC",
    },
  ];

  return (
    <div className="glass-card" style={{ padding: "20px 22px" }}>
      <h3 style={SECTION_TITLE}>Performance</h3>
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 24px" }}
      >
        {items.map((item) => (
          <div key={item.label}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "#64748B",
                margin: "0 0 3px",
                letterSpacing: "0.02em",
              }}
            >
              {item.label}
            </p>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 20,
                fontWeight: 700,
                color: item.color,
                margin: 0,
                lineHeight: 1,
              }}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
