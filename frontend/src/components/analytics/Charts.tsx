"use client";

import type { OrderStats } from "@/types";
import { getStrategyColors } from "@/lib/utils";
import type { Strategy } from "@/types";

// Shared section-title style matching the dashboard's card heading pattern.
const SECTION_TITLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-text-primary)",
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
    ([, value]) => value > 0
  ) as [Strategy, number][];

  return (
    <div className="glass-card analytics-chart-card">
      <h3 style={SECTION_TITLE}>Strategy breakdown</h3>
      <p className="chart-subtitle">Recommendations by strategy · count and share</p>
      {entries.length === 0 ? (
        <p className="chart-empty" role="status">No strategy data in this snapshot.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {entries.map(([strategy, count]) => {
            const pct = total > 0 ? (count / total) * 100 : 0;
            const colors = getStrategyColors(strategy);
            return (
              <div key={strategy}>
                <div className="chart-row-label">
                  <span style={{ fontSize: 13, fontWeight: 500, color: colors.text }}>{strategy}</span>
                  <span className="chart-metric">{count} · {pct.toFixed(0)}%</span>
                </div>
                <div className="chart-track" role="img" aria-label={strategy + ": " + count + " recommendations, " + pct.toFixed(0) + " percent"}>
                  <div style={{ height: "100%", width: String(pct) + "%", borderRadius: 3, background: colors.dot }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Conviction histogram ──────────────────────────────────────────
export function ConvictionHistogram({ stats }: { stats: OrderStats }) {
  const distribution = stats.conviction_distribution;
  const total = distribution.reduce((sum, bucket) => sum + bucket.count, 0);
  const max = Math.max(...distribution.map((bucket) => bucket.count), 1);
  const summary = distribution
    .map((bucket) => bucket.bucket + " points: " + bucket.count + " recommendations")
    .join("; ");

  return (
    <div className="glass-card analytics-chart-card">
      <h3 style={SECTION_TITLE}>Conviction score distribution</h3>
      <p className="chart-subtitle">Recommendation count · score from 0 to 100</p>
      {total === 0 ? (
        <p className="chart-empty" role="status">No conviction data in this snapshot.</p>
      ) : (
        <>
          <div className="chart-axis-labels"><span>0 recommendations</span><span>Peak {max}</span></div>
          <div
            className="conviction-chart-bars"
            role="img"
            aria-label={"Conviction score distribution. " + summary}
          >
            {distribution.map((bucket) => {
              const heightPct = (bucket.count / max) * 100;
              return (
                <div key={bucket.bucket} className="conviction-chart-column">
                  <span className="chart-metric">{bucket.count}</span>
                  <div className="conviction-chart-bar-track">
                    <div
                      style={{ width: "100%", height: String(heightPct) + "%", minHeight: bucket.count > 0 ? 4 : 0, background: "var(--color-link)", borderRadius: "3px 3px 0 0" }}
                      title={bucket.bucket + ": " + bucket.count + " recommendations"}
                    />
                  </div>
                  <span className="chart-axis-category">{bucket.bucket}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Recommendation volume timeline ────────────────────────────────
function formatVolumeDate(date: string) {
  if (date.length !== 10 || date[4] !== "-" || date[7] !== "-") return date;
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function SignalTimeline({ stats }: { stats: OrderStats }) {
  const volume = stats.daily_volume;
  const max = Math.max(...volume.map((day) => day.count), 1);
  const total = volume.reduce((sum, day) => sum + day.count, 0);
  const range = volume.length > 0
    ? formatVolumeDate(volume[0].date) + " – " + formatVolumeDate(volume[volume.length - 1].date)
    : "";

  return (
    <div className="glass-card analytics-chart-card">
      <h3 style={SECTION_TITLE}>Recommendations by day</h3>
      <p className="chart-subtitle">Count per UTC date · {range}</p>
      {total === 0 ? (
        <p className="chart-empty" role="status">No recommendation history in this snapshot.</p>
      ) : (
        <>
          <div className="chart-axis-labels"><span>0 recommendations</span><span>Peak {max}</span></div>
          <div
            className="volume-chart-bars"
            role="img"
            aria-label={"Recommendations per UTC date. " + volume.map((day) => day.date + ": " + day.count).join("; ")}
          >
            {volume.map((day) => {
              const heightPct = (day.count / max) * 100;
              return (
                <div
                  key={day.date}
                  className="volume-chart-column"
                  title={day.date + ": " + day.count + " recommendations"}
                >
                  <div className="volume-chart-bar-track">
                    <div style={{ width: "100%", height: String(heightPct) + "%", minHeight: day.count > 0 ? 4 : 0 }} />
                  </div>
                  <span className="chart-axis-category">{formatVolumeDate(day.date)}</span>
                  <span className="chart-metric">{day.count}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Performance summary ───────────────────────────────────────────
export function PerformanceSummary({ stats, snapshot = false }: { stats: OrderStats; snapshot?: boolean }) {
  const resolved = stats.hit_target_count + stats.hit_stop_count;
  const winRate = resolved > 0
    ? ((stats.hit_target_count / resolved) * 100).toFixed(1) + "%"
    : "—";

  const items = [
    {
      label: "Modeled win rate",
      value: winRate,
      detail: resolved > 0 ? stats.hit_target_count + " of " + resolved + " stop/target outcomes" : "No stop/target outcomes yet",
      color: resolved > 0 ? "var(--color-profit)" : "var(--color-text-muted)",
    },
    {
      label: "Avg. conviction",
      value: stats.total_orders > 0 ? stats.avg_conviction.toFixed(0) + "/100" : "—",
      detail: stats.total_orders > 0 ? "Across " + stats.total_orders + " recommendations" : "No recommendations yet",
      color: stats.total_orders > 0 ? "var(--color-text-primary)" : "var(--color-text-muted)",
    },
    {
      label: "Targets reached",
      value: String(stats.hit_target_count),
      detail: "Sampled price checks",
      color: "var(--color-profit)",
    },
    {
      label: "Stops reached",
      value: String(stats.hit_stop_count),
      detail: "Sampled price checks",
      color: "var(--color-loss)",
    },
    {
      label: snapshot ? "Open at scan" : "Open now",
      value: String(stats.active_count),
      detail: "Active recommendations",
      color: "var(--color-text-primary)",
    },
    {
      label: "Total recommendations",
      value: String(stats.total_orders),
      detail: "All strategies",
      color: "var(--color-text-primary)",
    },
  ];

  return (
    <div className="glass-card analytics-chart-card">
      <h3 style={SECTION_TITLE}>Performance</h3>
      <p className="chart-subtitle">Stop and target outcomes use sampled prices, not continuous intraday monitoring.</p>
      <div className="performance-metrics-grid">
        {items.map((item) => (
          <div key={item.label}>
            <p className="performance-metric-label">{item.label}</p>
            <p className="performance-metric-value" style={{ color: item.color }}>{item.value}</p>
            <p className="performance-metric-detail">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
