import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignalFilterBar } from "@/components/signals/SignalFilterBar";

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/lib/api", () => ({
  searchTickers: vi.fn().mockResolvedValue([{ ticker: "NVDA" }, { ticker: "AAPL" }]),
}));

describe("SignalFilterBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it("renders all catalyst filter options with accessible roles", () => {
    render(<SignalFilterBar />);

    expect(screen.getByRole("region", { name: "Signal filters" })).toBeInTheDocument();
    expect(screen.getByText("All Catalysts")).toBeInTheDocument();
    expect(screen.getByText("Supernova")).toBeInTheDocument();
    expect(screen.getByText("Scalper")).toBeInTheDocument();
    expect(screen.getByText("Follower")).toBeInTheDocument();
    expect(screen.getByText("Drifter")).toBeInTheDocument();

    const allBtn = screen.getByText("All Catalysts");
    expect(allBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("selects catalyst filter and triggers router navigation", () => {
    render(<SignalFilterBar initialCatalyst="all" />);

    const supernovaBtn = screen.getByText("Supernova");
    fireEvent.click(supernovaBtn);

    expect(supernovaBtn).toHaveAttribute("aria-pressed", "true");
    expect(mockPush).toHaveBeenCalledTimes(1);
    const calledUrl = mockPush.mock.calls[0][0];
    expect(calledUrl).toContain("catalyst_type=SUPERNOVA");
  });

  it("selects conviction filter", () => {
    render(<SignalFilterBar initialMinConviction="all" />);

    const conv80Btn = screen.getByText("80+");
    fireEvent.click(conv80Btn);

    expect(conv80Btn).toHaveAttribute("aria-pressed", "true");
    expect(mockPush).toHaveBeenCalledTimes(1);
    const calledUrl = mockPush.mock.calls[0][0];
    expect(calledUrl).toContain("min_conviction=80");
  });

  it("selects date range filter", () => {
    render(<SignalFilterBar initialDateRange="all" />);

    const range30Btn = screen.getByText("30D");
    fireEvent.click(range30Btn);

    expect(range30Btn).toHaveAttribute("aria-pressed", "true");
    expect(mockPush).toHaveBeenCalledTimes(1);
    const calledUrl = mockPush.mock.calls[0][0];
    expect(calledUrl).toContain("date_range=30d");
  });

  it("renders CSV Export link with current filters", () => {
    render(<SignalFilterBar initialCatalyst="SUPERNOVA" initialMinConviction={70} />);

    const exportLink = screen.getByLabelText("Export filtered signals as CSV");
    expect(exportLink).toBeInTheDocument();
    expect(exportLink.getAttribute("href")).toContain("/signals/export/csv");
    expect(exportLink.getAttribute("href")).toContain("catalyst_type=SUPERNOVA");
    expect(exportLink.getAttribute("href")).toContain("min_conviction=70");
  });

  it("clears all active filters when Reset filters is clicked", () => {
    render(
      <SignalFilterBar
        initialCatalyst="SUPERNOVA"
        initialMinConviction={70}
        initialDateRange="7d"
      />
    );

    const resetBtn = screen.getByText("Reset filters");
    fireEvent.click(resetBtn);

    expect(mockPush).toHaveBeenCalledWith("/signals");
  });

  it("summarizes active filters and provides a clear action", () => {
    render(
      <SignalFilterBar
        initialCatalyst="SUPERNOVA"
        initialTicker="NVDA"
        initialDateRange="7d"
      />
    );

    const toggle = screen.getByRole("button", { name: /Filters/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("3 active")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear signal filters" }));
    expect(mockPush).toHaveBeenCalledWith("/signals");
  });
});
