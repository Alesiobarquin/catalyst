"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Filter } from "lucide-react";
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

export function SignalFilterBar({
  initialCatalyst = "all",
  initialMinConviction = "all",
  initialTrap = "all",
  initialTicker = "",
}: {
  initialCatalyst?: string;
  initialMinConviction?: string | number;
  initialTrap?: string;
  initialTicker?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [catalyst, setCatalyst] = useState<string>(initialCatalyst);
  const [minConviction, setMinConviction] = useState<string | number>(initialMinConviction);
  const [trapFilter, setTrapFilter] = useState<string>(initialTrap);
  const [tickerQuery, setTickerQuery] = useState<string>(initialTicker);

  function applyFilters(updates: {
    catalyst?: string;
    minConviction?: string | number;
    trap?: string;
    ticker?: string;
  }) {
    const nextCat = updates.catalyst ?? catalyst;
    const nextConv = updates.minConviction ?? minConviction;
    const nextTrap = updates.trap ?? trapFilter;
    const nextTicker = updates.ticker ?? tickerQuery;

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

        {/* Ticker Search Box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters({ ticker: tickerQuery });
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "#1E293B",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 4,
            padding: "4px 8px",
          }}
        >
          <Search size={14} color="#94A3B8" />
          <input
            type="text"
            placeholder="Filter ticker (e.g. NVDA)..."
            value={tickerQuery}
            onChange={(e) => setTickerQuery(e.target.value)}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#F8FAFC",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              width: 170,
            }}
          />
          {tickerQuery && (
            <button
              type="button"
              onClick={() => {
                setTickerQuery("");
                applyFilters({ ticker: "" });
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                display: "flex",
                alignItems: "center",
                color: "#94A3B8",
              }}
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </form>
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

        {/* Clear Filters button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleReset}
            style={{
              marginLeft: "auto",
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
      </div>
    </div>
  );
}
