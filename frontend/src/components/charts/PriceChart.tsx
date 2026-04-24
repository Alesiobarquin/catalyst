"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  LineSeries,
} from "lightweight-charts";
import type { TradeOrder, PriceBar } from "@/types";
import { generateMockPriceBars } from "@/lib/mock-data";

interface PriceChartProps {
  order: TradeOrder;
  bars?: PriceBar[];
  height?: number;
  /** Live = OHLC from API; synthetic = generated placeholder data */
  dataSource?: "live" | "synthetic";
}

export function PriceChart({ order, bars, height = 220, dataSource = "synthetic" }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const el = containerRef.current;

    const chart = createChart(el, {
      width:  el.clientWidth,
      height,
      layout: {
        background:  { color: "transparent" },
        textColor:   "#64748B",
        fontFamily:  "JetBrains Mono, monospace",
        fontSize:    10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: {
        borderColor:  "rgba(255,255,255,0.08)",
        scaleMargins: { top: 0.10, bottom: 0.14 },
      },
      timeScale: {
        borderColor:    "rgba(255,255,255,0.08)",
        timeVisible:    true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return `${d.toLocaleString("en", { month: "short" })} ${d.getDate()}`;
        },
      },
      crosshair: {
        vertLine: { color: "rgba(255,255,255,0.2)", labelBackgroundColor: "#1E293B" },
        horzLine: { color: "rgba(255,255,255,0.2)", labelBackgroundColor: "#1E293B" },
      },
      handleScroll: true,
      handleScale:  true,
    });

    chartRef.current = chart;

    const priceBars: PriceBar[] = bars?.length ? bars : generateMockPriceBars(order);

    // ── Main price line (close values) ──────────────────────────
    const priceLine = chart.addSeries(LineSeries, {
      color:            "#CBD5E1",
      lineWidth:        2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius:  3,
    });
    priceLine.setData(
      priceBars.map((b) => ({ time: b.time, value: b.close })) as Parameters<typeof priceLine.setData>[0]
    );

    const signalTime = Math.floor(new Date(order.timestamp_utc).getTime() / 1000);
    const lineBars   = priceBars.filter((b) => b.time >= signalTime);

    // ── Entry line ────────────────────────────────────────────
    const entryLine = chart.addSeries(LineSeries, {
      color:            "rgba(255,255,255,0.45)",
      lineWidth:        1,
      lineStyle:        1,
      priceLineVisible: false,
      lastValueVisible: true,
      title:            `Entry ${order.limit_price.toFixed(2)}`,
    });
    if (lineBars.length > 0) {
      entryLine.setData(
        lineBars.map((b) => ({ time: b.time, value: order.limit_price })) as Parameters<typeof entryLine.setData>[0]
      );
    }

    // ── Stop loss line ────────────────────────────────────────
    const stopLine = chart.addSeries(LineSeries, {
      color:            "#F59E0B",
      lineWidth:        1,
      lineStyle:        2,
      priceLineVisible: false,
      lastValueVisible: true,
      title:            `Stop ${order.stop_loss.toFixed(2)}`,
    });
    if (lineBars.length > 0) {
      stopLine.setData(
        lineBars.map((b) => ({ time: b.time, value: order.stop_loss })) as Parameters<typeof stopLine.setData>[0]
      );
    }

    // ── Target line ───────────────────────────────────────────
    const targetLine = chart.addSeries(LineSeries, {
      color:            "#10B981",
      lineWidth:        1,
      lineStyle:        2,
      priceLineVisible: false,
      lastValueVisible: true,
      title:            `Target ${order.target_price.toFixed(2)}`,
    });
    if (lineBars.length > 0) {
      targetLine.setData(
        lineBars.map((b) => ({ time: b.time, value: order.target_price })) as Parameters<typeof targetLine.setData>[0]
      );
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) chart.resize(el.clientWidth, height);
    });
    ro.observe(el);

    setReady(true);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [order.id, order.timestamp_utc, order.limit_price, order.stop_loss, order.target_price, bars, dataSource, height]);

  return (
    <div>
      {dataSource === "synthetic" && (
        <p
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            marginBottom: 8,
            padding: "5px 10px",
            borderRadius: 4,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          Illustrative price data — no historical OHLC available for this window.
        </p>
      )}
      <div
        className="chart-wrapper"
        style={{ height, opacity: ready ? 1 : 0 }}
      >
        <div ref={containerRef} style={{ width: "100%", height }} />
      </div>
    </div>
  );
}
