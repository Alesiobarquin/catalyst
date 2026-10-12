"use client";

import { useState, useRef, type CSSProperties } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { TradeOrder, PriceBar, TradeExecution } from "@/types";
import { PriceChart } from "@/components/charts/PriceChart";
import { getPriceHistory } from "@/lib/api";
import { PUBLIC_DEMO } from "@/lib/snapshot";
import styles from "./TerminalRecords.module.css";
import {
  formatCurrency,
  formatDateTime,
  calcRiskReward,
  getStatusConfig,
  getCatalystLabel,
} from "@/lib/utils";

interface TradeCardProps {
  order: TradeOrder;
  index?: number;
  /** The list supplies the shared table; standalone records keep their own headers. */
  withinTable?: boolean;
  onViewAnalysis?: (order: TradeOrder, trigger: HTMLButtonElement) => void;
}

function truncateThesis(text: string, maxWords = 28): string {
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text.trim();
  const words = firstSentence.split(/\s+/);
  return words.length <= maxWords ? firstSentence : words.slice(0, maxWords).join(" ") + "…";
}

function formatExecutionLabel(ex: TradeExecution): string {
  if (ex.execution_status === "filled" && ex.filled_avg_price != null) {
    return `Filled @ ${formatCurrency(ex.filled_avg_price)}`;
  }
  if (ex.execution_status === "rejected") {
    const message = ex.error_message;
    if (message && message.length > 40) return `Rejected (${message.slice(0, 40)}…)`;
    return message ? `Rejected (${message})` : "Rejected";
  }
  return ex.execution_status === "pending" ? "Pending" : ex.execution_status;
}

export function RecommendationTableHeader() {
  return (
    <thead>
      <tr>
        {["Recommendation", "Entry", "Stop", "Target", "Allocation", "Modeled return", "Inspect"].map((label) => (
          <th key={label} scope="col">{label}</th>
        ))}
      </tr>
    </thead>
  );
}

