import type { TradeOrder, ValidatedSignal, OrderStats, SignalStats, MarketQuote, PriceBar, BatchPerformance, SignalDetail } from "@/types";

export const PUBLIC_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "snapshot";

export interface HunterOutcome {
  hunter: string;
  success: boolean;
  emitted_events?: number;
  error: string | null;
  duration_sec: number;
}

export interface PublicSnapshot {
  schema_version: 1;
  run_id: string;
  as_of: string;
  status: "completed" | "partial" | "awaiting_first_run";
  commit: string;
  hunters: HunterOutcome[];
  event_counts: Record<string, number>;
  orders: TradeOrder[];
  signals: ValidatedSignal[];
  order_stats: OrderStats;
  signal_stats: SignalStats;
  benchmarks: MarketQuote[];
  quotes: Record<string, MarketQuote>;
  history: Record<string, PriceBar[]>;
  performance: BatchPerformance[];
  details: Record<string, SignalDetail>;
  regime?: { fresh: boolean; captured_at?: string; vix?: number; spy?: number; spy_200_sma?: number };
}

let cached: Promise<PublicSnapshot> | undefined;
let fetchedAt = 0;

export function loadSnapshot(): Promise<PublicSnapshot> {
  if (cached && Date.now() - fetchedAt < 60_000) return cached;
  fetchedAt = Date.now();
  cached = (async () => {
    const manifestResponse = await fetch("/data/manifest.json", { cache: "no-store" });
    if (!manifestResponse.ok) throw new Error("Daily results are temporarily unavailable. Retry shortly.");
    const manifest = await manifestResponse.json() as { schema_version: number; run_id: string; data_path: string };
    if (manifest.schema_version !== 1 || !/^\/data\/runs\/[A-Za-z0-9_-]+\/snapshot\.json$/.test(manifest.data_path)) {
      throw new Error("Invalid results manifest");
    }
    const response = await fetch(manifest.data_path);
    if (!response.ok) throw new Error("Daily results could not be loaded");
    const snapshot = await response.json() as PublicSnapshot;
    if (snapshot.schema_version !== 1 || snapshot.run_id !== manifest.run_id || !Array.isArray(snapshot.orders) || !Array.isArray(snapshot.signals)) {
      throw new Error("Invalid results dataset");
    }
    return snapshot;
  })().catch((error) => { cached = undefined; throw error; });
  return cached;
}

export function filterRows<T extends { ticker: string; timestamp_utc: string }>(rows: T[], params?: { ticker?: string; date_range?: string }): T[] {
  const days = params?.date_range === "7d" ? 7 : params?.date_range === "30d" ? 30 : params?.date_range === "90d" ? 90 : null;
  return rows.filter((row) => (!params?.ticker || row.ticker.toUpperCase() === params.ticker.toUpperCase()) &&
    (!days || Date.parse(row.timestamp_utc) >= Date.now() - days * 86_400_000));
}

export function paginate<T>(rows: T[], page = 1, perPage = 15) {
  const safePage = Math.max(1, page);
  return { items: rows.slice((safePage - 1) * perPage, safePage * perPage), total: rows.length, page: safePage, per_page: perPage };
}

export function downloadCsv(rows: object[], name: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]).filter((key) => key !== "execution");
  const escape = (value: unknown) => {
    const raw = Array.isArray(value) ? value.join("; ") : String(value ?? "");
    const safe = /^[=+@\-]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const content = [keys.join(","), ...rows.map((row) => keys.map((key) => escape((row as Record<string, unknown>)[key])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  URL.revokeObjectURL(url);
}
