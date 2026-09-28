import type { Metadata } from "next";
import { getOrderStats } from "@/lib/api";
import { formatCompact } from "@/lib/utils";
import {
  StrategyBreakdown,
  ConvictionHistogram,
  SignalTimeline,
  PerformanceSummary,
} from "@/components/analytics/Charts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics — Catalyst",
  description:
    "Aggregate analytics: conviction distribution, strategy breakdown, signal volume, and performance metrics.",
};

const CATALYST_COLORS: Record<string, string> = {
  SUPERNOVA: "#F97316",
  SCALPER:   "#0EA5E9",
  FOLLOWER:  "#10B981",
  DRIFTER:   "#A855F7",
};

export default async function AnalyticsPage() {
  const stats = await getOrderStats();

  const closedTotal = stats.hit_target_count + stats.hit_stop_count;
  const winRate =
    stats.win_rate_percent !== undefined
      ? `${stats.win_rate_percent}%`
      : closedTotal > 0
        ? `${((stats.hit_target_count / closedTotal) * 100).toFixed(0)}%`
        : "—";

  return (
    <>
      {/* ── Page header ─────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: "#F8FAFC",
            letterSpacing: "-0.01em",
            marginBottom: 4,
            lineHeight: 1.25,
          }}
        >
          Analytics
        </h1>
        <p style={{ fontSize: 13, color: "#CBD5E1", margin: 0 }}>
          Pipeline performance · Signal quality · Strategy distribution
        </p>
      </div>

      {/* ── Executive KPI summary strip ──────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div className="stat-card" style={{ padding: "16px 18px" }}>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Total Pipeline Orders
          </span>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "#F8FAFC", margin: "6px 0 2px" }}>
            {stats.total_orders}
          </p>
          <span style={{ fontSize: 11, color: "#64748B" }}>
            {stats.active_count} active in queue
          </span>
        </div>

        <div className="stat-card" style={{ padding: "16px 18px" }}>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Recommended Volume
          </span>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "#F8FAFC", margin: "6px 0 2px" }}>
            {stats.total_recommended_volume_usd ? `$${formatCompact(stats.total_recommended_volume_usd)}` : "—"}
          </p>
          <span style={{ fontSize: 11, color: "#64748B" }}>
            Half-Kelly portfolio sizing
          </span>
        </div>

        <div className="stat-card" style={{ padding: "16px 18px" }}>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Historical Win Rate
          </span>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "#10B981", margin: "6px 0 2px" }}>
            {winRate}
          </p>
          <span style={{ fontSize: 11, color: "#64748B" }}>
            {stats.hit_target_count} targets attained
          </span>
        </div>

        <div className="stat-card" style={{ padding: "16px 18px" }}>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Average Conviction
          </span>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "#38BDF8", margin: "6px 0 2px" }}>
            {stats.avg_conviction.toFixed(0)}/100
          </p>
          <span style={{ fontSize: 11, color: "#64748B" }}>
            Multi-source gatekeeper validated
          </span>
        </div>
      </div>

      {/* ── 2×2 analytics grid ──────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <PerformanceSummary  stats={stats} />
        <StrategyBreakdown   stats={stats} />
        <ConvictionHistogram stats={stats} />
        <SignalTimeline       stats={stats} />
      </div>

      {/* ── Catalyst type breakdown ──────────────────── */}
      <div
        className="glass-card"
        style={{ padding: "20px 22px" }}
      >
        <h3
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#F8FAFC",
            marginBottom: 18,
          }}
        >
          Catalyst type breakdown
        </h3>

        {Object.values(stats.catalyst_breakdown).every((c) => c === 0) && (
          <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>
            No catalyst data yet.
          </p>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Object.entries(stats.catalyst_breakdown)
            .filter(([, v]) => v > 0)
            .map(([type, count]) => {
              const col = CATALYST_COLORS[type] ?? "#64748B";
              return (
                <div
                  key={type}
                  style={{
                    flex: "1 1 140px",
                    padding: "16px 18px",
                    borderRadius: 3,
                    border: `1px solid ${col}33`,
                    background: `${col}0d`,
                  }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: col,
                      letterSpacing: "0.04em",
                      marginBottom: 8,
                      margin: "0 0 8px",
                    }}
                  >
                    {type.charAt(0) + type.slice(1).toLowerCase()}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 28,
                      fontWeight: 700,
                      color: "#F8FAFC",
                      margin: "0 0 2px",
                      lineHeight: 1,
                    }}
                  >
                    {count}
                  </p>
                  <p style={{ fontSize: 11, color: "#64748B", margin: 0 }}>
                    signals
                  </p>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}
