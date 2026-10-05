import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicDashboard } from "@/components/public/PublicDashboard";
import { loadRunStatus, loadSnapshot, type PublicSnapshot, type RunStatus } from "@/lib/snapshot";
import type { OrderStats, SignalStats, ValidatedSignal } from "@/types";

const navigation = vi.hoisted(() => ({ query: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/lib/snapshot", async () => {
  const actual = await vi.importActual<typeof import("@/lib/snapshot")>("@/lib/snapshot");
  return { ...actual, loadSnapshot: vi.fn(), loadRunStatus: vi.fn(), downloadCsv: vi.fn() };
});

vi.mock("@/components/dashboard/StatsBar", () => ({ StatsBar: () => <div data-testid="stats-bar" /> }));
vi.mock("@/components/dashboard/FilterBar", () => ({ FilterBar: () => <div data-testid="order-filters" /> }));
vi.mock("@/components/dashboard/TradeList", () => ({ TradeList: () => <div data-testid="trade-list" /> }));
vi.mock("@/components/dashboard/MarketOverviewBar", () => ({ MarketOverviewBar: () => <div data-testid="market-overview" /> }));
vi.mock("@/components/signals/SignalTable", () => ({ SignalTable: () => <div data-testid="signal-table" /> }));
vi.mock("@/components/signals/SignalFilterBar", () => ({ SignalFilterBar: () => <div data-testid="signal-filters" /> }));
vi.mock("@/components/ui/Pagination", () => ({ Pagination: () => null }));
vi.mock("@/components/analytics/Charts", () => ({
  PerformanceSummary: () => <div>Performance summary chart</div>,
  StrategyBreakdown: () => <div>Strategy breakdown chart</div>,
  ConvictionHistogram: () => <div>Conviction chart</div>,
  SignalTimeline: () => <div>Timeline chart</div>,
}));
vi.mock("@/components/analytics/KellySimulator", () => ({ KellySimulator: () => <div>Illustrative sizing model</div> }));

const emptyStats: OrderStats = {
  total_orders: 0,
  avg_conviction: 0,
  hit_target_count: 0,
  hit_stop_count: 0,
  active_count: 0,
  strategy_breakdown: { Supernova: 0, Scalper: 0, Follower: 0, Drifter: 0, Fallback: 0 },
  catalyst_breakdown: { SUPERNOVA: 0, SCALPER: 0, FOLLOWER: 0, DRIFTER: 0, UNKNOWN: 0 },
  daily_volume: [],
  conviction_distribution: [],
};

const emptySignalStats: SignalStats = {
  total_signals: 0,
  avg_conviction: 0,
  trap_count: 0,
  clean_count: 0,
  trap_rate_percent: 0,
  high_conviction_count: 0,
  catalyst_breakdown: {},
};

const signal: ValidatedSignal = {
  id: 12,
  ticker: "NVDA",
  timestamp_utc: new Date().toISOString(),
  conviction_score: 78,
  catalyst_type: "SUPERNOVA",
  rationale: "Volume and options activity confirm the catalyst.",
  is_trap: false,
  confluence_sources: ["squeeze", "whale"],
  confluence_count: 2,
  key_risks: ["Earnings volatility"],
};

function makeSnapshot(overrides: Partial<PublicSnapshot> = {}): PublicSnapshot {
  return {
    schema_version: 1,
    run_id: "20261005T140402Z",
    as_of: new Date().toISOString(),
    status: "partial",
    commit: "abcdef0123456789",
    hunters: [
      { hunter: "Squeeze", success: true, emitted_events: 0, error: null, duration_sec: 2.1 },
      { hunter: "Whale", success: false, emitted_events: 0, error: "Timed out", duration_sec: 30 },
    ],
    event_counts: { "raw-events": 0 },
    orders: [],
    signals: [],
    order_stats: emptyStats,
    signal_stats: emptySignalStats,
    benchmarks: [],
    quotes: {},
    history: {},
    performance: [],
    details: {},
    ...overrides,
  };
}

async function renderDashboard(view: "orders" | "signals" | "analytics", data = makeSnapshot(), attempt: RunStatus | null = null) {
  vi.mocked(loadSnapshot).mockResolvedValue(data);
  vi.mocked(loadRunStatus).mockResolvedValue(attempt);
  render(<PublicDashboard view={view} />);
  await screen.findByRole("region", { name: "Published scan" });
}

describe("PublicDashboard snapshot states", () => {
  beforeEach(() => {
    navigation.query = "";
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("explains an empty partial dashboard and omits empty metrics, filters, and export", async () => {
    await renderDashboard("orders");

    expect(screen.getByRole("heading", { name: "No recommendations in this snapshot" })).toBeInTheDocument();
    expect(screen.getByText(/Some hunter sweeps could not complete, and no recommendation was published/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View scan report" })).toBeInTheDocument();
    expect(screen.queryByTestId("stats-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("order-filters")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export CSV" })).not.toBeInTheDocument();
  });

  it("opens the real scan report and moves focus to its summary", async () => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    await renderDashboard("orders");

    fireEvent.click(screen.getByRole("button", { name: "View scan report" }));

    const summary = screen.getByText(/Scan report/).closest("summary");
    expect(summary).toHaveFocus();
    expect(summary?.parentElement).toHaveProperty("open", true);
  });

  it("distinguishes a filtered signal mismatch and links Clear filters to signals", async () => {
    navigation.query = "ticker=MSFT";
    await renderDashboard("signals", makeSnapshot({ status: "completed", signals: [signal] }));

    expect(screen.getByRole("heading", { name: "No signals match current filters" })).toBeInTheDocument();
    const clearFilters = screen.getByRole("link", { name: "Clear filters" });
    expect(clearFilters).toHaveAttribute("href", "/signals");
    expect(screen.queryByTestId("signal-table")).not.toBeInTheDocument();
  });

  it("shows one empty analytics view and the simulator without empty chart cards", async () => {
    await renderDashboard("analytics");

    expect(screen.getByRole("heading", { name: "No recommendation data to analyze yet" })).toBeInTheDocument();
    expect(screen.getByText("Illustrative sizing model")).toBeInTheDocument();
    expect(screen.queryByText("Performance summary chart")).not.toBeInTheDocument();
    expect(screen.queryByText("Strategy breakdown chart")).not.toBeInTheDocument();
    expect(screen.queryByText("Conviction chart")).not.toBeInTheDocument();
    expect(screen.queryByText("Timeline chart")).not.toBeInTheDocument();
    expect(screen.queryByText("Modeled win rate")).not.toBeInTheDocument();
  });

  it("keeps the published snapshot visible and explains a newer failed scan", async () => {
    const data = makeSnapshot({ status: "completed", signals: [signal] });
    const attempt: RunStatus = { status: "failed", updated_at: new Date(Date.now() + 60_000).toISOString() };
    await renderDashboard("signals", data, attempt);

    expect(await screen.findByText(/The latest run failed to publish/)).toBeInTheDocument();
    expect(screen.getByTestId("signal-table")).toBeInTheDocument();
    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledTimes(1));
  });
});
