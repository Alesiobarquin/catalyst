"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { MarketQuote } from "@/types";
import { MARKET_TAPE_SYMBOLS, marketInstrument } from "@/lib/market-universe";
import styles from "./MarketTape.module.css";

export function MarketTape({ quotes, asOf }: { quotes: MarketQuote[]; asOf: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const groupWidth = useRef(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const reducedMotion = useReducedMotion();
  const canScroll = overflow && quotes.length > 0;
  const ordered = useMemo(() => [...quotes].sort((a, b) => {
    const position = (ticker: string) => { const index = MARKET_TAPE_SYMBOLS.indexOf(ticker.toUpperCase()); return index < 0 ? MARKET_TAPE_SYMBOLS.length : index; };
    return position(a.ticker) - position(b.ticker);
  }), [quotes]);
  const date = new Date(asOf);
  const captured = Number.isNaN(date.getTime()) ? "Collection time unavailable" : date.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const priceDates = new Set(ordered.map(quote => quote.price_date?.slice(0, 10)));
  const dailyDate = priceDates.size === 1 && !priceDates.has(undefined) ? ordered[0]?.price_date : undefined;
  const closingDate = dailyDate ? new Date(dailyDate).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }) : null;

  useEffect(() => {
    const area = viewport.current;
    const content = group.current;
    if (!area || !content) return;
    function measure() {
      groupWidth.current = content!.offsetWidth;
      setOverflow(groupWidth.current > area!.clientWidth + 1);
    }
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    observer.observe(content);
    return () => observer.disconnect();
  }, [ordered]);

  useEffect(() => {
    const area = viewport.current;
    if (!area || !playing || !canScroll || hovered || focused || reducedMotion) return;
    let previous = performance.now();
    let position = area.scrollLeft;
    let frame: number;
    function advance(now: number) {
      const elapsed = Math.min(now - previous, 100);
      previous = now;
      if (groupWidth.current > 0) {
        position = (position + elapsed * 0.024) % groupWidth.current;
        area!.scrollLeft = position;
      }
      frame = requestAnimationFrame(advance);
    }
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [playing, canScroll, hovered, focused, reducedMotion]);

  function move(direction: number) {
    const area = viewport.current;
    const width = groupWidth.current;
    if (!area || !overflow || width <= 0) return;
    setPlaying(false);
    const target = area.scrollLeft + direction * area.clientWidth * 0.75;
    const wrapped = target < 0 || target >= width;
    area.scrollTo({ left: (target + width) % width, behavior: reducedMotion || wrapped ? "instant" : "smooth" });
  }

  function instruments(duplicate = false) {
    return ordered.map(quote => {
      const instrument = marketInstrument(quote.ticker);
      const index = instrument?.kind === "index" || quote.ticker.startsWith("^");
      const validPrice = quote.price != null && Number.isFinite(quote.price) && quote.price > 0;
      const price = validPrice ? `${index ? "" : "$"}${quote.price!.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Unavailable";
      const change = quote.change_percent != null && Number.isFinite(quote.change_percent) ? quote.change_percent : null;
      return <article key={quote.ticker} className={styles.quote} role={duplicate ? undefined : "listitem"} aria-label={duplicate ? undefined : instrument?.name ?? quote.ticker} title={instrument?.name ?? quote.ticker}>
        <div className={styles.identity}><strong>{instrument?.label ?? quote.ticker}</strong><span>{index ? "INDEX" : "ETF"}</span></div>
        <div className={styles.readout}><span className={styles.price}>{price}</span><span className={change == null || change === 0 ? styles.flat : change > 0 ? styles.up : styles.down}>{change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}</span></div>
      </article>;
    });
  }

  return <section className={styles.tape} aria-label="Captured market benchmarks" onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }} onPointerLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className={styles.stamp}><span>MARKET / {closingDate ? "DAILY CLOSE" : "CAPTURED"}</span>{closingDate && <span className={styles.closeDate}>{closingDate} close</span>}<time dateTime={asOf}>{closingDate ? "Retrieved " : ""}{captured}</time></div>
    <div ref={viewport} className={styles.viewport} tabIndex={quotes.length ? 0 : undefined} role="region" aria-label="Market quote carousel" aria-roledescription="carousel" aria-describedby="market-tape-instructions" onPointerDown={() => setPlaying(false)} onWheel={event => { if (event.deltaX || event.shiftKey) setPlaying(false); }} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); } }}>
      {quotes.length === 0 ? <p className={styles.unavailable}>Benchmark quotes unavailable at collection.</p> : <div className={styles.track}><div ref={group} className={styles.group} role="list" aria-label="ETF and index quotes" aria-live="off">{instruments()}</div>{canScroll && <div className={styles.group} aria-hidden="true" inert>{instruments(true)}</div>}</div>}
    </div>
    <div className={styles.controls}>
      <button type="button" onClick={() => move(-1)} disabled={!canScroll} aria-label="Previous market tickers"><ChevronLeft size={14} aria-hidden="true" /></button>
      <button type="button" onClick={() => { if (!playing) setFocused(false); setPlaying(!playing); }} disabled={!canScroll || !!reducedMotion} aria-label={reducedMotion ? "Auto-scroll disabled by reduced motion" : playing ? "Pause market tape" : "Play market tape"} title={reducedMotion ? "Reduced motion enabled. Use the arrows to browse." : "Auto-scroll pauses on hover and keyboard focus."}>{playing && !reducedMotion ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}</button>
      <button type="button" onClick={() => move(1)} disabled={!canScroll} aria-label="Next market tickers"><ChevronRight size={14} aria-hidden="true" /></button>
    </div>
    <p id="market-tape-instructions" className={styles.instructions}>Prices are captured observations; movement is navigation. Hover or focus to pause. Use the left and right arrow keys or buttons to browse. Changes compare with the previous close. Index values are in points; ETF prices are in USD.</p>
  </section>;
}
