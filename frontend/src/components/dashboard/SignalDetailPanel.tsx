"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { PriceBar, SignalDetail, TradeOrder } from "@/types";
import { getPriceHistory } from "@/lib/api";
import { PUBLIC_DEMO } from "@/lib/snapshot";
import { PriceChart } from "@/components/charts/PriceChart";
import { formatPrice, formatPnL, safe } from "@/lib/signalDetailUtils";

interface SignalDetailPanelProps {
  signal: SignalDetail;
  isOpen: boolean;
  onClose: () => void;
  order?: TradeOrder;
  isLoading?: boolean;
}

export function SignalDetailPanel({ signal, isOpen, onClose, order, isLoading = false }: SignalDetailPanelProps) {
  const [rawFactorsOpen, setRawFactorsOpen] = useState(false);
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [historyStatus, setHistoryStatus] = useState<
    "idle" | "loading" | "live" | "synthetic"
  >("idle");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // ESC key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Scroll lock on body
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("panel-open");
      document.body.style.overflow = "hidden";
    } else {
      document.body.classList.remove("panel-open");
      document.body.style.overflow = "";
    }
    return () => {
      document.body.classList.remove("panel-open");
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Focus close button on open
  useEffect(() => {
    if (isOpen) {
      const previousFocus = document.activeElement as HTMLElement | null;
      const id = requestAnimationFrame(() => closeButtonRef.current?.focus());
      return () => {
        cancelAnimationFrame(id);
        previousFocus?.focus();
      };
    }
  }, [isOpen]);

  // Focus trap
  useEffect(() => {
    if (!isOpen) return;
    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !order) return;

    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setHistoryStatus("loading");
    });
    getPriceHistory(order.ticker, order.timestamp_utc)
      .then((data) => {
        if (cancelled) return;
        setBars(data.length > 0 ? data : []);
        setHistoryStatus(data.length > 0 ? "live" : "synthetic");
      })
      .catch(() => {
        if (!cancelled) setHistoryStatus("synthetic");
      });

    return () => {
      cancelled = true;
      setBars([]);
      setHistoryStatus("idle");
    };
  }, [isOpen, order]);

  if (typeof document === "undefined") return null;
  const rawFactors = signal.pipeline?.rawFactors as Record<string, unknown> | undefined;
  const provenance = (key: string) => typeof rawFactors?.[key] === "string" ? String(rawFactors[key]) : "Unavailable";

  return createPortal(<AnimatePresence>{isOpen && <>
    <motion.div key="backdrop" className="signal-inspector-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onClick={onClose} aria-hidden="true" />
    <motion.div key="panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={`panel-title-${signal.ticker}`} className="signal-inspector" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
      <header className="signal-inspector-header">
        <div><p className="signal-inspector-eyebrow">Recommendation record · {safe(signal.signalId)}</p><h1 id={`panel-title-${signal.ticker}`}>{safe(signal.ticker)}</h1><p>{safe(signal.strategy)} · {safe(signal.status)} · {safe(signal.action)}</p></div>
        <button type="button" className="panel-close-button signal-inspector-close" ref={closeButtonRef} onClick={onClose} aria-label="Close panel"><X size={18} aria-hidden="true" />Close</button>
      </header>
      <div className="signal-inspector-meta"><span>Generated {safe(signal.generatedAt)}</span><span>Conviction <strong>{safe(signal.convictionScore)}/{safe(signal.convictionMax)}</strong></span></div>
      {isLoading && <p role="status" className="signal-inspector-loading">Fetching pipeline analysis…</p>}
      <div className="signal-inspector-body">
        <div className="signal-inspector-primary">
          <section className="signal-inspector-section">
            <p className="signal-inspector-eyebrow">Catalyst thesis</p><h2>{safe(signal.thesis?.primaryCatalyst)}</h2>
            {(signal.thesis?.bodyParagraphs ?? []).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            {(signal.thesis?.counterArguments.length ?? 0) > 0 && <><h3>Key risks & counterarguments</h3><ul>{signal.thesis.counterArguments.map((risk, index) => <li key={index}>{risk}</li>)}</ul></>}
          </section>
          <section className="signal-inspector-section signal-inspector-chart">
            <div className="signal-inspector-section-heading"><h2>Price context</h2><span>{PUBLIC_DEMO ? "Published history" : "Historical prices"}</span></div>
            {order ? historyStatus === "loading" ? <div className="signal-inspector-chart-empty" role="status">Loading price history…</div> : PUBLIC_DEMO && bars.length === 0 ? <div className="signal-inspector-chart-empty">Price history was unavailable for this published run.</div> : <PriceChart order={order} bars={bars} height={280} dataSource={historyStatus === "live" ? "live" : "synthetic"} /> : <div className="signal-inspector-chart-empty">Price chart unavailable</div>}
            <p className="signal-inspector-price-caption">Reference price <strong>{formatPrice(signal.currentPrice)}</strong> · Modeled change <strong>{formatPnL(signal.pnlPercent)}</strong></p>
            <p className="signal-inspector-note">Outcomes use sampled reference prices and recommended allocation. They do not measure brokerage returns.</p>
          </section>
          <section className="signal-inspector-section">
            <h2>Signal & regime evidence</h2>
            {(signal.confluence?.factors.length ?? 0) > 0 ? <dl className="signal-inspector-evidence">{signal.confluence.factors.map((factor, index) => <div key={index}><dt>{safe(factor.source)}</dt><dd>{safe(factor.data)}</dd></div>)}</dl> : <p>Source evidence is unavailable for this record.</p>}
            {signal.confluence?.summaryText && <p className="signal-inspector-note">{signal.confluence.summaryText}</p>}
          </section>
        </div>
        <aside className="signal-inspector-context">
          <section className="signal-inspector-section"><h2>Recommendation levels</h2><dl className="signal-inspector-levels">
            <div><dt>Entry</dt><dd>{formatPrice(signal.entryPrice)}</dd></div><div><dt>Stop loss</dt><dd>{formatPrice(signal.stopLoss)}</dd></div><div><dt>Target</dt><dd>{formatPrice(signal.targetPrice)}</dd></div>
            <div><dt>Reward / risk</dt><dd>{safe(signal.riskReward)}</dd></div><div><dt>Recommended allocation</dt><dd>{safe(signal.positionSize)}</dd></div>
          </dl><p className="signal-inspector-note">Levels describe the recommendation. Public execution is disabled.</p></section>
          <section className="signal-inspector-section"><h2>Analysis provenance</h2><dl className="signal-inspector-provenance"><div><dt>Method</dt><dd>{provenance("analysis_method")}</dd></div><div><dt>Model</dt><dd>{provenance("analysis_model")}</dd></div><div><dt>Signal ID</dt><dd>{safe(signal.pipeline?.signalId || signal.signalId)}</dd></div></dl></section>
          {order && <section className="signal-inspector-section"><h2>Sizing context</h2><dl className="signal-inspector-provenance"><div><dt>VIX at sizing</dt><dd>{Number.isFinite(order.regime_vix) ? order.regime_vix.toFixed(2) : "Unavailable"}</dd></div><div><dt>SPY / 200-session SMA</dt><dd>{order.spy_above_200sma ? "Above" : "Below"}</dd></div></dl></section>}
          <section className="signal-inspector-section"><h2>Record data</h2><button type="button" className="text-action-link signal-inspector-data-button" aria-expanded={rawFactorsOpen} aria-controls="signal-inspector-raw" onClick={() => setRawFactorsOpen(!rawFactorsOpen)}>{rawFactorsOpen ? "Hide raw factors" : "Show raw factors"}</button>{rawFactorsOpen && <pre id="signal-inspector-raw"><code>{JSON.stringify(rawFactors ?? {}, null, 2)}</code></pre>}</section>
        </aside>
      </div>
    </motion.div>
  </>}</AnimatePresence>, document.body);
}
