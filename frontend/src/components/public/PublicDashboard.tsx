"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadSnapshot, loadRunStatus, type RunStatus, filterRows, paginate, downloadCsv, type PublicSnapshot } from "@/lib/snapshot";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { TradeList } from "@/components/dashboard/TradeList";
import { MarketOverviewBar } from "@/components/dashboard/MarketOverviewBar";
import { SignalTable } from "@/components/signals/SignalTable";
import { SignalFilterBar } from "@/components/signals/SignalFilterBar";
import { Pagination } from "@/components/ui/Pagination";
import { StrategyBreakdown, ConvictionHistogram, SignalTimeline, PerformanceSummary } from "@/components/analytics/Charts";
import { KellySimulator } from "@/components/analytics/KellySimulator";
import { SnapshotStatus } from "./SnapshotStatus";
import { EmptyResults } from "./EmptyResults";

type View = "orders" | "signals" | "analytics";
const PAGE_COPY = {
  orders: { title: "Signal Dashboard", description: "Market catalysts filtered for evidence and sized for risk." },
  signals: { title: "Validated signals", description: "Search-grounded catalysts that passed the pipeline’s validation checks." },
  analytics: { title: "Analytics", description: "Recommendation quality and modeled outcomes from scheduled price checks." },
};

export function PublicDashboard({ view }: { view: View }) {
  return <Suspense fallback={<p role="status">Loading daily results…</p>}><Content view={view} /></Suspense>;
}

