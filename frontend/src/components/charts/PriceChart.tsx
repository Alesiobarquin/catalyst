"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  LineSeries,
} from "lightweight-charts";
import type { TradeOrder, PriceBar } from "@/types";
import { getChartTheme, type ChartTheme } from "@/lib/chartTheme";
import { useTheme } from "@/lib/theme-store";
import { generateMockPriceBars } from "@/lib/mock-data";

interface PriceChartProps {
  order: TradeOrder;
  bars?: PriceBar[];
  height?: number;
  /** Live = OHLC from API; synthetic = generated placeholder data */
  dataSource?: "live" | "synthetic";
}

type SeriesColor = "price" | "entrySoft" | "stopSoft" | "targetSoft";
type PriceLineColor = "entry" | "stop" | "target";

export function PriceChart({ order, bars, height = 220, dataSource = "synthetic" }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Array<{ series: ISeriesApi<"Line">; color: SeriesColor }>>([]);
  const priceLineRefs = useRef<Array<{ line: IPriceLine; color: PriceLineColor }>>([]);
  const [ready, setReady] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;

    const el = containerRef.current;
    const palette = getChartTheme();
    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { color: palette.background },
        textColor: palette.axis,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: {
        borderColor: palette.border,
        scaleMargins: { top: 0.10, bottom: 0.14 },
      },
      timeScale: {
        borderColor: palette.border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return `${d.toLocaleString("en", { month: "short" })} ${d.getDate()}`;
        },
      },
      crosshair: {
        vertLine: { color: palette.crosshair, labelBackgroundColor: palette.background },
        horzLine: { color: palette.crosshair, labelBackgroundColor: palette.background },
      },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;
    const priceBars: PriceBar[] = bars?.length ? bars : generateMockPriceBars(order);
    const seriesRefsForChart: Array<{ series: ISeriesApi<"Line">; color: SeriesColor }> = [];
    const priceLineRefsForChart: Array<{ line: IPriceLine; color: PriceLineColor }> = [];

    const priceSeries = chart.addSeries(LineSeries, {
      color: palette.price,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
    });
    seriesRefsForChart.push({ series: priceSeries, color: "price" });
    priceSeries.setData(
      priceBars.map((bar) => ({ time: bar.time, value: bar.close })) as Parameters<typeof priceSeries.setData>[0]
    );

    const signalTime = Math.floor(new Date(order.timestamp_utc).getTime() / 1000);
    const lineBars = priceBars.filter((bar) => bar.time >= signalTime);

    const addPriceLevel = (price: number, title: string, color: PriceLineColor, lineStyle: 1 | 2) => {
      if (price <= 0) return;
      const line = priceSeries.createPriceLine({
        price,
        color: palette[color],
        lineWidth: 1,
        lineStyle,
        axisLabelVisible: true,
        axisLabelColor: palette.background,
        axisLabelTextColor: palette.primary,
        title,
      });
      priceLineRefsForChart.push({ line, color });
    };

    addPriceLevel(order.limit_price, `Entry $${order.limit_price.toFixed(2)}`, "entry", 1);
    addPriceLevel(order.stop_loss, `Stop $${order.stop_loss.toFixed(2)}`, "stop", 2);
    addPriceLevel(order.target_price, `Target $${order.target_price.toFixed(2)}`, "target", 2);

    const addLevelSeries = (
      value: number,
      title: string,
      color: SeriesColor,
      lineStyle: 1 | 2,
    ) => {
      const series = chart.addSeries(LineSeries, {
        color: palette[color],
        lineWidth: 1,
        lineStyle,
        priceLineVisible: false,
        lastValueVisible: false,
        title,
      });
      seriesRefsForChart.push({ series, color });
      if (lineBars.length > 0) {
        series.setData(
          lineBars.map((bar) => ({ time: bar.time, value })) as Parameters<typeof series.setData>[0]
        );
      }
    };

    addLevelSeries(order.limit_price, `Entry ${order.limit_price.toFixed(2)}`, "entrySoft", 1);
    addLevelSeries(order.stop_loss, `Stop ${order.stop_loss.toFixed(2)}`, "stopSoft", 2);
    addLevelSeries(order.target_price, `Target ${order.target_price.toFixed(2)}`, "targetSoft", 2);

    seriesRefs.current = seriesRefsForChart;
    priceLineRefs.current = priceLineRefsForChart;

    chart.timeScale().fitContent();
    const resizeObserver = new ResizeObserver(() => {
      if (el.clientWidth > 0) chart.resize(el.clientWidth, height);
    });
    resizeObserver.observe(el);
    setReady(true);

    return () => {
      resizeObserver.disconnect();
      seriesRefs.current = [];
      priceLineRefs.current = [];
      chartRef.current = null;
      chart.remove();
    };
    // Theme changes update the existing canvas objects in the effect below.
  }, [order, bars, dataSource, height]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const palette: ChartTheme = getChartTheme();

    chart.applyOptions({
      layout: { background: { color: palette.background }, textColor: palette.axis },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
      crosshair: {
        vertLine: { color: palette.crosshair, labelBackgroundColor: palette.background },
        horzLine: { color: palette.crosshair, labelBackgroundColor: palette.background },
      },
    });

    seriesRefs.current.forEach(({ series, color }) => series.applyOptions({ color: palette[color] }));
    priceLineRefs.current.forEach(({ line, color }) =>
      line.applyOptions({
        color: palette[color],
        axisLabelColor: palette.background,
        axisLabelTextColor: palette.primary,
      })
    );
  }, [theme]);

  return (
    <div>
      {dataSource === "synthetic" && (
        <p className="chart-data-note">
          Illustrative price data — no historical OHLC available for this window.
        </p>
      )}
      <div className="chart-wrapper" style={{ height, opacity: ready ? 1 : 0 }}>
        <div ref={containerRef} style={{ width: "100%", height }} />
      </div>
    </div>
  );
}
