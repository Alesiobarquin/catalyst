import type { CSSProperties } from "react";
import type { PublicSnapshot } from "@/lib/snapshot";

export function RegimeReadout({ regime }: { regime: PublicSnapshot["regime"] }) {
  const vix = regime?.vix;
  const vixAvailable = typeof vix === "number" && Number.isFinite(vix) && vix > 0;
  const spy = regime?.spy;
  const average = regime?.spy_200_sma;
  const trendAvailable = typeof spy === "number" && Number.isFinite(spy) && spy > 0 && typeof average === "number" && Number.isFinite(average) && average > 0;
  const deviation = trendAvailable ? (spy / average - 1) * 100 : null;

  return <section className="terminal-regime" aria-label="Market regime at scan">
    <div className="terminal-panel-title"><span>REG / 02</span><p className="record-label">Regime at scan</p></div>
    <div className="terminal-regime-body">
      <div className="terminal-regime-value"><span>VIX</span><strong>{vixAvailable ? vix.toFixed(2) : "—"}</strong><span>{regime?.fresh ? "Fresh at collection" : "Sizing halted"}</span></div>
      {vixAvailable ? <div className="terminal-regime-scale" role="img" aria-label={`VIX ${vix.toFixed(2)} at collection. Scalper-only threshold 30, halt threshold 40. Scale from zero to 50.`}>
        <div className="terminal-regime-gauge"><span style={{ "--vix-position": `${Math.min(100, vix / 50 * 100)}%` } as CSSProperties} /></div>
        <div className="terminal-regime-axis"><span>0</span><span>30</span><span>40</span><span>50</span></div>
      </div> : <p className="terminal-regime-unavailable">VIX was unavailable at collection.</p>}
      <dl className="terminal-regime-trend"><div><dt>SPY / 200-session SMA</dt><dd className={deviation == null ? undefined : deviation >= 0 ? "regime-trend-up" : "regime-trend-down"}>{deviation == null ? "Unavailable" : `${deviation >= 0 ? "+" : ""}${deviation.toFixed(2)}%`}</dd></div>{trendAvailable && <div><dt>Price / Average</dt><dd>${spy.toFixed(2)} / ${average.toFixed(2)}</dd></div>}</dl>
      <p className="terminal-regime-note">At VIX ≥30, only Scalper sizing is allowed. At ≥40, sizing halts. Missing or stale data also halts sizing.</p>
    </div>
  </section>;
}
