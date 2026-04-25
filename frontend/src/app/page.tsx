// Dashboard home — Server Component
// Data is fetched server-side; client components handle interactivity.

import { getOrders, getOrderStats } from "@/lib/api";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { TradeList } from "@/components/dashboard/TradeList";
import { Pagination } from "@/components/ui/Pagination";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";

export const dynamic = "force-dynamic";

const ORDERS_PER_PAGE = 15;

type StrategyFilter = "Supernova" | "Scalper" | "Follower" | "Drifter" | "all";
type DateRangeFilter = "7d" | "30d" | "90d" | "all";

type PageProps = {
  searchParams: Promise<{ page?: string; strategy?: string; date_range?: string }>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const strategy = (["Supernova", "Scalper", "Follower", "Drifter"].includes(sp.strategy ?? "")
    ? sp.strategy
    : "all") as StrategyFilter;
  const dateRange = (["7d", "30d", "90d", "all"].includes(sp.date_range ?? "")
    ? sp.date_range
    : "30d") as DateRangeFilter;
  const hasActiveFilters = strategy !== "all" || dateRange !== "all";

  const [{ items: orders, total, page: curPage, per_page }, stats] = await Promise.all([
    getOrders({ page, per_page: ORDERS_PER_PAGE, strategy, date_range: dateRange }),
    getOrderStats(),
  ]);

  return (
    <>
      <DashboardHeader />
      <StatsBar stats={stats} />
      <FilterBar initialStrategy={strategy} initialDateRange={dateRange} />
      <TradeList orders={orders} hasActiveFilters={hasActiveFilters} />
      <Pagination
        page={curPage}
        total={total}
        perPage={per_page}
        basePath="/"
        query={{
          strategy: strategy !== "all" ? strategy : undefined,
          date_range: dateRange !== "all" ? dateRange : undefined,
        }}
      />
    </>
  );
}
