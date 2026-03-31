// API client — single swap point between mock data and real FastAPI service.
// To enable real API: set USE_MOCK = false and set API_BASE_URL to your FastAPI URL.

import type { TradeOrder, ValidatedSignal, OrderStats, PriceBar, PaginatedResponse } from "@/types";
import { MOCK_ORDERS, MOCK_SIGNALS, MOCK_STATS } from "./mock-data";

const USE_MOCK = true; // flip to false when FastAPI is running
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Trade Orders ──────────────────────────────────────────────────

export async function getOrders(params?: {
  strategy?: string;
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
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  const res = await fetch(`${API_BASE_URL}/orders?${qs}`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error("Failed to fetch orders");
  return res.json();
}

export async function getOrdersByTicker(ticker: string): Promise<TradeOrder[]> {
  if (USE_MOCK) return MOCK_ORDERS.filter((o) => o.ticker === ticker);
  const res = await fetch(`${API_BASE_URL}/orders/${ticker}`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`Failed to fetch orders for ${ticker}`);
  return res.json();
}

export async function getOrderStats(): Promise<OrderStats> {
  if (USE_MOCK) return MOCK_STATS;
  const res = await fetch(`${API_BASE_URL}/orders/stats`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error("Failed to fetch order stats");
  return res.json();
}

// ── Validated Signals ─────────────────────────────────────────────

export async function getSignals(params?: {
  page?: number;
  per_page?: number;
}): Promise<PaginatedResponse<ValidatedSignal>> {
  if (USE_MOCK) return { items: MOCK_SIGNALS, total: MOCK_SIGNALS.length, page: 1, per_page: 20 };
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  const res = await fetch(`${API_BASE_URL}/signals?${qs}`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error("Failed to fetch signals");
  return res.json();
}

// ── Price History ─────────────────────────────────────────────────

export async function getPriceHistory(
  ticker: string,
  fromTimestamp: string
): Promise<PriceBar[]> {
  if (USE_MOCK) {
    // generateMockPriceBars is called client-side in the chart component
    return [];
  }
  const res = await fetch(
    `${API_BASE_URL}/market/${ticker}/history?from=${encodeURIComponent(fromTimestamp)}`,
    { next: { revalidate: 300 } }
  );
  if (!res.ok) throw new Error(`Failed to fetch price history for ${ticker}`);
  return res.json();
}
