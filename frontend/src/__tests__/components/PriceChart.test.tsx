import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PriceChart } from "@/components/charts/PriceChart";
import type { TradeOrder } from "@/types";
import { THEME_STORAGE_KEY } from "@/lib/theme-config";
import { setTheme } from "@/lib/theme-store";

const applyOptions = vi.fn();
const seriesApplyOptions = vi.fn();
const priceLineApplyOptions = vi.fn();
const remove = vi.fn();
const resize = vi.fn();
const fitContent = vi.fn();
const disconnect = vi.fn();
const observe = vi.fn();

vi.mock("lightweight-charts", () => ({
  LineSeries: "LineSeries",
  createChart: vi.fn(() => ({
    applyOptions,
    addSeries: vi.fn(() => ({
      applyOptions: seriesApplyOptions,
      setData: vi.fn(),
      createPriceLine: vi.fn(() => ({ applyOptions: priceLineApplyOptions })),
    })),
    timeScale: () => ({ fitContent, applyOptions: vi.fn() }),
    resize,
    remove,
  })),
}));

vi.mock("@/lib/chartTheme", () => ({
  getChartTheme: vi.fn(() => ({
    background: "#FFFFFF",
    primary: "#17212E",
    grid: "#E7EBF0",
    axis: "#5D6878",
    border: "#D7DDE5",
    crosshair: "#66768A",
    price: "#354A65",
    entry: "#245B96",
    stop: "#89551F",
    target: "#226644",
    entrySoft: "rgba(36, 91, 150, 0.56)",
    stopSoft: "rgba(137, 85, 31, 0.64)",
    targetSoft: "rgba(34, 102, 68, 0.64)",
  })),
}));

vi.mock("@/lib/mock-data", () => ({
  generateMockPriceBars: () => [
    { time: 1_700_000_000, open: 10, high: 11, low: 9, close: 10.5 },
    { time: 1_700_086_400, open: 10.5, high: 12, low: 10, close: 11 },
  ],
}));

const order: TradeOrder = {
  id: 1,
  ticker: "AAPL",
  timestamp_utc: "2024-01-01T00:00:00Z",
  action: "BUY",
  strategy_used: "Supernova",
  recommended_size_usd: 1000,
  limit_price: 10,
  stop_loss: 9,
  target_price: 12,
  rationale: "Test order",
  conviction_score: 80,
  catalyst_type: "SUPERNOVA",
  regime_vix: 18,
  spy_above_200sma: true,
  status: "ACTIVE",
};

describe("PriceChart theme updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.dataset.theme = "light";
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    class ResizeObserverStub {
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
    }
    global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  });

  it("applies theme options to existing chart objects without recreating or refitting", async () => {
    const { createChart } = await import("lightweight-charts");
    const bars = [
      { time: 1_700_000_000, open: 10, high: 11, low: 9, close: 10.5 },
      { time: 1_700_086_400, open: 10.5, high: 12, low: 10, close: 11 },
    ];
    const { unmount } = render(<PriceChart order={order} dataSource="live" bars={bars} />);

    await waitFor(() => expect(createChart).toHaveBeenCalledTimes(1));
    const createCount = vi.mocked(createChart).mock.calls.length;
    const fitCalls = fitContent.mock.calls.length;

    act(() => {
      setTheme("dark");
    });

    await waitFor(() => expect(applyOptions).toHaveBeenCalled());
    expect(seriesApplyOptions).toHaveBeenCalled();
    expect(priceLineApplyOptions).toHaveBeenCalled();
    expect(createChart).toHaveBeenCalledTimes(createCount);
    expect(fitContent).toHaveBeenCalledTimes(fitCalls);

    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });
});
