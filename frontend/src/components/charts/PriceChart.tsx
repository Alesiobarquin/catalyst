"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickSeriesOptions,
  CandlestickSeries,
  LineSeries,
} from "lightweight-charts";
import type { TradeOrder, PriceBar } from "@/types";
import { generateMockPriceBars } from "@/lib/mock-data";

interface PriceChartProps {
  order: TradeOrder;
  bars?: PriceBar[];
  height?: number;
  /** Live = OHLC from API; synthetic = generated placeholder candles */
  dataSource?: "live" | "synthetic";
}

export function PriceChart({ order, bars, height = 220, dataSource = "synthetic" }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const el = containerRef.current;

    // Create chart
    const chart = createChart(el, {
      width:  el.clientWidth,
      height,
      layout: {
        background:      { color: "transparent" },
        textColor:       "#8892a4",
        fontFamily:      "JetBrains Mono, monospace",
        fontSize:        10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
        scaleMargins: { top: 0.08, bottom: 0.12 },
      },
      timeScale: {
        borderColor:     "rgba(255,255,255,0.06)",
        timeVisible:     true,
        secondsVisible:  false,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return `${d.toLocaleString("en", { month: "short" })} ${d.getDate()}`;
        },
      },
      crosshair: {
        vertLine: { color: "rgba(245,158,11,0.4)", labelBackgroundColor: "#1a2030" },
        horzLine: { color: "rgba(245,158,11,0.4)", labelBackgroundColor: "#1a2030" },
      },
      handleScroll:  true,
      handleScale:   true,
    });

    chartRef.current = chart;

    // Price data
    const priceBars: PriceBar[] = bars?.length ? bars : generateMockPriceBars(order);

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:          "#22c55e",
      downColor:        "#ef4444",
      borderUpColor:    "#22c55e",
      borderDownColor:  "#ef4444",
      wickUpColor:      "#22c55e",
      wickDownColor:    "#ef4444",
    } as Partial<CandlestickSeriesOptions>);
    candleSeries.setData(priceBars as Parameters<typeof candleSeries.setData>[0]);

    // Signal timestamp
    const signalTime = Math.floor(new Date(order.timestamp_utc).getTime() / 1000);

    // Entry price line
    const entryLine = chart.addSeries(LineSeries, {
      color:     "#f59e0b",
      lineWidth:  2,
      lineStyle:  1, // dashed
      priceLineVisible: false,
      lastValueVisible: true,
      title:     `Entry $${order.limit_price}`,
    });
    const lineBars = priceBars.filter((b) => b.time >= signalTime);
    if (lineBars.length > 0) {
      entryLine.setData(
        lineBars.map((b) => ({ time: b.time, value: order.limit_price })) as Parameters<typeof entryLine.setData>[0]
      );
    }

    // Stop loss line
    const stopLine = chart.addSeries(LineSeries, {
      color:     "#ef4444",
      lineWidth:  1,
      lineStyle:  2,
      priceLineVisible: false,
      lastValueVisible: true,
      title:     `Stop $${order.stop_loss}`,
    });
    if (lineBars.length > 0) {
      stopLine.setData(
        lineBars.map((b) => ({ time: b.time, value: order.stop_loss })) as Parameters<typeof stopLine.setData>[0]
      );
    }

    // Target price line
    const targetLine = chart.addSeries(LineSeries, {
      color:     "#22c55e",
      lineWidth:  1,
      lineStyle:  2,
      priceLineVisible: false,
      lastValueVisible: true,
      title:     `Target $${order.target_price}`,
    });
    if (lineBars.length > 0) {
      targetLine.setData(
        lineBars.map((b) => ({ time: b.time, value: order.target_price })) as Parameters<typeof targetLine.setData>[0]
      );
    }

    chart.timeScale().fitContent();

    // Responsive resize
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
            color: "var(--color-gold)",
            marginBottom: 8,
            padding: "6px 10px",
            borderRadius: 6,
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.25)",
          }}
        >
          Illustrative candles — no historical OHLC from the API for this window. Use for layout only.
        </p>
      )}
      <div
        className="chart-wrapper"
        style={{
          height,
          opacity: ready ? 1 : 0,
          transition: "opacity 400ms ease",
        }}
      >
        <div ref={containerRef} style={{ width: "100%", height }} />
      </div>
    </div>
  );
}
