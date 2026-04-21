// Dashboard home — Server Component
// Data is fetched server-side; client components handle interactivity.

import { getOrders, getOrderStats } from "@/lib/api";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { TradeList } from "@/components/dashboard/TradeList";
import { Pagination } from "@/components/ui/Pagination";

const ORDERS_PER_PAGE = 15;

type PageProps = { searchParams: Promise<{ page?: string }> };

export default async function DashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const [{ items: orders, total, page: curPage, per_page }, stats] = await Promise.all([
    getOrders({ page, per_page: ORDERS_PER_PAGE }),
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
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
          Filters apply to the orders on this page (pagination loads {ORDERS_PER_PAGE} per page).
        </p>
      </div>

      {/* ── Stats cards ───────────────────────────────────── */}
      <StatsBar stats={stats} />

      {/* ── Filters (client) + trade list (client) ────────── */}
      <FilterBar />
      <TradeList orders={orders} />
      <Pagination page={curPage} total={total} perPage={per_page} basePath="/" />
    </>
  );
}
