import type { MarketQuote } from "@/types";
import Link from "next/link";
import styles from "./MarketTape.module.css";

export function MarketTape({ quotes, asOf }: { quotes: MarketQuote[]; asOf: string }) {
  const date = new Date(asOf);
  const captured = Number.isNaN(date.getTime()) ? "Collection time unavailable" : date.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return <section className={styles.tape} aria-label="Captured market benchmarks">
    <div className={styles.stamp}><span>MARKET / CAPTURED</span><time dateTime={asOf}>{captured}</time></div>
    <div className={styles.quotes}>
      {quotes.length === 0 ? <p className={styles.unavailable}>Benchmark quotes unavailable at collection.</p> : quotes.map(quote => {
        const price = quote.price != null && Number.isFinite(quote.price) ? `$${quote.price.toFixed(2)}` : "Unavailable";
        const change = quote.change_percent != null && Number.isFinite(quote.change_percent) ? quote.change_percent : null;
        return <Link key={quote.ticker} href="/#market-benchmarks" className={styles.quote} aria-label={`${quote.ticker}, ${price}, ${change == null ? "change unavailable" : `${change >= 0 ? "+" : ""}${change.toFixed(2)} percent from previous close`}`}>
          <strong>{quote.ticker}</strong><span className={styles.price}>{price}</span><span className={change == null || change === 0 ? styles.flat : change > 0 ? styles.up : styles.down}>{change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}</span>
        </Link>;
      })}
    </div>
    <span className={styles.scope}>USD · vs previous close</span>
  </section>;
}
