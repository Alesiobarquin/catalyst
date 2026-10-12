"use client";

import { useState, type CSSProperties } from "react";
import { ChevronDown, AlertTriangle, ArrowUpRight } from "lucide-react";
import type { MarketQuote, ValidatedSignal } from "@/types";
import { formatCurrency, formatDateTime, getCatalystLabel } from "@/lib/utils";
import { getQuote } from "@/lib/api";
import { PUBLIC_DEMO } from "@/lib/snapshot";
import styles from "@/components/dashboard/TerminalRecords.module.css";

const COLUMNS = ["Ticker", "Time", "Conviction", "Catalyst", "Rationale", "Sources"];

function RecordRow({ signal, asOf, index }: { signal: ValidatedSignal; asOf?: string; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const snapshot = Boolean(asOf) || PUBLIC_DEMO;
  const detailId = `signal-record-${signal.id}`;

  async function inspectQuote() {
    if (loading) return;
    setLoading(true);
    setUnavailable(false);
    try {
      const result = await getQuote(signal.ticker);
      setQuote(result);
      setUnavailable(!result);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }

  return <>
    <div role="row" className={`signal-record-row ${styles.row}${expanded ? " is-expanded" : ""}`} style={{ "--record-order": Math.min(index, 8) } as CSSProperties}>
      <div role="cell" aria-label={`Ticker ${signal.ticker}`} className="signal-record-cell signal-record-ticker">
        <span className="signal-record-label">Ticker</span>
        <div className={styles.instrument}><strong>{signal.ticker}</strong><code className={`terminal-record-id ${styles.recordId}`}>SIG-{String(signal.id).padStart(5, "0")}</code></div>
        {signal.is_trap && <AlertTriangle size={14} aria-label="Trap detected" />}
      </div>
      <div role="cell" className="signal-record-cell signal-record-time">
        <span className="signal-record-label">Time</span>
        <time dateTime={signal.timestamp_utc}>{formatDateTime(signal.timestamp_utc)}</time>
      </div>
      <div role="cell" aria-label={`Conviction ${signal.conviction_score} out of 100`} className="signal-record-cell signal-record-score">
        <span className="signal-record-label">Conviction</span>
        <strong>{signal.conviction_score}<small>/100</small></strong>
        <span className={`terminal-conviction-meter ${styles.meter}`} aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, signal.conviction_score))}%` }} /></span>
      </div>
      <div role="cell" className="signal-record-cell signal-record-catalyst">
        <span className="signal-record-label">Catalyst</span>{getCatalystLabel(signal.catalyst_type)}
      </div>
      <div role="cell" className="signal-record-cell signal-record-rationale">
        <span className="signal-record-label">Rationale</span>
        <button type="button" aria-expanded={expanded} aria-controls={detailId} aria-label={`${expanded ? "Hide" : "Show"} rationale for ${signal.ticker}`} onClick={() => setExpanded(!expanded)}>
          <span>{signal.rationale || "Rationale unavailable"}</span><ChevronDown size={15} aria-hidden="true" />
        </button>
      </div>
      <div role="cell" className="signal-record-cell signal-record-sources">
        <span className="signal-record-label">Sources</span>
        <span>{signal.confluence_sources.length ? signal.confluence_sources.join(" · ") : "Unavailable"}</span>
        {signal.confluence_count != null && <small>{signal.confluence_count} source{signal.confluence_count === 1 ? "" : "s"}</small>}
      </div>
    </div>
    {expanded && <div role="row" className={`signal-record-detail ${styles.detail}`} id={detailId}>
      <div role="cell" aria-colspan={6}>
        <div className="signal-record-detail-grid">
          <section>
            <p className={`terminal-record-id ${styles.recordId}`}><span className={`terminal-function-key ${styles.functionKey}`}>DETAIL</span>SIG-{String(signal.id).padStart(5, "0")} / VALIDATED RECORD</p>
            <h3>Research rationale</h3><p>{signal.rationale || "Rationale unavailable"}</p>
            {(signal.suggested_entry_zone || signal.suggested_stop != null || signal.suggested_target != null) && <dl className="signal-record-levels">
              {signal.suggested_entry_zone && <div><dt>Entry zone</dt><dd>{signal.suggested_entry_zone}</dd></div>}
              {signal.suggested_stop != null && <div><dt>Suggested stop</dt><dd>{String(signal.suggested_stop)}</dd></div>}
              {signal.suggested_target != null && <div><dt>Suggested target</dt><dd>{formatCurrency(signal.suggested_target)}</dd></div>}
            </dl>}
            {signal.key_risks.length > 0 && <><h3>Key risks</h3><ul>{signal.key_risks.map((risk, index) => <li key={index}>{risk}</li>)}</ul></>}
          </section>
          <aside>
            <h3>Analysis provenance</h3>
            <dl><div><dt>Method</dt><dd>{signal.analysis_method || "Unavailable"}</dd></div><div><dt>Model</dt><dd>{signal.analysis_model || "Unavailable"}</dd></div></dl>
            <h3>{snapshot ? "Quote at scan" : "Market quote"}</h3>
            {quote ? <dl><div><dt>Price</dt><dd>{quote.price != null ? formatCurrency(quote.price) : "—"}</dd></div><div><dt>Volume</dt><dd>{quote.volume != null ? quote.volume.toLocaleString() : "—"}</dd></div>
              {quote.change_percent != null && <div><dt>Change from previous close</dt><dd>{quote.change_percent >= 0 ? "+" : ""}{quote.change_percent.toFixed(2)}%</dd></div>}
            </dl> : <p role="status">{unavailable ? snapshot ? "No quote was available for this ticker at collection." : "Quote data temporarily unavailable." : snapshot ? "Inspect the quote and volume captured with this scan." : "Inspect real-time market quote and trading volume."}</p>}
            {(!snapshot || !quote) && <button type="button" className="signal-record-quote-button" onClick={inspectQuote} disabled={loading}>{loading ? "Loading…" : snapshot ? "Show quote at scan" : quote ? "Refresh Quote" : "Check Live Quote"}</button>}
            {quote && asOf && <p className="signal-record-capture">Captured {formatDateTime(asOf)}</p>}
            <nav className={`terminal-source-links ${styles.implementation}`} aria-label="Signal processing implementation">
              <a className="terminal-source-link" href="https://github.com/Alesiobarquin/catalyst/blob/main/ai_layer/ai_service.py" target="_blank" rel="noopener noreferrer">Validation code<ArrowUpRight size={12} aria-hidden="true" /></a>
              <a className="terminal-source-link" href="https://github.com/Alesiobarquin/catalyst/blob/main/gatekeeper/gatekeeper.py" target="_blank" rel="noopener noreferrer">Confluence code<ArrowUpRight size={12} aria-hidden="true" /></a>
            </nav>
          </aside>
        </div>
      </div>
    </div>}
  </>;
}

export function SignalTable({ signals, asOf }: { signals: ValidatedSignal[]; asOf?: string }) {
  return <div className="terminal-record-frame">
    <div className={`terminal-record-command ${styles.command}`}><span><span className={`terminal-function-key ${styles.functionKey}`}>SIG</span>VALIDATED SIGNALS</span><span>{signals.length} displayed · {asOf || PUBLIC_DEMO ? "CAPTURED DATA" : "READ LAYER"}</span></div>
    <div className="signal-record-table" role="table" aria-label="Validated signals">
    <div role="rowgroup"><div className="signal-record-header" role="row">{COLUMNS.map(label => <span key={label} role="columnheader">{label}</span>)}</div></div>
    <div role="rowgroup">{signals.map((signal, index) => <RecordRow key={signal.id} signal={signal} asOf={asOf} index={index} />)}</div>
    </div>
  </div>;
}