function Content({ view }: { view: View }) {
  const [data, setData] = useState<PublicSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [attempt, setAttempt] = useState<RunStatus | null>(null);
  const reportRef = useRef<HTMLDetailsElement>(null);
  const sp = useSearchParams();
  useEffect(() => {
    let active = true;
    const refresh = () => Promise.all([loadSnapshot(), loadRunStatus()]).then(([value, status]) => {
      if (active) { setData(value); setAttempt(status); setError(null); setNow(Date.now()); }
    }).catch((reason: Error) => { if (active) setError(reason.message); });
    void refresh();
    const timer = setInterval(refresh, 300_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  function viewReport() {
    const report = reportRef.current;
    if (!report) return;
    report.open = true;
    report.querySelector("summary")?.focus();
    report.scrollIntoView({ block: "start" });
  }

  const copy = PAGE_COPY[view];
  const header = <header className="page-heading">
    <p className="page-eyebrow">Daily research · Read only</p>
    <h1>{copy.title}</h1>
    <p className="page-description">{copy.description}</p>
  </header>;

  if (!data) return <>{header}<div className="empty-results" aria-busy={!error}>
    <p role={error ? "alert" : "status"}>{error ?? "Loading the latest published scan…"}</p>
    {error && <button type="button" className="button-secondary" onClick={() => window.location.reload()}>Retry</button>}
  </div></>;

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const ticker = sp.get("ticker") ?? "";
  const dateRange = sp.get("date_range") ?? "all";
  const strategy = sp.get("strategy") ?? "all";
  const status = sp.get("status") ?? "all";
  const catalyst = sp.get("catalyst_type") ?? "all";
  const conviction = sp.get("min_conviction") ?? "all";
  const trap = sp.get("is_trap");
  const rows = filterRows(data.orders, { ticker, date_range: dateRange }).filter((o) =>
    (strategy === "all" || o.strategy_used === strategy) && (status === "all" || o.status === status));
  const signals = filterRows(data.signals, { ticker, date_range: dateRange }).filter((s) =>
    (catalyst === "all" || s.catalyst_type === catalyst) && (conviction === "all" || s.conviction_score >= Number(conviction)) && (trap === null || s.is_trap === (trap === "true")));
  const ordersPage = paginate(rows, page);
  const signalsPage = paginate(signals, page);
  const query = Object.fromEntries(sp.entries());
  const hasOrderFilters = Boolean(ticker) || dateRange !== "all" || strategy !== "all" || status !== "all";
  const hasSignalFilters = Boolean(ticker) || dateRange !== "all" || catalyst !== "all" || conviction !== "all" || trap !== null;
  const waiting = data.status === "awaiting_first_run";
  const emptyExplanation = waiting ? "The first weekday scan has not published yet. The dashboard will update automatically when results are available." : data.hunters.some((hunter) => !hunter.success)
    ? "Some hunter sweeps could not complete, and no recommendation was published. The scan report shows which feeds were available."
    : data.regime && !data.regime.fresh ? "Fresh market-regime data was unavailable, so new recommendations were halted. See the scan report for collection details."
    : "No catalyst passed all validation and sizing checks in this snapshot. New results appear after the next weekday scan.";

  return <>
    {header}
    <SnapshotStatus data={data} attempt={attempt} error={error} now={now} reportRef={reportRef} />
    {view === "orders" && <>
      {data.order_stats.total_orders > 0 && <StatsBar stats={data.order_stats} snapshot />}
      {(data.orders.length > 0 || hasOrderFilters) && <>
        <FilterBar key={sp.toString()} initialStrategy={strategy as "all"} initialDateRange={dateRange as "all"} initialStatus={status as "all"} initialTicker={ticker} />
        <div className="results-toolbar">
          <h2>Recommendations <span>{rows.length}{hasOrderFilters ? " of " + data.orders.length : ""}</span></h2>
          {rows.length > 0 && <button type="button" className="button-secondary" onClick={() => downloadCsv(rows, "catalyst-recommendations.csv")}>Export CSV</button>}
        </div>
      </>}
      {rows.length === 0 ? <EmptyResults title={hasOrderFilters ? "No recommendations match current filters" : "No recommendations in this snapshot"} onViewReport={viewReport} filtered={hasOrderFilters}>
        {hasOrderFilters ? "Try another ticker, strategy, or date range, or clear the filters to see all published recommendations." : emptyExplanation}
      </EmptyResults> : <TradeList orders={ordersPage.items} hasActiveFilters={hasOrderFilters} />}
      <Pagination page={ordersPage.page} total={rows.length} perPage={15} basePath="/" query={query} />
      <MarketOverviewBar key={data.run_id} initialQuotes={data.benchmarks} asOf={data.as_of} />
    </>}
    {view === "signals" && <>
      {(data.signals.length > 0 || hasSignalFilters) && <>
        <SignalFilterBar key={sp.toString()} initialCatalyst={catalyst} initialMinConviction={conviction} initialTrap={trap === "true" ? "trap" : trap === "false" ? "clean" : "all"} initialTicker={ticker} initialDateRange={dateRange as "all"} />
        <div className="results-toolbar">
          <div><h2>Signals <span>{signals.length}{hasSignalFilters ? " of " + data.signals.length : ""}</span></h2>
            <p>{data.signal_stats.total_signals > 0 ? data.signal_stats.avg_conviction.toFixed(0) + "/100 average conviction" : "No average conviction yet"} · {data.signal_stats.trap_count} flagged traps · All published signals</p>
          </div>
          {signals.length > 0 && <button type="button" className="button-secondary" onClick={() => downloadCsv(signals, "catalyst-signals.csv")}>Export CSV</button>}
        </div>
      </>}
      {signals.length === 0 ? <EmptyResults title={hasSignalFilters ? "No signals match current filters" : "No qualifying signals in this snapshot"} onViewReport={viewReport} filtered={hasSignalFilters} resetPath="/signals">
        {hasSignalFilters ? "Try another ticker or lower the conviction threshold, or clear the filters to see all published signals." : waiting ? emptyExplanation : "No qualifying signal was published. Signals require confluence, liquidity, grounding, and conviction checks. The scan report shows completed hunter sweeps and unavailable feeds."}
      </EmptyResults> : <SignalTable signals={signalsPage.items} asOf={data.as_of} />}
      <Pagination page={signalsPage.page} total={signals.length} perPage={15} basePath="/signals" query={query} />
    </>}
    {view === "analytics" && <>
      {data.order_stats.total_orders > 0 ? <div className="public-analytics-grid">
        <PerformanceSummary stats={data.order_stats} snapshot />
        <div className="analytics-distribution-grid"><StrategyBreakdown stats={data.order_stats} /><ConvictionHistogram stats={data.order_stats} /><SignalTimeline stats={data.order_stats} /></div>
      </div> : <EmptyResults title="No recommendation data to analyze yet" onViewReport={viewReport}>
        Performance and distribution charts will appear when recommendations are published. You can explore the sizing model below in the meantime.
      </EmptyResults>}
      <KellySimulator />
    </>}
  </>;
}
