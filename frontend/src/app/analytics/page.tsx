import type { Metadata } from "next";
import { getOrderStats } from "@/lib/api";
import {
  StrategyBreakdown,
  ConvictionHistogram,
  SignalTimeline,
  PerformanceSummary,
} from "@/components/analytics/Charts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics — Catalyst",
  description: "Aggregate analytics: conviction distribution, strategy breakdown, signal volume, and performance metrics.",
};

export default async function AnalyticsPage() {
  const stats = await getOrderStats();

  return (
    <>
      {/* ── Page header ────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: 4,
          }}
        >
          Analytics
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
          Pipeline performance · Signal quality · Strategy distribution
        </p>
      </div>

      {/* ── 2×2 analytics grid ─────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <PerformanceSummary stats={stats} />
        <StrategyBreakdown  stats={stats} />
        <ConvictionHistogram stats={stats} />
        <SignalTimeline      stats={stats} />
      </div>

      {/* ── Catalyst type breakdown ─────────────────────── */}
      <div
        className="glass-card"
        style={{ padding: "20px 22px" }}
      >
        <h3
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            letterSpacing: "0.06em",
            marginBottom: 18,
          }}
        >
          CATALYST TYPE BREAKDOWN
        </h3>
        {Object.values(stats.catalyst_breakdown).every((count) => count === 0) && (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 0, marginBottom: 4 }}>
            No catalyst data yet.
          </p>
        )}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Object.entries(stats.catalyst_breakdown)
            .filter(([, v]) => v > 0)
            .map(([type, count]) => {
              const colorMap: Record<string, string> = {
                SUPERNOVA: "#f97316",
                SCALPER:   "#eab308",
                FOLLOWER:  "#3b82f6",
                DRIFTER:   "#a855f7",
              };
              const col = colorMap[type] ?? "#6b7280";
              return (
                <div
                  key={type}
                  style={{
                    flex: "1 1 150px",
                    padding: "16px 18px",
                    borderRadius: 10,
                    border: `1px solid ${col}33`,
                    background: `${col}0d`,
                  }}
                >
                  <p style={{ fontSize: 11, fontWeight: 700, color: col, letterSpacing: "0.08em", marginBottom: 6 }}>
                    {type}
                  </p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--color-text-primary)" }}>
                    {count}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--color-text-muted)" }}>signals</p>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}
