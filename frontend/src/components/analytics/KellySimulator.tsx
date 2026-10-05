"use client";

import { useId, useState } from "react";
import { formatCurrency, formatPercent } from "@/lib/utils";

export function KellySimulator() {
  const [accountSize, setAccountSize] = useState(25000);
  const [conviction, setConviction] = useState(75);
  const [payoffRatio, setPayoffRatio] = useState(2.5);
  const [stopLossPct, setStopLossPct] = useState(5.0);
  const [maxEquityRiskPct, setMaxEquityRiskPct] = useState(2.0);
  const id = useId();

  // Illustrative Kelly model; the engine additionally applies portfolio/regime caps.
  const p = conviction / 100;
  const fullKellyFraction = (payoffRatio * p - (1 - p)) / payoffRatio;
  const hasEdge = fullKellyFraction > 0;
  const halfKellyFraction = Math.max(0, fullKellyFraction / 2);
  const maxRiskUsd = accountSize * maxEquityRiskPct / 100;
  const stopLossFraction = stopLossPct / 100;
  const riskBudgetedSize = stopLossFraction > 0 ? maxRiskUsd / stopLossFraction : 0;
  const recommendedSizeUsd = hasEdge
    ? Math.min(accountSize, riskBudgetedSize, accountSize * halfKellyFraction)
    : 0;
  const capitalAtRiskUsd = recommendedSizeUsd * stopLossFraction;
  const targetProfitUsd = capitalAtRiskUsd * payoffRatio;
  const expectedValueUsd = p * targetProfitUsd - (1 - p) * capitalAtRiskUsd;

  const controls = [
    { key: "account", label: "Account equity", value: accountSize, display: formatCurrency(accountSize), min: 1000, max: 100000, step: 1000, set: setAccountSize },
    { key: "probability", label: "Assumed win probability", value: conviction, display: conviction + "%", min: 50, max: 95, step: 1, set: setConviction },
    { key: "payoff", label: "Reward / risk ratio", value: payoffRatio, display: payoffRatio.toFixed(1) + ":1", min: 1, max: 4, step: 0.1, set: setPayoffRatio },
    { key: "stop", label: "Stop distance", value: stopLossPct, display: stopLossPct.toFixed(1) + "%", min: 1, max: 15, step: 0.5, set: setStopLossPct },
    { key: "risk", label: "Maximum account risk", value: maxEquityRiskPct, display: maxEquityRiskPct.toFixed(1) + "%", min: 0.5, max: 5, step: 0.25, set: setMaxEquityRiskPct },
  ];

  return (
    <section className="glass-card kelly-simulator" aria-labelledby={id + "-title"}>
      <header className="simulator-heading">
        <p className="page-eyebrow">Interactive model</p>
        <h2 id={id + "-title"}>Half-Kelly sizing calculator</h2>
        <p>Explore how probability, payoff, and stop distance affect allocation. The engine applies additional portfolio and market-regime limits.</p>
      </header>
      <div className="simulator-grid">
        <div className="simulator-inputs">
          {controls.map((control) => <div className="simulator-control" key={control.key}>
            <div className="simulator-label">
              <label htmlFor={id + "-" + control.key}>{control.label}</label>
              <output htmlFor={id + "-" + control.key}>{control.display}</output>
            </div>
            <input id={id + "-" + control.key} type="range" min={control.min} max={control.max} step={control.step} value={control.value} aria-valuetext={control.display} onChange={(event) => control.set(Number(event.target.value))} />
          </div>)}
        </div>
        <div className="simulator-results">
          <p className="simulator-result-label">Illustrative allocation</p>
          <p className="simulator-allocation">{formatCurrency(recommendedSizeUsd)}</p>
          <p className="simulator-allocation-note">{((recommendedSizeUsd / accountSize) * 100).toFixed(1)}% of account · before engine caps</p>
          <dl className="simulator-output-list">
            <div><dt>Capital at risk</dt><dd>{formatCurrency(capitalAtRiskUsd)}<span>{((capitalAtRiskUsd / accountSize) * 100).toFixed(1)}% of account</span></dd></div>
            <div><dt>Half-Kelly fraction</dt><dd>{formatPercent(halfKellyFraction * 100)}<span>Full Kelly {formatPercent(fullKellyFraction * 100)}</span></dd></div>
            <div><dt>Expected value</dt><dd style={{ color: expectedValueUsd > 0 ? "var(--color-profit)" : expectedValueUsd < 0 ? "var(--color-loss)" : "var(--color-text-secondary)" }}>{expectedValueUsd > 0 ? "+" : ""}{formatCurrency(expectedValueUsd)}<span>Per modeled position</span></dd></div>
          </dl>
          <p className="simulator-assumptions">The selected win probability is an assumption, not a measured success rate. Half-Kelly allocates half the fraction suggested by the full-Kelly model.</p>
        </div>
      </div>
      <div className="simulator-footer">
        <span>{hasEdge ? "Positive modeled edge" : "No modeled edge · No allocation"}</span>
        <code>Half-Kelly = max(0, (bp − (1 − p)) / 2b)</code>
      </div>
    </section>
  );
}
