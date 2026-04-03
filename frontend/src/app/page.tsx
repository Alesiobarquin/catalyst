// Dashboard home — Server Component
// Data is fetched server-side; client components handle interactivity.

import { getOrders, getOrderStats } from "@/lib/api";
import { StatsBar }  from "@/components/dashboard/StatsBar";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { TradeList } from "@/components/dashboard/TradeList";

export default async function DashboardPage() {
  const [{ items: orders }, stats] = await Promise.all([
    getOrders(),
    getOrderStats(),
  ]);

  return (
    <>
      {/* ── Page header ──────────────────────────────────── */}
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
          Trade Recommendations
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
          AI-validated signals from the Catalyst pipeline · Gemini · Half-Kelly · Multi-source confluence
        </p>
      </div>

      {/* ── Stats cards ───────────────────────────────────── */}
      <StatsBar stats={stats} />

      {/* ── Filters (client) + trade list (client) ────────── */}
      <FilterBar />
      <TradeList orders={orders} />
    </>
  );
}
