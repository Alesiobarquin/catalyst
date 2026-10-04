"use client";

import { PUBLIC_DEMO } from "@/lib/snapshot";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Filter } from "lucide-react";
import { useFilterStore } from "@/store/filters";
import { TickerSearchInput } from "@/components/ui/TickerSearchInput";
import type { Strategy } from "@/types";

/* Original strategy codenames — do not rename */
const STRATEGIES: Array<{ value: Strategy | "all"; label: string }> = [
  { value: "all",       label: "All"       },
  { value: "Supernova", label: "Supernova" },
  { value: "Scalper",   label: "Scalper"   },
  { value: "Follower",  label: "Follower"  },
  { value: "Drifter",   label: "Drifter"   },
];

const DATE_RANGES: Array<{ value: "7d" | "30d" | "90d" | "all"; label: string }> = [
  { value: "7d",  label: "7D"  },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "All" },
];

const STATUS_OPTIONS: Array<{ value: "all" | "ACTIVE" | "HIT_TARGET" | "HIT_STOP"; label: string }> = [
  { value: "all",        label: "All Status" },
  { value: "ACTIVE",     label: "Active"     },
  { value: "HIT_TARGET", label: "Target Hit" },
  { value: "HIT_STOP",   label: "Stopped"    },
];

type DateRange = "7d" | "30d" | "90d" | "all";

interface FilterBarProps {
  initialStrategy: Strategy | "all";
  initialDateRange: DateRange;
  initialStatus?: string;
  initialTicker?: string;
}

export function FilterBar({
  initialStrategy,
  initialDateRange,
  initialStatus = "all",
  initialTicker = "",
}: FilterBarProps) {
  const {
    strategy,
    dateRange,
    status,
    ticker,
    setStrategy,
    setDateRange,
    setStatus,
    setTicker,
  } = useFilterStore();

  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [tickerInput, setTickerInput] = useState<string>(initialTicker);
  const [prevInitialTicker, setPrevInitialTicker] = useState<string>(initialTicker);
  if (initialTicker !== prevInitialTicker) {
    setPrevInitialTicker(initialTicker);
    setTickerInput(initialTicker);
  }

  useEffect(() => {
    setStrategy(initialStrategy);
    setDateRange(initialDateRange);
    setStatus(initialStatus);
    setTicker(initialTicker);
  }, [initialDateRange, initialStatus, initialStrategy, initialTicker, setDateRange, setStatus, setStrategy, setTicker]);

  function updateQuery(updates: {
    nextStrategy?: Strategy | "all";
    nextDateRange?: DateRange;
    nextStatus?: string;
    nextTicker?: string;
  }) {
    const s = updates.nextStrategy ?? strategy;
    const d = updates.nextDateRange ?? dateRange;
    const st = updates.nextStatus ?? status;
    const tk = updates.nextTicker !== undefined ? updates.nextTicker : ticker;

    const qs = new URLSearchParams(searchParams.toString());
    qs.delete("page");

    if (s === "all") qs.delete("strategy");
    else qs.set("strategy", s);

    if (d === "30d" || d === "all") {
      if (d === "30d") qs.delete("date_range");
      else qs.set("date_range", "all");
    } else {
      qs.set("date_range", d);
    }

    if (!st || st === "all") qs.delete("status");
    else qs.set("status", st);

    if (!tk || !tk.trim()) qs.delete("ticker");
    else qs.set("ticker", tk.trim().toUpperCase());

    const next = qs.toString();
    startTransition(() => {
      router.push(next ? `/?${next}` : "/");
    });
  }

  function handleReset() {
    setStrategy("all");
    setDateRange("30d");
    setStatus("all");
    setTicker("");
    setTickerInput("");
    startTransition(() => {
      router.push("/");
    });
  }

  const hasActiveFilters =
    strategy !== "all" ||
    dateRange !== "30d" ||
    (status && status !== "all") ||
    tickerInput.trim().length > 0;

  function pillStyle(active: boolean, color = "#D97706"): React.CSSProperties {
    return {
      padding: "5px 12px",
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 500,
      cursor: "pointer",
      border: `1px solid ${active ? color : "rgba(255,255,255,0.12)"}`,
      background: active ? color : "transparent",
      color: active ? "#ffffff" : "var(--color-text-secondary)",
      transition: "border-color 100ms ease, background 100ms ease",
    };
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        marginBottom: 20,
        padding: "14px 16px",
        background: "#0F172A",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 6,
      }}
    >
      {/* ── Top row: Strategy & Ticker search ─────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {/* Strategy Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--color-text-muted)",
              marginRight: 4,
            }}
          >
            Strategy
          </span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {STRATEGIES.map((s) => {
              const active = strategy === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setStrategy(s.value);
                    updateQuery({ nextStrategy: s.value });
                  }}
                  style={pillStyle(active)}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ticker Search Box with Autocomplete */}
        <TickerSearchInput
          value={tickerInput}
          onChange={setTickerInput}
          onSubmit={(val) => {
            setTicker(val);
            updateQuery({ nextTicker: val });
          }}
          onClear={() => {
            setTickerInput("");
            setTicker("");
            updateQuery({ nextTicker: "" });
          }}
          placeholder="Search ticker..."
          width={140}
        />
      </div>


      {/* ── Bottom row: Status, Date Range & Reset ───────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
          paddingTop: 8,
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Status Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--color-text-muted)",
              marginRight: 4,
            }}
          >
            Status
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {STATUS_OPTIONS.map((st) => {
              const active = (status || "all") === st.value;
              return (
                <button
                  key={st.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setStatus(st.value);
                    updateQuery({ nextStatus: st.value });
                  }}
                  style={pillStyle(active, "#0EA5E9")}
                >
                  {st.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Range Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--color-text-muted)",
              marginRight: 4,
            }}
          >
            Range
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {DATE_RANGES.map((d) => {
              const active = dateRange === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setDateRange(d.value);
                    updateQuery({ nextDateRange: d.value });
                  }}
                  style={pillStyle(active, "#3B82F6")}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action buttons: Reset & Export CSV */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleReset}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "none",
                border: "none",
                color: "#EF4444",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              <Filter size={12} />
              Reset filters
            </button>
          )}

          {!PUBLIC_DEMO && <a
            href={(() => {
              const exportQs = new URLSearchParams();
              if (strategy && strategy !== "all") exportQs.set("strategy", strategy);
              if (dateRange && dateRange !== "all") exportQs.set("date_range", dateRange);
              if (status && status !== "all") exportQs.set("status", status);
              if (ticker) exportQs.set("ticker", ticker);
              const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
              const qStr = exportQs.toString();
              return `${apiBase}/orders/export/csv${qStr ? `?${qStr}` : ""}`;
            })()}
            download
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.10)",
              borderRadius: 4,
              color: "#94A3B8",
              fontSize: 11,
              fontWeight: 500,
              padding: "4px 8px",
              textDecoration: "none",
              fontFamily: "var(--font-mono)",
            }}
            title="Export filtered orders to CSV"
            aria-label="Export filtered orders as CSV"
          >
            <Download size={12} />
            Export CSV
          </a>}
        </div>
      </div>
    </div>
  );
}
