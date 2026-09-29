import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignalDetailPanel } from "@/components/dashboard/SignalDetailPanel";
import type { SignalDetail, TradeOrder } from "@/types";
import * as api from "@/lib/api";

// Mock PriceChart
vi.mock("@/components/charts/PriceChart", () => ({
  PriceChart: () => <div data-testid="price-chart">Mocked PriceChart</div>,
}));

// Mock API
vi.mock("@/lib/api", () => ({
  getPriceHistory: vi.fn().mockResolvedValue([]),
}));

const mockSignal: SignalDetail = {
  ticker: "NVDA",
  exchange: "NASDAQ",
  sector: "Technology",
  action: "BUY",
  status: "Active",
  strategy: "SUPERNOVA",
  strategyDescription: "Momentum breakout on high relative volume",
  convictionScore: 88,
  convictionMax: 100,
  convictionLabel: "HIGH",
  entryPrice: 120.5,
  stopLoss: 112.0,
  targetPrice: 145.0,
  currentPrice: 128.0,
  pnlPercent: 6.22,
  riskReward: "1:2.88",
  positionSize: "$5,000",
  timeHorizon: "2-5 days",
  generatedAt: "2026-09-28T14:30:00Z",
  age: "2h ago",
  signalId: "SIG-NVDA-001",
  thesis: {
    primaryCatalyst: "Record Q3 Data Center Revenue beat with upgraded guidance",
    bodyParagraphs: [
      "NVDA reported Q3 earnings significantly exceeding street estimates driven by Blackwell chip demand.",
      "Customer CAPEX expansion confirms structural multi-year AI accelerator adoption.",
    ],
    counterArguments: [
      "Potential export restrictions to emerging markets.",
      "High valuation multiples leave low margin for execution error.",
    ],
  },
  confluence: {
    factors: [
      {
        source: "Earnings Beat",
        strength: "HIGH",
        data: "EPS +24% YoY, Revenue +112% YoY",
      },
      {
        source: "Unusual Options Flow",
        strength: "MODERATE",
        data: "$4.2M call sweeps at $130 strike expiring this Friday",
      },
    ],
    summaryText: "Strong confluence between fundamental earnings drift and institutional options accumulation.",
  },
  risk: {
    parameters: [
      { label: "Account Risk", value: "1.5%", description: "Kelly scaled equity risk" },
      { label: "R:R Ratio", value: "2.88", description: "Target return vs stop risk" },
    ],
    exitTriggers: [
      { priority: 1, condition: "Price closes below $112.00 on 15m candle", action: "Market Stop Out" },
      { priority: 2, condition: "Price reaches target $145.00", action: "Scale Out 75%" },
    ],
    scenarios: [
      { label: "Bullish Extension", value: "+20.3%", probability: "65%", type: "best" },
      { label: "Consolidation", value: "+3.5%", probability: "20%", type: "base" },
      { label: "Adverse Reversal", value: "-7.1%", probability: "15%", type: "worst" },
    ],
    expectedValue: "+10.2%",
  },
  pipeline: {
    signalId: "SIG-NVDA-001",
    generatedAt: "2026-09-28T14:30:00Z",
    engineVersion: "v1.4.2",
    timeline: [
      { stage: "Ingestion", timestamp: "14:30:01Z", detail: "Finviz scraper hit" },
      { stage: "AI Validation", timestamp: "14:30:03Z", detail: "Gemini 2.5 flash analysis complete" },
    ],
    rawFactors: { rvol: 3.4, short_interest: "4.2%", vix: 14.5 },
  },
};

const mockOrder: TradeOrder = {
  id: 1,
  ticker: "NVDA",
  action: "BUY",
  strategy_used: "Supernova",
  catalyst_type: "DRIFTER",
  status: "ACTIVE",
  current_price: 120.5,
  limit_price: 121.0,
  stop_loss: 112.0,
  target_price: 145.0,
  recommended_size_usd: 5000,
  conviction_score: 88,
  timestamp_utc: "2026-09-28T14:30:00Z",
  rationale: "Momentum breakout on high relative volume",
  regime_vix: 14.5,
  spy_above_200sma: true,
};

describe("SignalDetailPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.className = "";
  });

  it("does not render dialog when isOpen is false", () => {
    render(<SignalDetailPanel signal={mockSignal} isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders modal dialog, ticker header, and thesis when isOpen is true", () => {
    render(<SignalDetailPanel signal={mockSignal} isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "NVDA" })).toBeInTheDocument();
    expect(screen.getByText(/Record Q3 Data Center Revenue beat/i)).toBeInTheDocument();
    expect(
      screen.getByText(/NVDA reported Q3 earnings significantly exceeding/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Potential export restrictions/i)
    ).toBeInTheDocument();
  });

  it("calls onClose when Close button is clicked", async () => {
    const handleClose = vi.fn();
    render(<SignalDetailPanel signal={mockSignal} isOpen={true} onClose={handleClose} />);

    const closeBtn = screen.getByRole("button", { name: /close panel/i });
    await userEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const handleClose = vi.fn();
    render(<SignalDetailPanel signal={mockSignal} isOpen={true} onClose={handleClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("locks body scroll while open and unlocks when closed", () => {
    const { rerender } = render(
      <SignalDetailPanel signal={mockSignal} isOpen={true} onClose={vi.fn()} />
    );

    expect(document.body.classList.contains("panel-open")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<SignalDetailPanel signal={mockSignal} isOpen={false} onClose={vi.fn()} />);
    expect(document.body.classList.contains("panel-open")).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("renders PriceChart and calls getPriceHistory when order is provided", async () => {
    render(
      <SignalDetailPanel
        signal={mockSignal}
        isOpen={true}
        onClose={vi.fn()}
        order={mockOrder}
      />
    );

    await waitFor(() => {
      expect(api.getPriceHistory).toHaveBeenCalledWith("NVDA", "2026-09-28T14:30:00Z");
      expect(screen.getByTestId("price-chart")).toBeInTheDocument();
    });
  });

  it("renders risk parameters, scenarios, and expected value", () => {
    render(<SignalDetailPanel signal={mockSignal} isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText("Account Risk")).toBeInTheDocument();
    expect(screen.getByText("Bullish Extension")).toBeInTheDocument();
    expect(screen.getByText("+20.3%")).toBeInTheDocument();
    expect(screen.getByText("Adverse Reversal")).toBeInTheDocument();
    expect(screen.getByText("-7.1%")).toBeInTheDocument();
  });
});
