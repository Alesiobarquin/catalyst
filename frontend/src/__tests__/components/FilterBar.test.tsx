import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FilterBar } from "@/components/dashboard/FilterBar";

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

describe("FilterBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it("renders all strategy options, status options, and date ranges", () => {
    render(
      <FilterBar
        initialStrategy="all"
        initialDateRange="30d"
        initialStatus="all"
        initialTicker=""
      />
    );

    // Strategies
    expect(screen.getByText("Supernova")).toBeInTheDocument();
    expect(screen.getByText("Scalper")).toBeInTheDocument();
    expect(screen.getByText("Follower")).toBeInTheDocument();
    expect(screen.getByText("Drifter")).toBeInTheDocument();

    // Statuses
    expect(screen.getByText("All Status")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Target Hit")).toBeInTheDocument();
    expect(screen.getByText("Stopped")).toBeInTheDocument();

    // Date ranges
    expect(screen.getByText("7D")).toBeInTheDocument();
    expect(screen.getByText("30D")).toBeInTheDocument();
    expect(screen.getByText("90D")).toBeInTheDocument();
  });

  it("selects strategy and triggers router push with strategy query param", () => {
    render(
      <FilterBar
        initialStrategy="all"
        initialDateRange="30d"
        initialStatus="all"
        initialTicker=""
      />
    );

    const supernovaBtn = screen.getByText("Supernova");
    fireEvent.click(supernovaBtn);

    expect(supernovaBtn).toHaveAttribute("aria-pressed", "true");
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0]).toContain("strategy=Supernova");
  });

  it("selects status and triggers router push with status query param", () => {
    render(
      <FilterBar
        initialStrategy="all"
        initialDateRange="30d"
        initialStatus="all"
        initialTicker=""
      />
    );

    const hitTargetBtn = screen.getByText("Target Hit");
    fireEvent.click(hitTargetBtn);

    expect(hitTargetBtn).toHaveAttribute("aria-pressed", "true");
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0]).toContain("status=HIT_TARGET");
  });

  it("selects date range and triggers router push with date_range query param", () => {
    render(
      <FilterBar
        initialStrategy="all"
        initialDateRange="30d"
        initialStatus="all"
        initialTicker=""
      />
    );

    const range7dBtn = screen.getByText("7D");
    fireEvent.click(range7dBtn);

    expect(range7dBtn).toHaveAttribute("aria-pressed", "true");
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0]).toContain("date_range=7d");
  });

  it("renders CSV Export link with current filters", () => {
    render(
      <FilterBar
        initialStrategy="Supernova"
        initialDateRange="7d"
        initialStatus="ACTIVE"
        initialTicker=""
      />
    );

    const exportLink = screen.getByLabelText("Export filtered orders as CSV");
    expect(exportLink).toBeInTheDocument();
    const href = exportLink.getAttribute("href") || "";
    expect(href).toContain("/orders/export/csv");
    expect(href).toContain("strategy=Supernova");
    expect(href).toContain("status=ACTIVE");
  });

  it("resets all active filters when Reset filters button is clicked", () => {
    render(
      <FilterBar
        initialStrategy="Supernova"
        initialDateRange="7d"
        initialStatus="ACTIVE"
        initialTicker="NVDA"
      />
    );

    const resetBtn = screen.getByText("Reset filters");
    fireEvent.click(resetBtn);

    expect(mockPush).toHaveBeenCalledWith("/");
  });
});
