"use client";

import { useEffect, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import type { PublicSnapshot, RunStatus } from "@/lib/snapshot";

interface SnapshotStatusProps {
  data: PublicSnapshot;
  attempt: RunStatus | null;
  error: string | null;
  now: number;
  reportRef: RefObject<HTMLDetailsElement | null>;
  prominent?: boolean;
}

const PROVIDERS: Record<string, string> = {
  squeeze: "Finviz · Short interest & volume",
  biotech: "BioPharmCatalyst · Clinical events",
  insider: "SEC EDGAR · Insider purchases",
  whale: "Barchart · Options activity",
  drifter: "FMP · Earnings surprises",
};

export function SnapshotStatus({ data, attempt, error, now, reportRef, prominent = false }: SnapshotStatusProps) {
  useEffect(() => {
    if (prominent && data.orders.length === 0 && window.matchMedia?.("(min-width: 960px)").matches && reportRef.current) {
      reportRef.current.open = true;
    }
  }, [prominent, reportRef, data.orders.length]);
  const waiting = data.status === "awaiting_first_run";
  const stale = now - Date.parse(data.as_of) > 96 * 3_600_000;
  const completed = data.hunters.filter((hunter) => hunter.success).length;
  const scanStatus = waiting ? "Awaiting first scan" : stale ? "Stale snapshot" : data.status === "partial" ? "Partial scan" : "Scan complete";
  const collected = new Date(data.as_of).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  const newerAttempt = attempt && Date.parse(attempt.updated_at) > Date.parse(data.as_of);
  const stages = [
    { label: "Collected", topic: "raw-events", note: "Raw market events" },
    { label: "Triaged", topic: "triage-priority", note: "Confluence check" },
    { label: "Validated", topic: "validated-signals", note: "Grounded analysis" },
    { label: "Sized", topic: "trade-orders", note: "Risk & regime" },
  ];

  return (
    <section className={"scan-summary" + (prominent ? " scan-summary--ledger" : "")} aria-label="Published scan">
      <div className="scan-summary-meta">
        <div>
          <p className="record-label">Latest published scan</p>
          <p className="scan-collected">{waiting ? "Waiting for the first published results" : <time dateTime={data.as_of}>{collected}</time>}</p>
        </div>
        <span className={"scan-status" + (stale || error || data.status === "partial" ? " scan-status--attention" : "")}>
          <span aria-hidden="true" className="status-dot" />{error ? "Showing saved snapshot" : scanStatus}
        </span>
      </div>
      {newerAttempt && (attempt.status === "failed" || attempt.status === "running") && (
        <p role="status" className="scan-summary-warning">
          {attempt.status === "running" ? "A new scan is running. Previous results remain available." : "The latest run failed to publish. Previous results are retained; the next weekday scan retries automatically."}
        </p>
      )}
      {error && <p role="alert" className="scan-summary-warning">Refresh failed; retaining saved results. {error}</p>}
      {prominent && !waiting && <dl className="pipeline-ledger" aria-label="Events from this scan">
        {stages.map((stage, index) => <div key={stage.topic}>
          <dt><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{stage.label}</dt>
          <dd>{data.event_counts[stage.topic] == null ? "—" : data.event_counts[stage.topic].toLocaleString("en-US")}</dd>
          <p>{data.event_counts[stage.topic] == null ? "Count not exported" : stage.note}</p>
        </div>)}
      </dl>}
      <details ref={reportRef} className="snapshot-details">
        <summary>
          <span>Scan report <span className="scan-report-count">· {waiting ? "Awaiting first scan" : `${data.event_counts["raw-events"] ?? "—"} raw events · ${completed}/${data.hunters.length} hunters completed`}</span></span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div className="scan-report-body">
          {!waiting && <>
            <div className="hunter-ledger" aria-label="Hunter sweep outcomes">
              <div className="hunter-ledger-heading" aria-hidden="true"><span>Source / hunter</span><span>Outcome</span><span>Events</span><span>Time</span></div>
              <ul>
                {data.hunters.map((hunter) => <li key={hunter.hunter}>
                  <div className="hunter-identity"><strong>{hunter.hunter}</strong><span>{PROVIDERS[hunter.hunter.toLowerCase()] ?? "Market event source"}</span></div>
                  <span className={"hunter-outcome" + (hunter.success ? "" : " scan-report-failure")}><span className="status-dot" aria-hidden="true" />{hunter.success ? "Completed" : hunter.error ?? "Unavailable"}</span>
                  <span className="hunter-number"><span className="hunter-mobile-label">Events </span>{hunter.emitted_events ?? "—"}</span>
                  <span className="hunter-number"><span className="hunter-mobile-label">Time </span>{hunter.duration_sec.toFixed(1)}s</span>
                </li>)}
              </ul>
            </div>
            <p className="scan-regime-note"><span className="record-label">Market regime</span>{data.regime?.fresh ? `Fresh data · VIX ${data.regime.vix?.toFixed(2) ?? "unavailable"}` : "Regime data unavailable; new recommendations are halted."}</p>
          </>}
          <p className="scan-scope-note">Runs once each weekday at 10:00 AM New York time, then the worker stops. Prices are captured at collection. Modeled outcomes may miss intraday stop or target crossings. Brokerage execution is disabled.</p>
          {!waiting && <p className="scan-report-provenance"><span>Run {data.run_id}</span><span>Commit {data.commit.slice(0, 7)}</span><span>Latest 200 recommendations and signals retained</span></p>}
        </div>
      </details>
    </section>
  );
}
