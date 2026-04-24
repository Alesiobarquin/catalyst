"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { TradeOrder, BatchPerformance, SignalDetail } from "@/types";
import { TradeCard } from "./TradeCard";
import { SignalDetailPanel } from "./SignalDetailPanel";
import { getBatchPerformance, fetchSignalDetail } from "@/lib/api";
import { orderToSignalDetail } from "@/lib/signalDetailUtils";

interface TradeListProps {
  orders: TradeOrder[];
  hasActiveFilters: boolean;
}

export function TradeList({ orders, hasActiveFilters }: TradeListProps) {
  const [perf, setPerf] = useState<Record<number, BatchPerformance>>({});
  const [perfUnavailable, setPerfUnavailable] = useState(false);

  // Panel state: signal is immediately populated from the local mapper,
  // then replaced by the server response when /orders/{id}/detail resolves.
  const [panelSignal, setPanelSignal] = useState<SignalDetail | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const orderIdsKey = orders.map((o) => o.id).join(",");

  const handleViewAnalysis = useCallback(
    (order: TradeOrder, trigger: HTMLButtonElement) => {
      triggerRef.current = trigger;

      // Phase 1 — open immediately with locally-derived data (prices, risk params, etc.)
      setPanelSignal(orderToSignalDetail(order));
      setPanelLoading(true);

      // Phase 2 — replace with server-generated detail (AI thesis, structured confluence)
      fetchSignalDetail(order.id)
        .then((detail) => setPanelSignal(detail))
        .catch(() => {
          // Backend endpoint not yet deployed or returned an error.
          // Local mapper data already showing — leave it as-is.
        })
        .finally(() => setPanelLoading(false));
    },
    []
  );

  const handlePanelClose = useCallback(() => {
    setPanelSignal(null);
    setPanelLoading(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

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
    <>
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
          return (
            <TradeCard
              key={order.id}
              order={enriched}
              index={i}
              onViewAnalysis={handleViewAnalysis}
            />
          );
        })}
      </div>

      {/* Signal detail panel — rendered via portal to document.body.
          panelSignal is set in phase 1 (local mapper) then overwritten in
          phase 2 (server response). isLoading drives the thesis skeleton. */}
      {panelSignal && (
        <SignalDetailPanel
          signal={panelSignal}
          isOpen={panelSignal !== null}
          isLoading={panelLoading}
          onClose={handlePanelClose}
        />
      )}
    </>
  );
}
