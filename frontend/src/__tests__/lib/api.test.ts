import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getOrders } from "@/lib/api";

// We need to test the apiBaseUrl logic which is internal, so we'll mock the fetch
// and observe the URL that gets requested.
describe("api", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("getOrders", () => {
    it("constructs basic query string", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], total: 0, page: 1, per_page: 20 }),
      } as Response);

      await getOrders({ page: 2, per_page: 10 });
      
      const calls = vi.mocked(global.fetch).mock.calls;
      expect(calls.length).toBe(1);
      const url = calls[0][0] as string;
      expect(url).toContain("page=2");
      expect(url).toContain("per_page=10");
    });

    it("handles all parameters in query string", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], total: 0, page: 1, per_page: 20 }),
      } as Response);

      await getOrders({
        strategy: "Scalper",
        status: "ACTIVE",
        ticker: "TSLA",
        date_range: "7d",
        page: 3,
      });
      
      const url = vi.mocked(global.fetch).mock.calls[0][0] as string;
      expect(url).toContain("strategy=Scalper");
      expect(url).toContain("status=ACTIVE");
      expect(url).toContain("ticker=TSLA");
      expect(url).toContain("date_range=7d");
      expect(url).toContain("page=3");
    });

    it("ignores 'all' values for strategy, status, and date_range", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], total: 0, page: 1, per_page: 20 }),
      } as Response);

      await getOrders({
        strategy: "all",
        status: "all",
        date_range: "all",
      });
      
      const url = vi.mocked(global.fetch).mock.calls[0][0] as string;
      expect(url).not.toContain("strategy=");
      expect(url).not.toContain("status=");
      expect(url).not.toContain("date_range=");
    });

    it("throws an error when response is not ok", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
      } as Response);

      await expect(getOrders()).rejects.toThrow("Failed to fetch orders");
    });
  });

  describe("apiBaseUrl behavior", () => {
    // We test this by observing the fetch URL prefix
    it("uses NEXT_PUBLIC_API_URL when in browser (window defined)", async () => {
      vi.stubGlobal("window", {});
      vi.stubEnv("NEXT_PUBLIC_API_URL", "http://browser-url");

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await getOrders();
      const url = vi.mocked(global.fetch).mock.calls[0][0] as string;
      expect(url).to.satisfy((u: string) => u.startsWith("http://browser-url"));
    });

    it("uses API_INTERNAL_URL during SSR if provided", async () => {
      // no window
      vi.stubGlobal("window", undefined);
      vi.stubEnv("API_INTERNAL_URL", "http://ssr-internal-url");
      vi.stubEnv("NEXT_PUBLIC_API_URL", "http://browser-url");

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await getOrders();
      const url = vi.mocked(global.fetch).mock.calls[0][0] as string;
      expect(url).to.satisfy((u: string) => u.startsWith("http://ssr-internal-url"));
    });

    it("falls back to localhost:8000 when no env vars and no window", async () => {
      vi.stubGlobal("window", undefined);
      delete process.env.API_INTERNAL_URL;
      delete process.env.NEXT_PUBLIC_API_URL;

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await getOrders();
      const url = vi.mocked(global.fetch).mock.calls[0][0] as string;
      expect(url).to.satisfy((u: string) => u.startsWith("http://localhost:8000"));
    });
  });
});
