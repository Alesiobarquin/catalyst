"use client";

import { PUBLIC_DEMO } from "@/lib/snapshot";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Filter } from "lucide-react";
import { TickerSearchInput } from "@/components/ui/TickerSearchInput";
import type { CatalystType } from "@/types";

const CATALYST_OPTIONS: Array<{ value: CatalystType | "all"; label: string }> = [
  { value: "all", label: "All Catalysts" },
  { value: "SUPERNOVA", label: "Supernova" },
  { value: "SCALPER", label: "Scalper" },
  { value: "FOLLOWER", label: "Follower" },
  { value: "DRIFTER", label: "Drifter" },
];

const CONVICTION_OPTIONS: Array<{ value: number | "all"; label: string }> = [
  { value: "all", label: "Any Conviction" },
  { value: 60, label: "60+" },
  { value: 70, label: "70+" },
  { value: 80, label: "80+" },
];

const TRAP_OPTIONS: Array<{ value: "all" | "clean" | "trap"; label: string }> = [
  { value: "all", label: "All Status" },
  { value: "clean", label: "Clean" },
  { value: "trap", label: "Traps Only" },
];

const DATE_RANGES: Array<{ value: "7d" | "30d" | "90d" | "all"; label: string }> = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "All Time" },
];

export function SignalFilterBar({
  initialCatalyst = "all",
  initialMinConviction = "all",
  initialTrap = "all",
  initialTicker = "",
  initialDateRange = "all",
}: {
  initialCatalyst?: string;
  initialMinConviction?: string | number;
  initialTrap?: string;
  initialTicker?: string;
  initialDateRange?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [catalyst, setCatalyst] = useState<string>(initialCatalyst);
  const [minConviction, setMinConviction] = useState<string | number>(initialMinConviction);
  const [trapFilter, setTrapFilter] = useState<string>(initialTrap);
  const [tickerQuery, setTickerQuery] = useState<string>(initialTicker);
  const [dateRange, setDateRange] = useState<string>(initialDateRange);

  function applyFilters(updates: {
    catalyst?: string;
    minConviction?: string | number;
    trap?: string;
    ticker?: string;
    dateRange?: string;
  }) {
    const nextCat = updates.catalyst ?? catalyst;
    const nextConv = updates.minConviction ?? minConviction;
    const nextTrap = updates.trap ?? trapFilter;
    const nextTicker = updates.ticker ?? tickerQuery;
    const nextDate = updates.dateRange ?? dateRange;

    const qs = new URLSearchParams(searchParams.toString());
    qs.delete("page");

    if (nextCat && nextCat !== "all") {
      qs.set("catalyst_type", nextCat);
    } else {
      qs.delete("catalyst_type");
    }

    if (nextConv && nextConv !== "all") {
      qs.set("min_conviction", String(nextConv));
    } else {
      qs.delete("min_conviction");
    }

    if (nextTrap === "clean") {
      qs.set("is_trap", "false");
    } else if (nextTrap === "trap") {
      qs.set("is_trap", "true");
    } else {
      qs.delete("is_trap");
    }

    if (nextTicker.trim()) {
      qs.set("ticker", nextTicker.trim().toUpperCase());
    } else {
      qs.delete("ticker");
    }

    if (nextDate && nextDate !== "all") {
      qs.set("date_range", nextDate);
    } else {
      qs.delete("date_range");
    }

    const qStr = qs.toString();
    startTransition(() => {
      router.push(qStr ? `/signals?${qStr}` : "/signals");
    });
  }

  function handleReset() {
    setCatalyst("all");
    setMinConviction("all");
    setTrapFilter("all");
    setTickerQuery("");
    setDateRange("all");
    startTransition(() => {
      router.push("/signals");
    });
  }

  const hasActiveFilters =
    (catalyst && catalyst !== "all") ||
    (minConviction && minConviction !== "all") ||
    (trapFilter && trapFilter !== "all") ||
    tickerQuery.trim().length > 0;

  function pillStyle(active: boolean): React.CSSProperties {
    return {
      padding: "5px 12px",
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 500,
      cursor: "pointer",
      border: `1px solid ${active ? "#0EA5E9" : "rgba(255,255,255,0.10)"}`,
      background: active ? "rgba(14,165,233,0.15)" : "transparent",
      color: active ? "#38BDF8" : "var(--color-text-secondary)",
      transition: "all 120ms ease",
    };
  }

  return (
    <div
      role="region"
      aria-label="Signal filters"
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {/* Catalyst Pills */}
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
            Catalyst
          </span>
          {CATALYST_OPTIONS.map((opt) => {
            const active = catalyst.toUpperCase() === opt.value.toUpperCase();
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                aria-label={`Filter catalyst: ${opt.label}`}
                style={pillStyle(active)}
                onClick={() => {
                  setCatalyst(opt.value);
                  applyFilters({ catalyst: opt.value });
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Ticker Search Box with Autocomplete */}
        <TickerSearchInput
          value={tickerQuery}
          onChange={setTickerQuery}
          onSubmit={(val) => {
            applyFilters({ ticker: val });
          }}
          onClear={() => {
            setTickerQuery("");
            applyFilters({ ticker: "" });
          }}
          placeholder="Filter ticker (e.g. NVDA)..."
          width={170}
        />
      </div>


      {/* Secondary filter row: Conviction & Trap */}
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
        {/* Min Conviction */}
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
            Conviction
          </span>
          {CONVICTION_OPTIONS.map((opt) => {
            const active = String(minConviction) === String(opt.value);
            return (
              <button
                key={String(opt.value)}
                type="button"
                aria-pressed={active}
                aria-label={`Filter conviction: ${opt.label}`}
                style={pillStyle(active)}
                onClick={() => {
                  setMinConviction(opt.value);
                  applyFilters({ minConviction: opt.value });
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Trap status */}
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
            Trap Flag
          </span>
          {TRAP_OPTIONS.map((opt) => {
            const active = trapFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                aria-label={`Filter trap status: ${opt.label}`}
                style={pillStyle(active)}
                onClick={() => {
                  setTrapFilter(opt.value);
                  applyFilters({ trap: opt.value });
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Date range */}
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
          {DATE_RANGES.map((opt) => {
            const active = dateRange === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                aria-label={`Filter date range: ${opt.label}`}
                style={pillStyle(active)}
                onClick={() => {
                  setDateRange(opt.value);
                  applyFilters({ dateRange: opt.value });
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Action buttons: Reset & Export CSV */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {hasActiveFilters && (
            <button
              type="button"
              aria-label="Reset all active filters"
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
            aria-label="Export filtered signals as CSV"
            href={(() => {
              const exportQs = new URLSearchParams();
              if (catalyst && catalyst !== "all") exportQs.set("catalyst_type", catalyst);
              if (minConviction && minConviction !== "all")
                exportQs.set("min_conviction", String(minConviction));
              if (trapFilter && trapFilter !== "all")
                exportQs.set("is_trap", trapFilter === "clean" ? "false" : "true");
              if (tickerQuery) exportQs.set("ticker", tickerQuery);
              if (dateRange && dateRange !== "all") exportQs.set("date_range", dateRange);
              const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
              const qStr = exportQs.toString();
              return `${apiBase}/signals/export/csv${qStr ? `?${qStr}` : ""}`;
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
            title="Export filtered signals to CSV"
          >
            <Download size={12} />
          </a>}
        </div>
      </div>
    </div>
  );
}
