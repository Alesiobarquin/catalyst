"use client";

import { useState, useEffect } from "react";
import { useFilterStore } from "@/store/filters";
import type { TradeOrder, BatchPerformance } from "@/types";
import { TradeCard } from "./TradeCard";
import { getBatchPerformance } from "@/lib/api";
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

  const [perf, setPerf] = useState<Record<number, BatchPerformance>>({});

  useEffect(() => {
    if (filtered.length === 0) return;
    const ids = filtered.map((o) => o.id);
    // Fetch in batches of 20 (API limit)
    const batches: number[][] = [];
    for (let i = 0; i < ids.length; i += 20) {
      batches.push(ids.slice(i, i + 20));
    }
    Promise.all(batches.map((b) => getBatchPerformance(b)))
      .then((results) => {
        const merged: Record<number, BatchPerformance> = {};
        for (const batch of results) {
          for (const item of batch) {
            merged[item.order_id] = item;
          }
        }
        setPerf(merged);
      })
      .catch(() => {
        // Non-fatal: cards render without live P&L
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, strategy, dateRange]);

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
      {filtered.map((order, i) => {
        const livePerf = perf[order.id];
        const enriched: TradeOrder = {
          ...(livePerf
            ? {
                ...order,
                current_price: livePerf.current_price ?? order.current_price,
                pnl_pct: livePerf.pnl_pct ?? order.pnl_pct,
                status: livePerf.status ?? order.status,
              }
            : order),
          execution: null,
        };
        return <TradeCard key={order.id} order={enriched} index={i} />;
      })}
    </div>
  );
}
