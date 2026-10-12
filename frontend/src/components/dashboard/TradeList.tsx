"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { TradeOrder, BatchPerformance, SignalDetail } from "@/types";
import { TradeCard, RecommendationTableHeader } from "./TradeCard";
import { SignalDetailPanel } from "./SignalDetailPanel";
import { getBatchPerformance, fetchSignalDetail } from "@/lib/api";
import { orderToSignalDetail } from "@/lib/signalDetailUtils";
import { PUBLIC_DEMO } from "@/lib/snapshot";
import styles from "./TerminalRecords.module.css";

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
  const [panelOrder, setPanelOrder] = useState<TradeOrder | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelLoading, setPanelLoading] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const detailGenerationRef = useRef(0);
  const orderIdsKey = orders.map((o) => o.id).join(",");

  useEffect(() => () => { detailGenerationRef.current += 1; }, []);

  const handleViewAnalysis = useCallback(
    (order: TradeOrder, trigger: HTMLButtonElement) => {
      const generation = ++detailGenerationRef.current;
      triggerRef.current = trigger;

      // Phase 1 — open immediately with locally-derived data (prices, risk params, etc.)
      setPanelOrder(order);
      setPanelSignal(orderToSignalDetail(order));
      setPanelOpen(true);
      setPanelLoading(true);

      // Phase 2 — replace with server-generated detail (AI thesis, structured confluence)
      fetchSignalDetail(order.id)
        .then((detail) => {
          if (generation === detailGenerationRef.current) setPanelSignal(detail);
        })
        .catch(() => {
          // Backend endpoint not yet deployed or returned an error.
          // Local mapper data already showing — leave it as-is.
        })
        .finally(() => {
          if (generation === detailGenerationRef.current) setPanelLoading(false);
        });
    },
    []
  );

  const handlePanelClose = useCallback(() => {
    const generation = ++detailGenerationRef.current;
    const closingTrigger = triggerRef.current;
    // Keep the last record mounted while AnimatePresence finishes the exit.
    setPanelOpen(false);
    setPanelLoading(false);
    requestAnimationFrame(() => {
      if (generation === detailGenerationRef.current) closingTrigger?.focus();
    });
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
      <div className="rec-ledger-empty">
        <p>
          {hasActiveFilters ? "No recommendations match current filters" : PUBLIC_DEMO ? "No recommendations in this snapshot" : "No recommendations yet"}
        </p>
        <p>
          {hasActiveFilters
            ? "Adjust the strategy or extend the date range."
            : PUBLIC_DEMO ? "This scan did not publish an order. Check the scan report for source activity; new results appear after the next scheduled run." : "Recommendations will appear when a signal passes validation, sizing, and market-regime checks."}
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="rec-ledger" aria-label="Recommendation records">
        <div className={`terminal-record-command ${styles.command}`}>
          <span><span className={`terminal-function-key ${styles.functionKey}`}>REC</span>RECOMMENDATION RECORDS</span>
          <span>{orders.length} displayed · {PUBLIC_DEMO ? "CAPTURED DATA" : "READ LAYER"}</span>
        </div>
        <p className="rec-ledger-note">Prices and allocation at recommendation. Returns use sampled reference prices.</p>
        {perfUnavailable && (
          <p className="rec-ledger-notice" role="status">
            {PUBLIC_DEMO
              ? "Snapshot return data is unavailable. Showing persisted recommendation values."
              : "Live P&L data is temporarily unavailable. Showing last persisted values."}
          </p>
        )}
        <table className="rec-ledger-table" role="table" aria-label="Recommendations">
          <RecommendationTableHeader />
        {orders.map((order, index) => {
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
          };
          return (
            <TradeCard
              key={order.id}
              order={enriched}
              index={index}
              withinTable
              onViewAnalysis={handleViewAnalysis}
            />
          );
        })}
        </table>
      </section>

      {/* Signal detail panel — rendered via portal to document.body.
          panelSignal is set in phase 1 (local mapper) then overwritten in
          phase 2 (server response). isLoading drives the thesis skeleton. */}
      {panelSignal && (
        <SignalDetailPanel
          signal={panelSignal}
          order={panelOrder ?? undefined}
          isOpen={panelOpen}
          isLoading={panelLoading}
          onClose={handlePanelClose}
        />
      )}
    </>
  );
}
