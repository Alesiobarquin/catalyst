import type {
  TradeOrder,
  TradeExecution,
  ValidatedSignal,
  OrderStats,
  PriceBar,
  PaginatedResponse,
  BatchPerformance,
  SignalDetail,
} from "@/types";
import { MOCK_ORDERS, MOCK_SIGNALS, MOCK_STATS } from "./mock-data";

const USE_MOCK = false;

/** Browser + local `npm run dev`: localhost. Docker SSR: use service name `api`. */
function apiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  }
  return (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8000"
  );
}

// ── Trade Orders ──────────────────────────────────────────────────

export async function getOrders(params?: {
  strategy?: string;
  date_range?: "7d" | "30d" | "90d" | "all";
  page?: number;
  per_page?: number;
}): Promise<PaginatedResponse<TradeOrder>> {
  if (USE_MOCK) {
    let items = [...MOCK_ORDERS];
    if (params?.strategy && params.strategy !== "all") {
      items = items.filter((o) => o.strategy_used === params.strategy);
    }
    return { items, total: items.length, page: 1, per_page: 20 };
  }
  const qs = new URLSearchParams();
  if (params?.strategy && params.strategy !== "all") qs.set("strategy", params.strategy);
  if (params?.date_range && params.date_range !== "all") qs.set("date_range", params.date_range);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  const res = await fetch(`${apiBaseUrl()}/orders?${qs}`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error("Failed to fetch orders");
  return res.json();
}

export async function getOrdersByTicker(ticker: string): Promise<TradeOrder[]> {
  if (USE_MOCK) return MOCK_ORDERS.filter((o) => o.ticker === ticker);
  const res = await fetch(`${apiBaseUrl()}/orders/${ticker}`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`Failed to fetch orders for ${ticker}`);
  return res.json();
}

export async function getOrderStats(): Promise<OrderStats> {
  if (USE_MOCK) return MOCK_STATS;
  const res = await fetch(`${apiBaseUrl()}/orders/stats`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error("Failed to fetch order stats");
  return res.json();
}

// ── Validated Signals ─────────────────────────────────────────────

export async function getSignals(params?: {
  page?: number;
  per_page?: number;
}): Promise<PaginatedResponse<ValidatedSignal>> {
  if (USE_MOCK) return { items: MOCK_SIGNALS, total: MOCK_SIGNALS.length, page: 1, per_page: 20 };
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  const res = await fetch(`${apiBaseUrl()}/signals?${qs}`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error("Failed to fetch signals");
  return res.json();
}

// ── Price History ─────────────────────────────────────────────────

export async function getPriceHistory(
  ticker: string,
  fromTimestamp: string
): Promise<PriceBar[]> {
  if (USE_MOCK) {
    return [];
  }
  const res = await fetch(
    `${apiBaseUrl()}/market/${ticker}/history?from=${encodeURIComponent(fromTimestamp)}`,
    { next: { revalidate: 300 } }
  );
  if (!res.ok) throw new Error(`Failed to fetch price history for ${ticker}`);
  return res.json();
}

// ── Performance (live P&L) ────────────────────────────────────────

export async function getBatchPerformance(
  ids: number[]
): Promise<BatchPerformance[]> {
  if (USE_MOCK || ids.length === 0) return [];
  const res = await fetch(
    `${apiBaseUrl()}/performance/batch?ids=${ids.join(",")}`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  return res.json();
}

// ── Signal Detail (narrative synthesis) ──────────────────────────
// GET /orders/{id}/detail
// Returns the pipeline-generated SignalDetail object, which includes the
// AI-structured thesis, confluence matrix, and risk protocol written by
// the narrative synthesis step. Falls through with a TypeError (non-ok
// response) so callers can gracefully degrade to the local mapper.

export async function fetchSignalDetail(orderId: number): Promise<SignalDetail> {
  const res = await fetch(`${apiBaseUrl()}/orders/${orderId}/detail`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Signal detail unavailable (${res.status})`);
  return res.json() as Promise<SignalDetail>;
}

/** GET /executions/me — requires Clerk session token */
export async function getMyExecutions(token: string): Promise<TradeExecution[]> {
  const res = await fetch(`${apiBaseUrl()}/executions/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}