export function TradeCard({ order, index = 0, withinTable = false, onViewAnalysis }: TradeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [historyStatus, setHistoryStatus] = useState<"idle" | "loading" | "live" | "synthetic" | "unavailable">("idle");
  const historyCompletedRef = useRef(false);
  const historyInFlightRef = useRef(false);
  const chartId = `recommendation-chart-${order.id}`;

  function handleToggleChart() {
    const next = !expanded;
    setExpanded(next);
    if (!next || historyCompletedRef.current || historyInFlightRef.current) return;

    historyInFlightRef.current = true;
    setHistoryStatus("loading");
    getPriceHistory(order.ticker, order.timestamp_utc)
      .then((data) => {
        setBars(data);
        setHistoryStatus(data.length > 0 ? "live" : PUBLIC_DEMO ? "unavailable" : "synthetic");
      })
      .catch(() => setHistoryStatus(PUBLIC_DEMO ? "unavailable" : "synthetic"))
      .finally(() => {
        historyInFlightRef.current = false;
        historyCompletedRef.current = true;
      });
  }

  const status = getStatusConfig(order.status ?? "ACTIVE");
  const measuredPnl = order.pnl_percent ?? order.pnl_pct;
  const pnlPct = typeof measuredPnl === "number" && Number.isFinite(measuredPnl) ? measuredPnl : undefined;
  const referencePrice = order.resolved_price ?? order.current_price;
  const record = (
    <tbody className={`rec-ledger-record ${styles.row}${expanded ? " is-expanded" : ""}`} role="rowgroup" style={{ "--record-order": Math.min(index, 8) } as CSSProperties}>
      <tr className="rec-ledger-row" role="row">
        <th scope="row" className="rec-ledger-identity-cell" role="rowheader">
          <div className="rec-ledger-identity">
            <strong className="rec-ledger-ticker">{order.ticker}</strong>
            <span className="rec-ledger-action">{order.action}</span>
          </div>
          <code className={`terminal-record-id ${styles.recordId}`}>REC-{String(order.id).padStart(5, "0")}</code>
          <span className="rec-ledger-strategy">{order.strategy_used}</span>
          <span className="rec-ledger-conviction" aria-label={`Conviction ${order.conviction_score} out of 100`}>
            Conviction {order.conviction_score}/100
          </span>
          <span className={`terminal-conviction-meter ${styles.meter}`} aria-hidden="true">
            <span style={{ width: `${Math.min(100, Math.max(0, order.conviction_score))}%` }} />
          </span>
          <time className="rec-ledger-date" dateTime={order.timestamp_utc} title={order.timestamp_utc}>
            {formatDateTime(order.timestamp_utc)}
          </time>
        </th>
        <td className="rec-ledger-number" data-label="Entry" role="cell">
          <span className="rec-ledger-value">{formatCurrency(order.limit_price)}</span>
        </td>
        <td className="rec-ledger-number" data-label="Stop" role="cell">
          <span className="rec-ledger-value">{formatCurrency(order.stop_loss)}</span>
        </td>
        <td className="rec-ledger-number" data-label="Target" role="cell">
          <span className="rec-ledger-value">{formatCurrency(order.target_price)}</span>
        </td>
        <td className="rec-ledger-number" data-label="Allocation" role="cell">
          <span className="rec-ledger-value">{formatCurrency(order.recommended_size_usd, 0)}</span>
          <span className="rec-ledger-subvalue">R:R 1:{calcRiskReward(order)}</span>
        </td>
        <td className="rec-ledger-outcome-cell" data-label="Modeled return" role="cell">
          <span
            className="rec-ledger-value"
            style={{ color: pnlPct === undefined ? "var(--color-text-muted)" : pnlPct < 0 ? "var(--color-loss)" : "var(--color-profit)" }}
            aria-label={pnlPct === undefined ? "Modeled return unavailable" : undefined}
          >
            {pnlPct === undefined ? "—" : `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`}
          </span>
          <span className="rec-ledger-subvalue" style={{ color: status.color }}>{status.label}</span>
          {referencePrice != null && (
            <span className="rec-ledger-subvalue">{order.resolved_price != null ? "Resolved" : PUBLIC_DEMO ? "At scan" : "Latest"} {formatCurrency(referencePrice)}</span>
          )}
        </td>
        <td className="rec-ledger-inspect" role="cell">
          <div className="rec-ledger-actions">
            {onViewAnalysis && (
              <button
                type="button"
                className="rec-ledger-action-button"
                onClick={(event) => onViewAnalysis(order, event.currentTarget)}
                aria-label={`View analysis for ${order.ticker}`}
              >
                View analysis
              </button>
            )}
            <button
              type="button"
              className="rec-ledger-action-button"
              onClick={handleToggleChart}
              aria-expanded={expanded}
              aria-controls={chartId}
              aria-label={`${expanded ? "Hide" : "View"} chart for ${order.ticker}`}
            >
              {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
              {expanded ? "Hide chart" : "View chart"}
            </button>
          </div>
        </td>
      </tr>
      <tr className="rec-ledger-context-row" role="row">
        <td colSpan={7} role="cell">
          <div className="rec-ledger-record-context">
            <p className="rec-ledger-rationale">{truncateThesis(order.rationale) || "Rationale unavailable"}</p>
            <dl className="rec-ledger-facts">
              <div><dt>Catalyst</dt><dd>{getCatalystLabel(order.catalyst_type)}</dd></div>
              <div><dt>Market at recommendation</dt><dd>VIX {order.regime_vix} · SPY {order.spy_above_200sma ? "above" : "below"} 200-day average</dd></div>
              {order.execution && <div><dt>Execution</dt><dd>{formatExecutionLabel(order.execution)}</dd></div>}
            </dl>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="rec-ledger-chart-row" role="row">
          <td colSpan={7} role="cell">
            <div className={`rec-ledger-chart ${styles.detail}`} id={chartId} role="region" aria-label={`Price history for ${order.ticker}`}>
              <div className="rec-ledger-chart-heading">
                <div className="rec-ledger-chart-legend">
                  <span data-level="entry">Entry</span>
                  <span data-level="stop">Stop</span>
                  <span data-level="target">Target</span>
                </div>
                <span>Recommendation generated {formatDateTime(order.timestamp_utc)}</span>
              </div>
              {historyStatus === "loading" && <p className="rec-ledger-chart-notice" role="status">Fetching price data…</p>}
              {historyStatus === "unavailable" && <p className="rec-ledger-chart-notice" role="status">Price history was not included in this snapshot.</p>}
              {(historyStatus === "live" || historyStatus === "synthetic") && (
                <PriceChart
                  order={order}
                  bars={bars.length > 0 ? bars : undefined}
                  height={240}
                  dataSource={historyStatus}
                />
              )}
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );

  if (withinTable) return record;
  return (
    <table className="rec-ledger-table" role="table" aria-label={`Recommendation for ${order.ticker}`}>
      <RecommendationTableHeader />
      {record}
    </table>
  );
}
