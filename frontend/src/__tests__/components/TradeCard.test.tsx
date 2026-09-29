import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TradeCard } from "@/components/dashboard/TradeCard";
import type { TradeOrder } from "@/types";

vi.mock("@/components/charts/PriceChart", () => ({
  PriceChart: () => <div data-testid="mock-price-chart">PriceChart</div>,
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, style, className }: any) => (
      <div style={style} className={className}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockGetPriceHistory = vi.fn().mockResolvedValue([
  { time: "2026-03-01", open: 120, high: 130, low: 119, close: 125, volume: 500000 },
]);

vi.mock("@/lib/api", () => ({
  getPriceHistory: (...args: any[]) => mockGetPriceHistory(...args),
}));

const baseOrder: TradeOrder = {
  id: 42,
  ticker: "NVDA",
  timestamp_utc: "2026-03-15T14:30:00Z",
  action: "BUY",
  strategy_used: "Supernova",
  recommended_size_usd: 15000,
  limit_price: 120.0,
  stop_loss: 110.0,
  target_price: 145.0,
  rationale: "Unusual options sweep with 35% short float and strong sector momentum.",
  conviction_score: 85,
  catalyst_type: "SUPERNOVA",
  regime_vix: 18.5,
  spy_above_200sma: true,
  status: "ACTIVE",
  execution: null,
};

describe("TradeCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders order ticker, strategy, and risk-reward metrics", () => {
    render(<TradeCard order={baseOrder} />);

    expect(screen.getByText("NVDA")).toBeInTheDocument();
    expect(screen.getByText("Supernova")).toBeInTheDocument();
    expect(screen.getByText(/85/)).toBeInTheDocument();
    expect(screen.getByText("$120.00")).toBeInTheDocument();
    expect(screen.getByText("$110.00")).toBeInTheDocument();
    expect(screen.getByText("$145.00")).toBeInTheDocument();
  });

  it("renders execution badge when execution is attached", () => {
    const executedOrder: TradeOrder = {
      ...baseOrder,
      execution: {
        id: 101,
        trade_order_id: 42,
        timestamp_utc: "2026-03-15T14:31:00Z",
        ticker: "NVDA",
        alpaca_order_id: "alp-123",
        execution_status: "filled",
        filled_avg_price: 120.5,
        error_message: null,
      },
    };

    render(<TradeCard order={executedOrder} />);

    expect(screen.getByText("Filled @ $120.50")).toBeInTheDocument();
  });

  it("renders resolution status badge when resolved", () => {
    const resolvedOrder: TradeOrder = {
      ...baseOrder,
      status: "RESOLVED_WIN",
      resolved_price: 145.0,
      pnl_percent: 20.83,
      realized_pnl_usd: 3125.0,
    };

    render(<TradeCard order={resolvedOrder} />);

    expect(screen.getByText("Resolved (Win)")).toBeInTheDocument();
  });

  it("toggles chart expansion on click and fetches price history", async () => {
    render(<TradeCard order={baseOrder} />);

    const toggleBtn = screen.getByText("View chart");
    expect(toggleBtn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggleBtn);

    expect(toggleBtn).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => {
      expect(mockGetPriceHistory).toHaveBeenCalledWith("NVDA", "2026-03-15T14:30:00Z");
      expect(screen.getByTestId("mock-price-chart")).toBeInTheDocument();
    });
  });

  it("calls onViewAnalysis when View analysis is clicked", () => {
    const mockOnView = vi.fn();
    render(<TradeCard order={baseOrder} onViewAnalysis={mockOnView} />);

    const viewBtn = screen.getByText("View analysis");
    fireEvent.click(viewBtn);

    expect(mockOnView).toHaveBeenCalledTimes(1);
    expect(mockOnView.mock.calls[0][0].ticker).toBe("NVDA");
  });
});
