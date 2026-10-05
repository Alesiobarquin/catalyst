"use client";

import { useId, useState } from "react";
import { formatCurrency, formatPercent } from "@/lib/utils";

export function KellySimulator() {
  const [accountSize, setAccountSize] = useState<number>(25000);
  const [conviction, setConviction] = useState<number>(75);
  const [payoffRatio, setPayoffRatio] = useState<number>(2.5);
  const [stopLossPct, setStopLossPct] = useState<number>(5.0);
  const [maxEquityRiskPct, setMaxEquityRiskPct] = useState<number>(2.0);

  const accountId = useId();
  const convictionId = useId();
  const payoffId = useId();
  const stopLossId = useId();
  const riskCapId = useId();

  // ── Quantitative calculations matching Java Strategy Engine ───────
  const p = conviction / 100;
  const q = 1 - p;
  const b = payoffRatio;

  // Full Kelly fraction: f* = (b*p - q) / b
  const fullKellyFraction = (b * p - q) / b;
  const hasEdge = fullKellyFraction > 0;

  // Half-Kelly fraction
  const halfKellyFraction = Math.max(0, fullKellyFraction / 2);

  // Position sizing with risk cap
  const maxRiskUsd = accountSize * (maxEquityRiskPct / 100);
  const stopLossFraction = stopLossPct / 100;

  // Sizing by stop loss: Size * stopLossFraction = maxRiskUsd => Size = maxRiskUsd / stopLossFraction
  const riskBudgetedSize = stopLossFraction > 0 ? maxRiskUsd / stopLossFraction : 0;
  const kellyBudgetedSize = accountSize * halfKellyFraction;

  // Final recommended size capped at account balance and risk budget
  const recommendedSizeUsd = hasEdge
    ? Math.min(accountSize, Math.min(riskBudgetedSize, kellyBudgetedSize))
    : 0;

  const capitalAtRiskUsd = recommendedSizeUsd * stopLossFraction;
  const targetProfitUsd = recommendedSizeUsd * stopLossFraction * b;
  const expectedValueUsd = (p * targetProfitUsd) - (q * capitalAtRiskUsd);

  return (
    <div
      className="glass-card"
      style={{
        padding: "22px 24px",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 18,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              margin: "0 0 4px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>Half-Kelly Quantitative Sizer</span>
            <span
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 3,
                background: "var(--color-info-bg)",
                color: "var(--color-link)",
                border: "1px solid var(--color-info-border)",
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
              }}
            >
              ENGINE SIMULATOR
            </span>
          </h3>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
            Simulate position sizing and expected value derived from conviction score and Half-Kelly criterion: f* = (bp - q) / 2b.
          </p>
        </div>

        <div
          style={{
            padding: "6px 12px",
            borderRadius: 4,
            background: hasEdge ? "var(--color-profit-bg)" : "var(--color-loss-bg)",
            border: `1px solid ${hasEdge ? "var(--color-profit-border)" : "var(--color-loss-border)"}`,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 600,
            color: hasEdge ? "var(--color-profit)" : "var(--color-loss)",
          }}
        >
          {hasEdge ? `POSITIVE EDGE: f* = ${(fullKellyFraction * 100).toFixed(1)}%` : "NEGATIVE EDGE: NO ALLOCATION"}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
        }}
      >
        {/* ── Sliders column ────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Account balance */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <label htmlFor={accountId} style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                Account Equity
              </label>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text-primary)" }}>
                {formatCurrency(accountSize)}
              </span>
            </div>
            <input
              id={accountId}
              type="range"
              min={1000}
              max={100000}
              step={1000}
              value={accountSize}
              onChange={(e) => setAccountSize(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--color-link)" }}
              aria-label="Account Equity Slider"
            />
          </div>

          {/* AI Conviction Score */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <label htmlFor={convictionId} style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                AI Conviction Score (Win Prob p)
              </label>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-link)" }}>
                {conviction}/100 ({conviction}%)
              </span>
            </div>
            <input
              id={convictionId}
              type="range"
              min={50}
              max={95}
              step={1}
              value={conviction}
              onChange={(e) => setConviction(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--color-link)" }}
              aria-label="AI Conviction Score Slider"
            />
          </div>

          {/* Win/Loss Payoff Ratio */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <label htmlFor={payoffId} style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                Reward/Risk Ratio (b)
              </label>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text-primary)" }}>
                {payoffRatio.toFixed(1)}:1
              </span>
            </div>
            <input
              id={payoffId}
              type="range"
              min={1.0}
              max={4.0}
              step={0.1}
              value={payoffRatio}
              onChange={(e) => setPayoffRatio(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--color-link)" }}
              aria-label="Reward to Risk Ratio Slider"
            />
          </div>

          {/* Stop Loss % */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <label htmlFor={stopLossId} style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                Stop Loss Distance
              </label>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-warning)" }}>
                {stopLossPct.toFixed(1)}%
              </span>
            </div>
            <input
              id={stopLossId}
              type="range"
              min={1.0}
              max={15.0}
              step={0.5}
              value={stopLossPct}
              onChange={(e) => setStopLossPct(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--color-warning)" }}
              aria-label="Stop Loss Percentage Slider"
            />
          </div>

          {/* Max Account Risk Cap */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <label htmlFor={riskCapId} style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                Max Portfolio Risk Cap
              </label>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text-primary)" }}>
                {maxEquityRiskPct.toFixed(1)}%
              </span>
            </div>
            <input
              id={riskCapId}
              type="range"
              min={0.5}
              max={5.0}
              step={0.25}
              value={maxEquityRiskPct}
              onChange={(e) => setMaxEquityRiskPct(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--color-link)" }}
              aria-label="Max Portfolio Risk Cap Slider"
            />
          </div>
        </div>

        {/* ── Outputs column ────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            background: "var(--color-bg-overlay)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: 4,
            padding: "16px 18px",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Quantitative Sizing Metrics
          </span>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ padding: "10px 12px", background: "var(--color-bg-row)", borderRadius: 3 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Recommended Size</span>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--color-link)", margin: "4px 0 0" }}>
                {formatCurrency(recommendedSizeUsd)}
              </p>
              <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                {accountSize > 0 ? `${((recommendedSizeUsd / accountSize) * 100).toFixed(1)}% of portfolio` : "—"}
              </span>
            </div>

            <div style={{ padding: "10px 12px", background: "var(--color-bg-row)", borderRadius: 3 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Capital at Risk</span>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--color-warning)", margin: "4px 0 0" }}>
                {formatCurrency(capitalAtRiskUsd)}
              </p>
              <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                {accountSize > 0 ? `${((capitalAtRiskUsd / accountSize) * 100).toFixed(1)}% equity risk` : "—"}
              </span>
            </div>

            <div style={{ padding: "10px 12px", background: "var(--color-bg-row)", borderRadius: 3 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Half-Kelly Fraction</span>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--color-profit)", margin: "4px 0 0" }}>
                {formatPercent(halfKellyFraction * 100)}
              </p>
              <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                Full: {formatPercent(fullKellyFraction * 100)}
              </span>
            </div>

            <div style={{ padding: "10px 12px", background: "var(--color-bg-row)", borderRadius: 3 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Expected Value (EV)</span>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 18,
                  fontWeight: 700,
                  color: expectedValueUsd >= 0 ? "var(--color-profit)" : "var(--color-loss)",
                  margin: "4px 0 0",
                }}
              >
                {expectedValueUsd >= 0 ? `+${formatCurrency(expectedValueUsd)}` : formatCurrency(expectedValueUsd)}
              </p>
              <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                Per executed order
              </span>
            </div>
          </div>

          <div
            style={{
              marginTop: "auto",
              padding: "10px 12px",
              borderRadius: 3,
              background: "var(--color-info-bg)",
              border: "1px solid var(--color-info-border)",
              fontSize: 11,
              color: "var(--color-text-muted)",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: "var(--color-link)" }}>Why Half-Kelly?</strong> Standard Kelly maximizes logarithmic wealth but exhibits high peak-to-trough drawdowns. Half-Kelly preserves ~95% of maximal geometric growth while reducing portfolio variance and drawdown risk by over 75%.
          </div>
        </div>
      </div>
    </div>
  );
}
