"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
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
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(() =>
    new Date(asOf ?? Date.now()).toLocaleTimeString("en-US", {
      timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short",
    })
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    setRefreshFailed(false);
    try {
      setQuotes(await getMarketBenchmarks());
      setLastUpdated(new Date().toLocaleTimeString("en-US", {
        timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short",
      }));
    } catch {
      setRefreshFailed(true);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <section className="market-overview" aria-label="Market benchmarks">
      <div className="market-overview-heading">
        <div>
          <h2>Market Benchmarks</h2>
          <p>Index ETFs · USD · Change from previous close</p>
        </div>
        <div className="market-overview-tools">
          <span suppressHydrationWarning title={asOf ? "Captured with the public scan" : "Live quote refresh available"}>
            {asOf ? "At scan · " : "Updated · "}{lastUpdated}
          </span>
          {!asOf && <button type="button" className="button-secondary" onClick={handleRefresh} disabled={isRefreshing} title="Refresh benchmark quotes">
            <RefreshCw size={14} aria-hidden="true" />
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>}
        </div>
      </div>
      {refreshFailed && <p className="market-refresh-error" role="status">Refresh unavailable. Showing the last loaded quotes.</p>}
      {quotes.length === 0 ? <p className="market-quotes-empty">Benchmark quotes were unavailable at collection.</p> : <div className="market-benchmarks-grid">
        {quotes.map((quote) => {
          const change = quote.change_percent;
          const isFlat = change == null || change === 0;
          const isUp = (change ?? 0) > 0;
          const changeColor = isFlat ? "var(--color-text-muted)" : isUp ? "var(--color-profit)" : "var(--color-loss)";
          return (
            <article className="market-benchmark" key={quote.ticker} aria-label={quote.ticker + " benchmark"}>
              <div className="market-benchmark-name">
                <h3>{quote.ticker}</h3>
                <p>{BENCHMARK_NAMES[quote.ticker] ?? quote.ticker}</p>
              </div>
              <div className="market-benchmark-price-row">
                <p className="market-benchmark-price">{quote.price != null ? "$" + quote.price.toFixed(2) : "—"}</p>
                {change != null && <span className="market-benchmark-change" style={{ color: changeColor }} aria-label={"Change from previous close " + change.toFixed(2) + " percent"}>
                  {isUp ? "+" : ""}{change.toFixed(2)}%
                </span>}
              </div>
              {quote.day_low != null && quote.day_high != null && <dl className="market-benchmark-range">
                <div><dt>Day low</dt><dd>{"$" + quote.day_low.toFixed(2)}</dd></div>
                <div><dt>Day high</dt><dd>{"$" + quote.day_high.toFixed(2)}</dd></div>
              </dl>}
            </article>
          );
        })}
      </div>}
    </section>
  );
}
