import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PipelineStatus } from "@/components/layout/PipelineStatus";

describe("PipelineStatus", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders live state when pipeline health is fully ready", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
        api: "ok",
        database: "ok",
        redis: "ok",
        engine: "ok",
        ready: true,
      }),
    });

    render(<PipelineStatus />);

    await waitFor(() => {
      expect(screen.getByText("LIVE")).toBeInTheDocument();
      expect(screen.getByText("Pipeline ready")).toBeInTheDocument();
    });
  });

  it("renders degraded state when engine or redis is down but database is ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
        api: "ok",
        database: "ok",
        redis: "ok",
        engine: "down",
        ready: false,
      }),
    });

    render(<PipelineStatus />);

    await waitFor(() => {
      expect(screen.getByText("DEGRADED")).toBeInTheDocument();
      expect(screen.getByText(/Engine down/)).toBeInTheDocument();
    });
  });

  it("renders offline state when database is error or fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network connection refused"));

    render(<PipelineStatus />);

    await waitFor(() => {
      expect(screen.getByText("OFFLINE")).toBeInTheDocument();
      expect(screen.getByText("API unreachable")).toBeInTheDocument();
    });
  });
});
