"use client";

import type { RefObject } from "react";
import { ChevronDown } from "lucide-react";
import type { PublicSnapshot, RunStatus } from "@/lib/snapshot";

interface SnapshotStatusProps {
  data: PublicSnapshot;
  attempt: RunStatus | null;
  error: string | null;
  now: number;
  reportRef: RefObject<HTMLDetailsElement | null>;
}

export function SnapshotStatus({ data, attempt, error, now, reportRef }: SnapshotStatusProps) {
  const waiting = data.status === "awaiting_first_run";
  const stale = now - Date.parse(data.as_of) > 96 * 3_600_000;
  const completed = data.hunters.filter((hunter) => hunter.success).length;
  const scanStatus = waiting ? "Awaiting first scan" : stale ? "Stale snapshot" : data.status === "partial" ? "Partial scan" : "Scan complete";
  const collected = new Date(data.as_of).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  const newerAttempt = attempt && Date.parse(attempt.updated_at) > Date.parse(data.as_of);

  return (
    <section className="scan-summary" aria-label="Published scan">
      <div className="scan-summary-meta">
        <span className={"scan-status" + (stale || error || data.status === "partial" ? " scan-status--attention" : "")}>
          {error ? "Showing saved snapshot" : scanStatus}
        </span>
        <p>{waiting ? "Waiting for the first published results" : <>Collected <time dateTime={data.as_of}>{collected}</time></>}</p>
      </div>
      <p className="scan-summary-note">Weekday collection · Prices and modeled outcomes use scheduled checks.</p>
      {newerAttempt && (attempt.status === "failed" || attempt.status === "running") && (
        <p role="status" className="scan-summary-warning">
          {attempt.status === "running" ? "A new scan is running. Previous results remain available." : "The latest run failed to publish. Previous results are retained; the next weekday scan retries automatically."}
        </p>
      )}
      {error && <p role="alert" className="scan-summary-warning">Refresh failed; retaining saved results. {error}</p>}
      <details ref={reportRef} className="snapshot-details">
        <summary>
          <ChevronDown size={16} aria-hidden="true" />
          <span>Scan report <span className="scan-report-count">· {waiting ? "Awaiting first scan" : `${data.event_counts["raw-events"] ?? 0} raw events · ${completed}/${data.hunters.length} hunters completed`}</span></span>
        </summary>
        <div className="scan-report-body">
          <p>Runs once each weekday at 10:00 AM New York time, then the worker stops. Prices are captured at collection. Modeled outcomes may miss intraday stop or target crossings. Brokerage execution is disabled.</p>
          {!waiting && <>
            <div className="scan-report-table-wrap" tabIndex={0} role="region" aria-label="Hunter sweep outcomes">
              <table className="scan-report-table">
                <thead><tr><th scope="col">Hunter</th><th scope="col">Outcome</th><th scope="col">Events</th><th scope="col">Duration</th></tr></thead>
                <tbody>{data.hunters.map((hunter) => <tr key={hunter.hunter}>
                  <th scope="row">{hunter.hunter}</th>
                  <td><span className={hunter.success ? "" : "scan-report-failure"}>{hunter.success ? "Sweep completed" : hunter.error ?? "Unavailable"}</span></td>
                  <td>{hunter.emitted_events ?? "—"}</td><td>{hunter.duration_sec.toFixed(1)}s</td>
                </tr>)}</tbody>
              </table>
            </div>
            <p>{data.regime?.fresh ? `Regime data verified · VIX ${data.regime.vix?.toFixed(2) ?? "unavailable"}` : "Regime data unavailable; new recommendations are halted."} · Two-source confluence and grounded Gemini required.</p>
            <p className="scan-report-provenance">Run {data.run_id} · Commit {data.commit.slice(0, 7)} · Latest 200 recommendations and signals retained</p>
          </>}
        </div>
      </details>
    </section>
  );
}
