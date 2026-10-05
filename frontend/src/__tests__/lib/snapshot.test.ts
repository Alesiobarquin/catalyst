import { afterEach, describe, expect, it, vi } from "vitest";
import { filterRows, paginate } from "@/lib/snapshot";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("Public snapshots", () => {
  it("rejects a manifest that redirects the browser outside the published dataset", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schema_version: 1, run_id: "x", data_path: "https://external.test/private" }) }));
    const { loadSnapshot } = await import("@/lib/snapshot");
    await expect(loadSnapshot()).rejects.toThrow("Invalid results manifest");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects mismatched immutable run identifiers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ schema_version: 1, run_id: "new", data_path: "/data/runs/new/snapshot.json" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ schema_version: 1, run_id: "old", orders: [], signals: [] }) }));
    const { loadSnapshot } = await import("@/lib/snapshot");
    await expect(loadSnapshot()).rejects.toThrow("Invalid results dataset");
  });
  it("filters and paginates exported rows without a server", () => {
    const rows = [{ ticker: "NVDA", timestamp_utc: new Date().toISOString() }, { ticker: "AAPL", timestamp_utc: "2000-01-01T00:00:00Z" }];
    expect(filterRows(rows, { date_range: "7d" })).toHaveLength(1);
    expect(filterRows(rows, { ticker: "nvda" })[0].ticker).toBe("NVDA");
    expect(paginate(rows, 2, 1)).toEqual({ items: [rows[1]], total: 2, page: 2, per_page: 1 });
  });
  it("keeps stale or fractional page queries within the actual result pages", () => {
    const rows = ["first", "second"];
    expect(paginate(rows, 999, 1)).toMatchObject({ items: ["second"], page: 2 });
    expect(paginate(rows, 1.5, 1)).toMatchObject({ items: ["first"], page: 1 });
    expect(paginate([], 999)).toMatchObject({ items: [], page: 1 });
  });
});
