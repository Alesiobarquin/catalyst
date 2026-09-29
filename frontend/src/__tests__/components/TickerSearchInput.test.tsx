import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TickerSearchInput } from "@/components/ui/TickerSearchInput";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  searchTickers: vi.fn(),
}));

describe("TickerSearchInput", () => {
  const defaultProps = {
    value: "",
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onClear: vi.fn(),
    placeholder: "Search ticker...",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders input with placeholder and search icon", () => {
    render(<TickerSearchInput {...defaultProps} />);

    const input = screen.getByPlaceholderText("Search ticker...");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("triggers debounced ticker search and displays suggestion dropdown", async () => {
    vi.mocked(api.searchTickers).mockResolvedValueOnce([
      { ticker: "NVDA" },
      { ticker: "NVO" },
    ]);

    const { rerender } = render(<TickerSearchInput {...defaultProps} value="" />);

    const input = screen.getByPlaceholderText("Search ticker...");
    fireEvent.change(input, { target: { value: "NV" } });
    expect(defaultProps.onChange).toHaveBeenCalledWith("NV");

    // Rerender with updated value prop as controlled input
    rerender(<TickerSearchInput {...defaultProps} value="NV" />);

    await waitFor(
      () => {
        expect(api.searchTickers).toHaveBeenCalledWith("NV");
        expect(screen.getByText("Tracked Assets")).toBeInTheDocument();
        expect(screen.getByText("NVDA")).toBeInTheDocument();
        expect(screen.getByText("NVO")).toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  it("handles keyboard navigation (ArrowDown, ArrowUp, Enter) to select ticker", async () => {
    vi.mocked(api.searchTickers).mockResolvedValueOnce([
      { ticker: "NVDA" },
      { ticker: "NVO" },
    ]);

    const { rerender } = render(<TickerSearchInput {...defaultProps} value="NV" />);

    await waitFor(
      () => {
        expect(screen.getByText("NVDA")).toBeInTheDocument();
      },
      { timeout: 1000 }
    );

    const input = screen.getByPlaceholderText("Search ticker...");

    // ArrowDown highlights first suggestion (NVDA)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // ArrowDown highlights second suggestion (NVO)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // ArrowUp goes back to first suggestion (NVDA)
    fireEvent.keyDown(input, { key: "ArrowUp" });
    // Enter selects NVDA
    fireEvent.keyDown(input, { key: "Enter" });

    expect(defaultProps.onChange).toHaveBeenCalledWith("NVDA");
    expect(defaultProps.onSubmit).toHaveBeenCalledWith("NVDA");
  });

  it("closes dropdown on Escape key", async () => {
    vi.mocked(api.searchTickers).mockResolvedValueOnce([{ ticker: "NVDA" }]);

    render(<TickerSearchInput {...defaultProps} value="NV" />);

    await waitFor(
      () => {
        expect(screen.getByText("Tracked Assets")).toBeInTheDocument();
      },
      { timeout: 1000 }
    );

    const input = screen.getByPlaceholderText("Search ticker...");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByText("Tracked Assets")).not.toBeInTheDocument();
  });

  it("selects suggestion on mouse click", async () => {
    vi.mocked(api.searchTickers).mockResolvedValueOnce([{ ticker: "AMD" }]);

    render(<TickerSearchInput {...defaultProps} value="AM" />);

    await waitFor(
      () => {
        expect(screen.getByText("AMD")).toBeInTheDocument();
      },
      { timeout: 1000 }
    );

    fireEvent.mouseDown(screen.getByText("AMD"));

    expect(defaultProps.onChange).toHaveBeenCalledWith("AMD");
    expect(defaultProps.onSubmit).toHaveBeenCalledWith("AMD");
  });

  it("clears search input when clear button is clicked", () => {
    render(<TickerSearchInput {...defaultProps} value="AAPL" />);

    const clearBtn = screen.getByTitle("Clear search");
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);

    expect(defaultProps.onChange).toHaveBeenCalledWith("");
    expect(defaultProps.onClear).toHaveBeenCalled();
  });

  it("closes suggestion dropdown when clicking outside", async () => {
    vi.mocked(api.searchTickers).mockResolvedValueOnce([{ ticker: "GOOGL" }]);

    render(
      <div>
        <div data-testid="outside">Outside area</div>
        <TickerSearchInput {...defaultProps} value="GOOG" />
      </div>
    );

    await waitFor(
      () => {
        expect(screen.getByText("Tracked Assets")).toBeInTheDocument();
      },
      { timeout: 1000 }
    );

    fireEvent.mouseDown(screen.getByTestId("outside"));

    expect(screen.queryByText("Tracked Assets")).not.toBeInTheDocument();
  });
});
