"use client";

import { useFilterStore } from "@/store/filters";
import type { TradeOrder } from "@/types";
import { TradeCard } from "./TradeCard";
import { subDays } from "date-fns";

interface TradeListProps {
  orders: TradeOrder[];
}

export function TradeList({ orders }: TradeListProps) {
  const { strategy, dateRange } = useFilterStore();

  const cutoff = dateRange === "all"
    ? null
    : subDays(new Date(), dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90);

  const filtered = orders.filter((o) => {
    if (strategy !== "all" && o.strategy_used !== strategy) return false;
    if (cutoff && new Date(o.timestamp_utc) < cutoff) return false;
    return true;
  });

  if (filtered.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "60px 0",
          color: "var(--color-text-muted)",
          fontSize: 14,
        }}
      >
        No trade orders match the current filters.
      </div>
    );
  }

  return (
    <div>
      {filtered.map((order, i) => (
        <TradeCard key={order.id} order={order} index={i} />
      ))}
    </div>
  );
}
