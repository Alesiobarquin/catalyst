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

  return (
    <>
      {/* ── Page header ─────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
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
