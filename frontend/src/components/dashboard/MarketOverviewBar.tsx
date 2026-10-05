"use client";

import React, { useState } from "react";
import { TrendingUp, TrendingDown, RefreshCw, Activity } from "lucide-react";
import type { MarketQuote } from "@/types";
import { getMarketBenchmarks } from "@/lib/api";

const BENCHMARK_NAMES: Record<string, string> = {
  SPY: "S&P 500",
  QQQ: "Nasdaq 100",
  DIA: "Dow 30",
  IWM: "Russell 2000",
};

interface MarketOverviewBarProps {
  initialQuotes: MarketQuote[];
  asOf?: string;
}

export function MarketOverviewBar({ initialQuotes, asOf }: MarketOverviewBarProps) {
  const [quotes, setQuotes] = useState<MarketQuote[]>(initialQuotes);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>(() =>
    asOf ? new Date(asOf).toLocaleString() : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      const fresh = await getMarketBenchmarks();
      setQuotes(fresh);
      setLastUpdated(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    } catch {
      // Keep existing quotes if refresh fails
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        padding: "10px 16px",
        marginBottom: 20,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header ribbon */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--color-text-muted)",
          fontWeight: 600,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Activity size={13} color="var(--color-link)" />
          <span>Market Benchmarks</span>
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--color-profit)",
              marginLeft: 4,
            }}
            title={asOf ? "Daily snapshot" : "Live telemetry active"}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            suppressHydrationWarning
            style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}
          >
            {lastUpdated ? `Updated: ${lastUpdated}` : "Market live"}
          </span>
          {!asOf && <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              background: "var(--color-bg-row)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: 4,
              color: isRefreshing ? "var(--color-text-muted)" : "var(--color-text-muted)",
              cursor: isRefreshing ? "not-allowed" : "pointer",
              padding: "3px 8px",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              fontWeight: 500,
              fontFamily: "var(--font-mono)",
            }}
            title="Refresh benchmark quotes"
          >
            <RefreshCw
              size={11}
              style={{
                animation: isRefreshing ? "spin 1s linear infinite" : "none",
              }}
            />
            {isRefreshing ? "Syncing..." : "Sync"}
          </button>}
        </div>
      </div>

      {/* Benchmark cards grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        {quotes.map((q) => {
          const name = BENCHMARK_NAMES[q.ticker] ?? q.ticker;
          const isUp = (q.change ?? 0) >= 0;
          const isFlat = q.change === 0 || q.change === null || q.change === undefined;
          const changeColor = isFlat ? "var(--color-text-muted)" : isUp ? "var(--color-profit)" : "var(--color-loss)";
          const changeBg = isFlat
            ? "var(--color-neutral-bg)"
            : isUp
            ? "var(--color-profit-bg)"
            : "var(--color-loss-bg)";

          return (
            <div
              key={q.ticker}
              style={{
                background: "var(--color-bg-overlay)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: 6,
                padding: "8px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      fontSize: 13,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {q.ticker}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{name}</span>
                </div>

                {q.change_percent !== null && q.change_percent !== undefined && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      background: changeBg,
                      color: changeColor,
                      padding: "2px 6px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {!isFlat && (isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />)}
                    <span>
                      {isUp && !isFlat ? "+" : ""}
                      {q.change_percent.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginTop: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {q.price !== null && q.price !== undefined ? `$${q.price.toFixed(2)}` : "—"}
                </span>

                {q.day_low !== null &&
                  q.day_low !== undefined &&
                  q.day_high !== null &&
                  q.day_high !== undefined && (
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      L: ${q.day_low.toFixed(1)} H: ${q.day_high.toFixed(1)}
                    </span>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
