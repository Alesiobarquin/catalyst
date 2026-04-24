"use client";

import { useState, useEffect } from "react";
import type { TradeOrder, BatchPerformance } from "@/types";
import { TradeCard } from "./TradeCard";
import { getBatchPerformance } from "@/lib/api";

interface TradeListProps {
  orders: TradeOrder[];
  hasActiveFilters: boolean;
}

export function TradeList({ orders, hasActiveFilters }: TradeListProps) {
  const [perf, setPerf] = useState<Record<number, BatchPerformance>>({});
  const [perfUnavailable, setPerfUnavailable] = useState(false);
  const orderIdsKey = orders.map((o) => o.id).join(",");

  useEffect(() => {
    if (orders.length === 0) return;
    const ids = orders.map((o) => o.id);
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
        setPerfUnavailable(false);
      })
      .catch(() => {
        setPerfUnavailable(true);
      });
  }, [orderIdsKey, orders]);

  if (orders.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "48px 24px",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 4,
          background: "#111827",
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 8 }}>
          {hasActiveFilters ? "No signals match current filters" : "No signals in queue"}
        </p>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.6, maxWidth: 400, margin: "0 auto" }}>
          {hasActiveFilters
            ? "Adjust strategy or expand the lookback window."
            : "The pipeline will publish signals as opportunities are identified."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {perfUnavailable && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 16px",
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.12)",
            color: "var(--color-text-secondary)",
            fontSize: 12,
          }}
        >
          Live P&amp;L data is temporarily unavailable. Showing last persisted values.
        </div>
      )}
      {orders.map((order, i) => {
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
