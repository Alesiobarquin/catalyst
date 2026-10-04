"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadSnapshot, loadRunStatus, type RunStatus, filterRows, paginate, downloadCsv, type PublicSnapshot } from "@/lib/snapshot";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { TradeList } from "@/components/dashboard/TradeList";
import { MarketOverviewBar } from "@/components/dashboard/MarketOverviewBar";
import { SignalRow } from "@/components/signals/SignalRow";
import { SignalFilterBar } from "@/components/signals/SignalFilterBar";
import { Pagination } from "@/components/ui/Pagination";
import { StrategyBreakdown, ConvictionHistogram, SignalTimeline, PerformanceSummary } from "@/components/analytics/Charts";
import { KellySimulator } from "@/components/analytics/KellySimulator";

type View = "orders" | "signals" | "analytics";
const buttonStyle = { background: "#1E293B", border: "1px solid #334155", padding: "8px 14px", borderRadius: 4, color: "#38BDF8", cursor: "pointer", fontSize: 12 };

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
  const stale = now - Date.parse(data.as_of) > 96 * 3_600_000;
  const query = Object.fromEntries(sp.entries());
  const events = data.event_counts["raw-events"] ?? 0;
  const waiting = data.status === "awaiting_first_run";
  return <>
    <div className="glass-card" style={{ padding: "16px 20px", marginBottom: 24, borderColor: stale || error ? "#92400E" : "#1E3A5F" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <strong style={{ color: "#38BDF8", fontSize: 13 }}>DAILY PORTFOLIO DEMO · READ ONLY</strong>
        <span style={{ fontSize: 12, color: "#CBD5E1" }}>
          {waiting ? "Waiting for the first completed scan" : `Last scan: ${new Date(data.as_of).toLocaleString("en-US", { timeZone: "America/New_York" })} ET`}
          {!waiting && (stale ? " · STALE" : data.status === "partial" ? " · Some sources unavailable" : " · Published")}
        </span>
      </div>
      <p style={{ color: "#94A3B8", fontSize: 12, lineHeight: 1.7, margin: "8px 0 0" }}>
        The AWS pipeline scans once each weekday at 10:00 AM New York time. Results remain available while the worker is stopped. Quotes and analyses reflect collection time.
        Recommendation P&amp;L uses sampled prices; daily checks can miss intraday stop or target crossings. No brokerage trading is enabled.
      </p>
      {attempt && Date.parse(attempt.updated_at) > Date.parse(data.as_of) && (attempt.status === "failed" || attempt.status === "running") && <p role="status" style={{ color: "#FBBF24", fontSize: 12 }}>{attempt.status === "running" ? "A new scan is running; the previous published dataset remains available." : "The latest run failed to publish. Previous results are retained; the next weekday scan retries automatically."}</p>}
      {error && <p role="alert">Refresh failed; retaining the previously loaded results. {error}</p>}
      {!waiting && <details style={{ marginTop: 10, fontSize: 12, color: "#CBD5E1" }}><summary>Scan report · {events} raw events · {data.hunters.filter((h) => h.success).length}/5 sweeps completed</summary>
        <div style={{ overflowX: "auto" }}><table style={{ marginTop: 12, width: "100%", textAlign: "left", borderCollapse: "collapse" }}><thead><tr><th>Source</th><th>Outcome</th><th>Events</th><th>Duration</th></tr></thead><tbody>
          {data.hunters.map((h) => <tr key={h.hunter}><td style={{ padding: "6px 0" }}>{h.hunter}</td><td>{h.success ? "Sweep completed" : h.error ?? "Unavailable"}</td><td>{h.emitted_events ?? "—"}</td><td>{h.duration_sec.toFixed(1)}s</td></tr>)}
        </tbody></table></div>
        <p>Run {data.run_id} · Commit {data.commit.slice(0, 7)} · Grounded Gemini only · Two-source confluence required</p>
        <p>{data.regime?.fresh ? `Regime data verified · VIX ${data.regime.vix?.toFixed(2)}` : "Regime data unavailable; new recommendations are halted."} · Latest 200 recommendations and signals retained in the public snapshot.</p>
      </details>}
    </div>
    <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>{view === "orders" ? "Signal Dashboard" : view === "signals" ? "Validated signals" : "Analytics"}</h1>
    <p style={{ fontSize: 13, color: "#94A3B8", marginBottom: 20 }}>{view === "analytics" ? "Modeled recommendation outcomes · Signal quality · Strategy distribution" : "Gemini search grounding · Half-Kelly sizing · VIX/SPY regime filtering"}</p>
    {view === "orders" && <>
      <MarketOverviewBar key={data.run_id} initialQuotes={data.benchmarks} asOf={data.as_of} />
      <StatsBar stats={data.order_stats} />
      <FilterBar key={sp.toString()} initialStrategy={strategy as "all"} initialDateRange={dateRange as "all"} initialStatus={status as "all"} initialTicker={ticker} />
      <button style={{ ...buttonStyle, marginBottom: 18 }} disabled={!rows.length} onClick={() => downloadCsv(rows, "catalyst-recommendations.csv")}>Export filtered CSV</button>
      <TradeList orders={ordersPage.items} hasActiveFilters={Boolean(sp.toString())} />
      <Pagination page={page} total={rows.length} perPage={15} basePath="/" query={query} />
    </>}
    {view === "signals" && <>
      <p style={{ color: "#CBD5E1", fontSize: 13 }}>{data.signal_stats.total_signals} grounded signals · {data.signal_stats.avg_conviction.toFixed(0)}/100 average conviction · {data.signal_stats.trap_count} flagged traps</p>
      <SignalFilterBar key={sp.toString()} initialCatalyst={catalyst} initialMinConviction={conviction} initialTrap={trap === "true" ? "trap" : trap === "false" ? "clean" : "all"} initialTicker={ticker} initialDateRange={dateRange as "all"} />
      <button style={{ ...buttonStyle, marginBottom: 18 }} disabled={!signals.length} onClick={() => downloadCsv(signals, "catalyst-signals.csv")}>Export filtered CSV</button>
      {!signals.length ? <div className="glass-card" style={{ padding: 32 }}><h2>No qualifying signals in this snapshot</h2><p style={{ color: "#94A3B8", fontSize: 13 }}>A scan can finish without a catalyst passing confluence, liquidity, grounding, and conviction checks. See the scan report above for source outcomes.</p></div> :
        <div className="glass-card" style={{ overflowX: "auto" }}>{signalsPage.items.map((signal, i) => <SignalRow key={signal.id} signal={signal} isLast={i === signalsPage.items.length - 1} />)}</div>}
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
