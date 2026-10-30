import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TradeList } from "@/components/dashboard/TradeList";
import type { TradeOrder, BatchPerformance, SignalDetail } from "@/types";
import * as api from "@/lib/api";
import { orderToSignalDetail } from "@/lib/signalDetailUtils";

const snapshotMode = vi.hoisted(() => ({ publicDemo: false }));

vi.mock("@/lib/snapshot", () => ({
  get PUBLIC_DEMO() { return snapshotMode.publicDemo; },
}));

vi.mock("@/lib/api", () => ({
  getBatchPerformance: vi.fn(),
  fetchSignalDetail: vi.fn(),
  getPriceHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/components/charts/PriceChart", () => ({
  PriceChart: () => <div data-testid="price-chart">Price Chart Mock</div>,
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const mockOrders: TradeOrder[] = [
  {
    id: 1,
    ticker: "NVDA",
    timestamp_utc: new Date().toISOString(),
    action: "BUY",
    strategy_used: "Supernova",
    recommended_size_usd: 10000,
    limit_price: 120.0,
    stop_loss: 110.0,
    target_price: 140.0,
    rationale: "High short interest squeeze breakout",
    conviction_score: 92,
    catalyst_type: "SUPERNOVA",
    regime_vix: 16.5,
    spy_above_200sma: true,
    status: "ACTIVE",
  },
  {
    id: 2,
    ticker: "TSLA",
    timestamp_utc: new Date().toISOString(),
    action: "BUY",
    strategy_used: "Scalper",
    recommended_size_usd: 8000,
    limit_price: 240.0,
    stop_loss: 225.0,
    target_price: 275.0,
    rationale: "Earnings catalyst runner",
    conviction_score: 85,
    catalyst_type: "SCALPER",
    regime_vix: 15.0,
    spy_above_200sma: true,
    status: "ACTIVE",
  },
];

describe("TradeList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state without active filters", () => {
    render(<TradeList orders={[]} hasActiveFilters={false} />);

    expect(screen.getByText("No recommendations yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Recommendations will appear when a signal passes validation/)
    ).toBeInTheDocument();
  });

  it("renders empty state with active filters", () => {
    render(<TradeList orders={[]} hasActiveFilters={true} />);

    expect(screen.getByText("No recommendations match current filters")).toBeInTheDocument();
    expect(
      screen.getByText("Adjust the strategy or extend the date range.")
    ).toBeInTheDocument();
  });

  it("renders recommendation records with shared price columns when orders are present", () => {
    vi.mocked(api.getBatchPerformance).mockResolvedValueOnce([]);

    render(<TradeList orders={mockOrders} hasActiveFilters={false} />);

    expect(screen.getByText("NVDA")).toBeInTheDocument();
    expect(screen.getByText("TSLA")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Recommendations" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Modeled return" })).toBeInTheDocument();
  });

  it("enriches recommendation records with batch performance data", async () => {
    const mockBatch: BatchPerformance[] = [
      {
        order_id: 1,
        ticker: "NVDA",
        current_price: 135.0,
        pnl_pct: 12.5,
        status: "ACTIVE",
        days_held: 2,
      },
    ];

    vi.mocked(api.getBatchPerformance).mockResolvedValueOnce(mockBatch);

    render(<TradeList orders={mockOrders} hasActiveFilters={false} />);

    await waitFor(() => {
      expect(api.getBatchPerformance).toHaveBeenCalledWith([1, 2]);
      expect(screen.getByText("+12.50%")).toBeInTheDocument();
    });
  });

  it("shows the stored resolver status in snapshot mode", async () => {
    snapshotMode.publicDemo = true;
    vi.mocked(api.getBatchPerformance).mockResolvedValueOnce([
      { order_id: 1, ticker: "NVDA", current_price: 141, pnl_pct: 16.67, status: "HIT_TARGET", days_held: 2 },
    ]);
    try {
      render(<TradeList orders={mockOrders} hasActiveFilters={false} />);
      await waitFor(() => expect(screen.getByText("+16.67%")).toBeInTheDocument());
      expect(screen.queryByText("Target hit")).not.toBeInTheDocument();
    } finally {
      snapshotMode.publicDemo = false;
    }
  });

  it("displays fallback notice when live performance data fails to load", async () => {
    vi.mocked(api.getBatchPerformance).mockRejectedValueOnce(new Error("API offline"));

    render(<TradeList orders={mockOrders} hasActiveFilters={false} />);

    await waitFor(() => {
      expect(
        screen.getByText(/Live P&L data is temporarily unavailable/i)
      ).toBeInTheDocument();
    });
  });

  it("opens analysis panel when View Analysis button is clicked", async () => {
    vi.mocked(api.getBatchPerformance).mockResolvedValueOnce([]);
    vi.mocked(api.fetchSignalDetail).mockResolvedValueOnce({
      id: 1,
      ticker: "NVDA",
      timestamp_utc: new Date().toISOString(),
      action: "BUY",
      strategy_used: "Supernova",
      conviction_score: 92,
      convictionScore: 92,
      convictionLabel: "HIGH",
      entryPrice: 120.0,
      targetPrice: 140.0,
      stopLoss: 110.0,
      catalyst_type: "SUPERNOVA",
      status: "ACTIVE",
      rationale: "High short interest squeeze breakout",
      confluence_sources: ["squeeze"],
      key_risks: [],
      thesis: {
        headline: "Short Squeeze",
        bodyParagraphs: ["Thesis detail paragraph"],
        counterArguments: [],
      },
      pipeline: {
        engineVersion: "2.1.0",
        timeline: [],
      },
      scenarios: {
        bullCase: { target: 140, rationale: "Bull run" },
        baseCase: { target: 130, rationale: "Base run" },
        bearCase: { target: 110, rationale: "Bear run" },
      },
    } as any);

    render(<TradeList orders={mockOrders} hasActiveFilters={false} />);

    const viewBtns = screen.getAllByRole("button", { name: /Analysis/i });
    expect(viewBtns.length).toBeGreaterThan(0);
    fireEvent.click(viewBtns[0]);

    await waitFor(() => {
      expect(api.fetchSignalDetail).toHaveBeenCalledWith(1);
    });
  });

  it("keeps the reopened record and its loading state when an earlier detail request finishes late", async () => {
    let resolveFirst!: (detail: SignalDetail) => void;
    let resolveSecond!: (detail: SignalDetail) => void;
    const firstRequest = new Promise<SignalDetail>((resolve) => { resolveFirst = resolve; });
    const secondRequest = new Promise<SignalDetail>((resolve) => { resolveSecond = resolve; });
    const firstDetail = orderToSignalDetail(mockOrders[0]);
    firstDetail.thesis.bodyParagraphs = ["Delayed NVDA server detail"];
    const secondDetail = orderToSignalDetail(mockOrders[1]);
    secondDetail.thesis.bodyParagraphs = ["Current TSLA server detail"];
    vi.mocked(api.getBatchPerformance).mockResolvedValueOnce([]);
    vi.mocked(api.fetchSignalDetail)
      .mockReturnValueOnce(firstRequest)
      .mockReturnValueOnce(secondRequest);

    render(<TradeList orders={mockOrders} hasActiveFilters={false} />);
    fireEvent.click(screen.getByRole("button", { name: "View analysis for NVDA" }));
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    fireEvent.click(screen.getByRole("button", { name: "View analysis for TSLA" }));

    await act(async () => { resolveFirst(firstDetail); });
    const inspector = within(screen.getByRole("dialog"));
    expect(inspector.getByRole("heading", { name: "TSLA" })).toBeInTheDocument();
    expect(inspector.queryByText("Delayed NVDA server detail")).not.toBeInTheDocument();
    expect(inspector.getByText("Fetching pipeline analysis…")).toBeInTheDocument();

    await act(async () => { resolveSecond(secondDetail); });
    expect(inspector.getByText("Current TSLA server detail")).toBeInTheDocument();
    expect(inspector.queryByText("Fetching pipeline analysis…")).not.toBeInTheDocument();
  });
});
