import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SettingsPage from "@/app/settings/page";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getPipelineHealth: vi.fn(),
  getAlpacaStatus: vi.fn(),
  saveAlpacaKeys: vi.fn(),
  deleteAlpacaKeys: vi.fn(),
  injectSyntheticSignal: vi.fn(),
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getPipelineHealth).mockResolvedValue({
      api: "ok",
      database: "ok",
      redis: "ok",
      engine: "UP",
      ready: true,
    });
    vi.mocked(api.getAlpacaStatus).mockResolvedValue({ has_keys: false });
  });

  it("renders settings header and initial telemetry status", async () => {
    render(<SettingsPage />);

    expect(screen.getByRole("heading", { name: "Execution & Broker Settings" })).toBeInTheDocument();
    expect(screen.getByText(/Pipeline Telemetry & Subsystems/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("API LAYER")).toBeInTheDocument();
      expect(screen.getByText("DATABASE")).toBeInTheDocument();
      expect(screen.getByText("REDIS CACHE")).toBeInTheDocument();
      expect(screen.getByText("STRATEGY ENGINE")).toBeInTheDocument();
    });
  });

  it("renders Alpaca credentials form in disconnected state", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Alpaca Paper Trading")).toBeInTheDocument();
      expect(screen.getByText("Disconnected")).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(/e\.g\. PKTEST12345678/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save & Verify/i })).toBeInTheDocument();
  });

  it("renders synthetic signal injection form and handles submission", async () => {
    vi.mocked(api.injectSyntheticSignal).mockResolvedValueOnce({
      success: true,
      events_injected: 2,
      detail: "Successfully injected 2 events",
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Developer Signal Injection & Confluence Test/i)).toBeInTheDocument();
    });

    const tickerInput = screen.getByDisplayValue("NVDA");
    await userEvent.clear(tickerInput);
    await userEvent.type(tickerInput, "TSLA");

    const injectButton = screen.getByRole("button", { name: /Inject Test Events/i });
    await userEvent.click(injectButton);

    await waitFor(() => {
      expect(api.injectSyntheticSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          ticker: "TSLA",
          scenario: "confluence",
        })
      );
      expect(screen.getByText(/Injected 2 events for TSLA \(confluence\)/i)).toBeInTheDocument();
    });
  });

  it("displays connected state when Alpaca keys are present", async () => {
    vi.mocked(api.getAlpacaStatus).mockResolvedValueOnce({ has_keys: true });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Disconnect Alpaca/i })).toBeInTheDocument();
    });
  });
});
