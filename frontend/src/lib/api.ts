import type {
  TradeOrder,
  TradeExecution,
  ExecutionSummary,
  ValidatedSignal,
  OrderStats,
  SignalStats,
  PriceBar,
  PaginatedResponse,
  BatchPerformance,
  SignalDetail,
  MarketQuote,
  PipelineHealth,
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
  status?: string;
  ticker?: string;
  date_range?: "7d" | "30d" | "90d" | "all";
  page?: number;
  per_page?: number;
}): Promise<PaginatedResponse<TradeOrder>> {
  if (USE_MOCK) {
    let items = [...MOCK_ORDERS];
    if (params?.strategy && params.strategy !== "all") {
      items = items.filter((o) => o.strategy_used === params.strategy);
    }
    if (params?.status && params.status !== "all") {
      items = items.filter((o) => o.status === params.status);
    }
    if (params?.ticker) {
      items = items.filter((o) => o.ticker.toUpperCase() === params.ticker?.toUpperCase());
    }
    return { items, total: items.length, page: 1, per_page: 20 };
  }
  const qs = new URLSearchParams();
  if (params?.strategy && params.strategy !== "all") qs.set("strategy", params.strategy);
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.ticker) qs.set("ticker", params.ticker);
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
  catalyst_type?: string;
  min_conviction?: number;
  is_trap?: boolean;
  ticker?: string;
  date_range?: "7d" | "30d" | "90d" | "all";
  page?: number;
  per_page?: number;
}): Promise<PaginatedResponse<ValidatedSignal>> {
  if (USE_MOCK) return { items: MOCK_SIGNALS, total: MOCK_SIGNALS.length, page: 1, per_page: 20 };
  const qs = new URLSearchParams();
  if (params?.catalyst_type && params.catalyst_type !== "all") qs.set("catalyst_type", params.catalyst_type);
  if (params?.min_conviction !== undefined) qs.set("min_conviction", String(params.min_conviction));
  if (params?.is_trap !== undefined) qs.set("is_trap", String(params.is_trap));
  if (params?.ticker) qs.set("ticker", params.ticker);
  if (params?.date_range && params.date_range !== "all") qs.set("date_range", params.date_range);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  const res = await fetch(`${apiBaseUrl()}/signals?${qs}`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error("Failed to fetch signals");
  return res.json();
}

/** GET /signals/stats — aggregate statistics across validated signals */
export async function getSignalStats(): Promise<SignalStats> {
  const defaultStats: SignalStats = {
    total_signals: 0,
    avg_conviction: 0,
    trap_count: 0,
    clean_count: 0,
    trap_rate_percent: 0,
    high_conviction_count: 0,
    catalyst_breakdown: {},
  };
  if (USE_MOCK) return defaultStats;
  try {
    const res = await fetch(`${apiBaseUrl()}/signals/stats`, { next: { revalidate: 30 } });
    if (!res.ok) return defaultStats;
    return res.json();
  } catch {
    return defaultStats;
  }
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
export async function getMyExecutions(
  token: string,
  params?: {
    status?: string;
    ticker?: string;
    limit?: number;
  }
): Promise<TradeExecution[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.ticker) qs.set("ticker", params.ticker);
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  const url = `${apiBaseUrl()}/executions/me${query ? `?${query}` : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

/** GET /executions/summary — aggregate paper execution stats */
export async function getMyExecutionSummary(token: string): Promise<ExecutionSummary | null> {
  const res = await fetch(`${apiBaseUrl()}/executions/summary`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

/** GET /market/{ticker}/quote — real-time quote metrics */
export async function getQuote(ticker: string): Promise<MarketQuote | null> {
  const res = await fetch(`${apiBaseUrl()}/market/${ticker}/quote`, {
    next: { revalidate: 15 },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Fetch major market benchmark indices concurrently */
export async function getMarketBenchmarks(): Promise<MarketQuote[]> {
  const tickers = ["SPY", "QQQ", "DIA", "IWM"];
  if (USE_MOCK) {
    return tickers.map((t) => ({ ticker: t, price: 100 }));
  }
  try {
    const res = await fetch(`${apiBaseUrl()}/market/overview?symbols=${tickers.join(",")}`, {
      next: { revalidate: 15 },
    });
    if (res.ok) {
      return res.json();
    }
  } catch {
    // Fall back to individual requests
  }
  const quotes = await Promise.all(
    tickers.map(async (t) => {
      try {
        const q = await getQuote(t);
        return q ?? { ticker: t };
      } catch {
        return { ticker: t };
      }
    })
  );
  return quotes;
}

/** GET /settings/alpaca — check if user has active keys stored */
export async function getAlpacaStatus(token: string): Promise<{ has_keys: boolean }> {
  try {
    const res = await fetch(`${apiBaseUrl()}/settings/alpaca`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { has_keys: false };
    return res.json();
  } catch {
    return { has_keys: false };
  }
}

/** POST /settings/alpaca — save and validate Alpaca API keys */
export async function saveAlpacaKeys(
  token: string,
  apiKey: string,
  secretKey: string,
  validateCredentials = true
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${apiBaseUrl()}/settings/alpaca`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        api_key: apiKey,
        secret_key: secretKey,
        validate_credentials: validateCredentials,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to save Alpaca credentials" }));
      return { ok: false, error: err.detail || `Server returned ${res.status}` };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/** DELETE /settings/alpaca — disconnect Alpaca API keys */
export async function deleteAlpacaKeys(token: string): Promise<boolean> {
  const res = await fetch(`${apiBaseUrl()}/settings/alpaca`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

/** GET /market/search?q= — autocomplete tickers */
export async function searchTickers(query: string): Promise<Array<{ ticker: string }>> {
  if (!query || query.trim().length === 0) return [];
  try {
    const res = await fetch(`${apiBaseUrl()}/market/search?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** GET /health/pipeline — fetch end-to-end pipeline health */
export async function getPipelineHealth(): Promise<PipelineHealth | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/health/pipeline`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PipelineHealth;
  } catch {
    return null;
  }
}

/** POST /testing/inject — developer injection of synthetic catalyst signals */
export async function injectSyntheticSignal(params: {
  scenario: "confluence" | "single_tech" | "drop";
  ticker: string;
  price?: number;
  volume?: number;
  relative_volume?: number;
}): Promise<{ success: boolean; detail?: string; events_injected?: number }> {
  try {
    const res = await fetch(`${apiBaseUrl()}/testing/inject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch (err: unknown) {
    return { success: false, detail: err instanceof Error ? err.message : "Network error" };
  }
}


