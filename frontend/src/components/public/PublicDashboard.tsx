"use client";

import { Suspense, useEffect, useState } from "react";
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

type View = "orders" | "signals" | "analytics";
const buttonStyle = { background: "var(--color-bg-row)", border: "1px solid var(--color-border)", padding: "8px 14px", borderRadius: 4, color: "var(--color-link)", cursor: "pointer", fontSize: 12 };

function formatEasternTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function PublicDashboard({ view }: { view: View }) {
  return <Suspense fallback={<p>Loading daily results…</p>}><Content view={view} /></Suspense>;
}

function Content({ view }: { view: View }) {
  const [data, setData] = useState<PublicSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [attempt, setAttempt] = useState<RunStatus | null>(null);
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
  if (!data) return <div className="glass-card" style={{ padding: 28 }}><h1>Catalyst daily results</h1><p role="status">{error ?? "Loading the latest published scan…"}</p>{error && <button style={buttonStyle} onClick={() => window.location.reload()}>Retry</button>}</div>;
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
  const waiting = data.status === "awaiting_first_run";
  const stale = now - Date.parse(data.as_of) > 96 * 3_600_000;
  const successfulHunters = data.hunters.filter((hunter) => hunter.success).length;
  const scanStatus = waiting
    ? "Awaiting first scan"
    : stale
      ? "Stale snapshot"
      : data.status === "partial"
        ? "Partial scan · " + successfulHunters + "/5 sources"
        : "Scan complete";
  const query = Object.fromEntries(sp.entries());
  const hasOrderFilters = Boolean(ticker) || dateRange !== "all" || strategy !== "all" || status !== "all";
  const prioritizeEmptyState = rows.length === 0 && !hasOrderFilters;
  const events = data.event_counts["raw-events"] ?? 0;
  return <>
    <div className="glass-card public-snapshot-banner" style={{ padding: "16px 20px", marginBottom: 24, borderColor: stale || error || data.status === "partial" ? "var(--color-warning-border)" : "var(--color-border)" }}>
      <div className="public-snapshot-heading">
        <strong style={{ color: "var(--color-link)", fontSize: 13 }}>DAILY PORTFOLIO DEMO · READ ONLY</strong>
        <span className={"scan-status" + (stale || error || data.status === "partial" ? " scan-status--attention" : "")}>
          {error ? "Showing saved snapshot" : scanStatus}
        </span>
      </div>
      <p className="public-snapshot-time">
        {waiting ? "Waiting for the first completed scan" : "Collected " + formatEasternTimestamp(data.as_of)}
      </p>
      <p className="public-snapshot-caveat">
        Weekday scan · collection-time prices · modeled outcomes; intraday stop or target crossings may be missed.
      </p>
      {attempt && Date.parse(attempt.updated_at) > Date.parse(data.as_of) && (attempt.status === "failed" || attempt.status === "running") && <p role="status" style={{ color: "var(--color-warning)", fontSize: 12 }}>{attempt.status === "running" ? "A new scan is running; the previous published dataset remains available." : "The latest run failed to publish. Previous results are retained; the next weekday scan retries automatically."}</p>}
      {error && <p role="alert">Refresh failed; retaining the previously loaded results. {error}</p>}
      <details className="snapshot-details">
        <summary>{waiting ? "Run details · awaiting first scan" : "Run details · " + events + " raw events · " + successfulHunters + "/5 sources"}</summary>
        <p>Runs once each weekday at 10:00 AM New York time, then the worker stops. Outcome calculations use scheduled price checks and may miss intraday crossings. Brokerage execution is disabled.</p>
        {!waiting && <>
          <div style={{ overflowX: "auto" }}><table style={{ marginTop: 12, width: "100%", textAlign: "left", borderCollapse: "collapse" }}><thead><tr><th scope="col">Source</th><th scope="col">Outcome</th><th scope="col">Events</th><th scope="col">Duration</th></tr></thead><tbody>
            {data.hunters.map((hunter) => <tr key={hunter.hunter}><td style={{ padding: "6px 0" }}>{hunter.hunter}</td><td>{hunter.success ? "Sweep completed" : hunter.error ?? "Unavailable"}</td><td>{hunter.emitted_events ?? "—"}</td><td>{hunter.duration_sec.toFixed(1)}s</td></tr>)}
          </tbody></table></div>
          <p>Run {data.run_id} · Commit {data.commit.slice(0, 7)} · Grounded Gemini only · Two-source confluence required</p>
          <p>{data.regime?.fresh ? "Regime data verified · VIX " + data.regime.vix?.toFixed(2) : "Regime data unavailable; new recommendations are halted."} · Latest 200 recommendations and signals retained in the public snapshot.</p>
        </>}
      </details>
    </div>
    <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>{view === "orders" ? "Signal Dashboard" : view === "signals" ? "Validated signals" : "Analytics"}</h1>
    <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 20 }}>{view === "analytics" ? "Sampled recommendation outcomes · Signal quality · Strategy distribution" : "Gemini search grounding · Half-Kelly sizing · VIX/SPY regime filtering"}</p>
    {view === "orders" && <>
      {prioritizeEmptyState && <TradeList orders={ordersPage.items} hasActiveFilters={false} />}
      <StatsBar stats={data.order_stats} />
      {!prioritizeEmptyState && <>
        <FilterBar key={sp.toString()} initialStrategy={strategy as "all"} initialDateRange={dateRange as "all"} initialStatus={status as "all"} initialTicker={ticker} />
        <button style={{ ...buttonStyle, marginBottom: 18 }} disabled={!rows.length} onClick={() => downloadCsv(rows, "catalyst-recommendations.csv")}>Export filtered CSV</button>
        <TradeList orders={ordersPage.items} hasActiveFilters={hasOrderFilters} />
        <Pagination page={page} total={rows.length} perPage={15} basePath="/" query={query} />
      </>}
      <MarketOverviewBar key={data.run_id} initialQuotes={data.benchmarks} asOf={data.as_of} />
    </>}
    {view === "signals" && <>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
        {data.signal_stats.total_signals} grounded signals · {data.signal_stats.total_signals > 0 ? data.signal_stats.avg_conviction.toFixed(0) + "/100 average conviction" : "No average conviction yet"} · {data.signal_stats.trap_count} flagged traps
      </p>
      <SignalFilterBar key={sp.toString()} initialCatalyst={catalyst} initialMinConviction={conviction} initialTrap={trap === "true" ? "trap" : trap === "false" ? "clean" : "all"} initialTicker={ticker} initialDateRange={dateRange as "all"} />
      <button style={{ ...buttonStyle, marginBottom: 18 }} disabled={!signals.length} onClick={() => downloadCsv(signals, "catalyst-signals.csv")}>Export filtered CSV</button>
      {!signals.length ? <div className="glass-card" style={{ padding: 32 }}><h2>No qualifying signals in this snapshot</h2><p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>A scan can finish without a catalyst passing confluence, liquidity, grounding, and conviction checks. See the scan report above for source outcomes.</p></div> :
        <SignalTable signals={signalsPage.items} />}
      <Pagination page={page} total={signals.length} perPage={15} basePath="/signals" query={query} />
    </>}
    {view === "analytics" && <>
      <StatsBar stats={data.order_stats} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 24 }}>
        <PerformanceSummary stats={data.order_stats} /><StrategyBreakdown stats={data.order_stats} /><ConvictionHistogram stats={data.order_stats} /><SignalTimeline stats={data.order_stats} />
      </div>
      <KellySimulator />
    </>}
  </>;
}
