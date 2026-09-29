import type { Metadata } from "next";
import Link from "next/link";
import { getSignals, getSignalStats } from "@/lib/api";
import { getCatalystLabel } from "@/lib/utils";
import { AlertTriangle, Radio, RotateCcw } from "lucide-react";
import { SignalRow } from "@/components/signals/SignalRow";
import { SignalFilterBar } from "@/components/signals/SignalFilterBar";
import { LiveStreamBanner } from "@/components/signals/LiveStreamBanner";
import { Pagination } from "@/components/ui/Pagination";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signals — Catalyst",
  description:
    "Raw Gemini AI output — validated signals before strategy routing and risk sizing.",
};

const SIGNALS_PER_PAGE = 15;

const TABLE_COLS = [
  { label: "Ticker",    width: "75px"            },
  { label: "Time",      width: "110px"           },
  { label: "Conv.",     width: "75px"            },
  { label: "Catalyst",  width: "210px"           },
  { label: "Rationale", width: "minmax(260px,1fr)" },
  { label: "Sources",   width: "140px"           },
];

type PageProps = {
  searchParams: Promise<{
    page?: string;
    catalyst_type?: string;
    min_conviction?: string;
    is_trap?: string;
    ticker?: string;
    date_range?: "7d" | "30d" | "90d" | "all";
  }>;
};

export default async function SignalsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const minConviction = sp.min_conviction ? parseInt(sp.min_conviction, 10) : undefined;
  const isTrap = sp.is_trap !== undefined ? sp.is_trap === "true" : undefined;
  const catalystType = sp.catalyst_type && sp.catalyst_type !== "all" ? sp.catalyst_type : undefined;
  const ticker = sp.ticker?.trim() ? sp.ticker.trim() : undefined;
  const dateRange = sp.date_range && sp.date_range !== "all" ? sp.date_range : undefined;

  const hasActiveFilters = Boolean(
    catalystType ||
    minConviction !== undefined ||
    isTrap !== undefined ||
    ticker ||
    dateRange
  );

  const [
    {
      items: signals,
      total,
      page: curPage,
      per_page,
    },
    stats,
  ] = await Promise.all([
    getSignals({
      page,
      per_page: SIGNALS_PER_PAGE,
      catalyst_type: catalystType,
      min_conviction: minConviction,
      is_trap: isTrap,
      ticker,
      date_range: dateRange,
    }),
    getSignalStats(),
  ]);

  const paginationQuery: Record<string, string | number | undefined> = {};
  if (sp.catalyst_type) paginationQuery.catalyst_type = sp.catalyst_type;
  if (sp.min_conviction) paginationQuery.min_conviction = sp.min_conviction;
  if (sp.is_trap) paginationQuery.is_trap = sp.is_trap;
  if (sp.ticker) paginationQuery.ticker = sp.ticker;
  if (sp.date_range) paginationQuery.date_range = sp.date_range;

  return (
    <>
      {/* ── Page header ─────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: "#F8FAFC",
            letterSpacing: "-0.01em",
            marginBottom: 4,
            lineHeight: 1.25,
          }}
        >
          Validated signals
        </h1>
        <p style={{ fontSize: 13, color: "#CBD5E1", margin: "0 0 6px" }}>
          Raw Gemini output · Before strategy routing ·{" "}
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              padding: "1px 6px",
              borderRadius: 3,
              background: "#1E293B",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#94A3B8",
            }}
          >
            validated-signals
          </code>{" "}
          Kafka topic
        </p>
        <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>
          {total} total signals {hasActiveFilters && "(filtered)"}
        </p>
      </div>

      {/* ── Live real-time stream status ─────────────────── */}
      <LiveStreamBanner />

      {/* ── Signal Stats KPI Ribbon ──────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div className="stat-card" style={{ padding: "14px 16px" }}>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Total Pipeline Signals
          </span>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "#F8FAFC", margin: "4px 0 2px" }}>
            {stats.total_signals}
          </p>
          <span style={{ fontSize: 11, color: "#64748B" }}>
            {stats.clean_count} actionable
          </span>
        </div>

        <div className="stat-card" style={{ padding: "14px 16px" }}>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Average Conviction
          </span>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "#38BDF8", margin: "4px 0 2px" }}>
            {stats.avg_conviction}/100
          </p>
          <span style={{ fontSize: 11, color: "#64748B" }}>
            Gemini multi-factor
          </span>
        </div>

        <div className="stat-card" style={{ padding: "14px 16px" }}>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            High Conviction (≥80)
          </span>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "#10B981", margin: "4px 0 2px" }}>
            {stats.high_conviction_count}
          </p>
          <span style={{ fontSize: 11, color: "#64748B" }}>
            Eligible for execution
          </span>
        </div>

        <div className="stat-card" style={{ padding: "14px 16px" }}>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Trap Protection
          </span>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "#F59E0B", margin: "4px 0 2px" }}>
            {stats.trap_count}
          </p>
          <span style={{ fontSize: 11, color: "#64748B" }}>
            {stats.trap_rate_percent}% rejected
          </span>
        </div>
      </div>

      {/* ── Filter toolbar ──────────────────────────────── */}
      <SignalFilterBar
        initialCatalyst={sp.catalyst_type ?? "all"}
        initialMinConviction={sp.min_conviction ?? "all"}
        initialTrap={
          sp.is_trap === "true" ? "trap" : sp.is_trap === "false" ? "clean" : "all"
        }
        initialTicker={sp.ticker ?? ""}
        initialDateRange={sp.date_range ?? "all"}
      />

      {/* ── Signals table ───────────────────────────────── */}
      {signals.length === 0 ? (
        <div
          style={{
            padding: "48px 32px",
            textAlign: "center",
            background: "#111827",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 4,
            marginBottom: 24,
          }}
        >
          <Radio
            size={36}
            strokeWidth={1.25}
            style={{ color: "#64748B", marginBottom: 14 }}
            aria-hidden
          />
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#F8FAFC",
              marginBottom: 8,
            }}
          >
            {hasActiveFilters ? "No matching signals found" : "No validated signals yet"}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "#CBD5E1",
              lineHeight: 1.6,
              maxWidth: 420,
              margin: "0 auto",
            }}
          >
            {hasActiveFilters
              ? "No validated signals match your current filter parameters. Try broadening your criteria or reset the filters."
              : "When the gatekeeper accepts events and the pipeline writes to the database, rows appear here. Check that hunters, Kafka, and the gatekeeper are running if you expect traffic."}
          </p>
          {hasActiveFilters && (
            <div style={{ marginTop: 16 }}>
              <Link
                href="/signals"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 500,
                  background: "#1E293B",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#38BDF8",
                  textDecoration: "none",
                }}
              >
                <RotateCcw size={12} />
                Reset all filters
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <div
            className="glass-card"
            style={{ overflowX: "auto", overflowY: "hidden", marginBottom: 24 }}
          >
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: TABLE_COLS.map((c) => c.width).join(" "),
                columnGap: 16,
                minWidth: 900,
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                padding: "10px 20px",
                background: "#0B1121",
                alignItems: "center",
              }}
            >
              {TABLE_COLS.map((col) => (
                <span
                  key={col.label}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#64748B",
                    letterSpacing: "0.02em",
                  }}
                >
                  {col.label}
                </span>
              ))}
            </div>

            {/* Rows */}
            {signals.map((signal, i) => (
              <SignalRow
                key={signal.id}
                signal={signal}
                isLast={i === signals.length - 1}
              />
            ))}
          </div>

          <Pagination
            page={curPage}
            total={total}
            perPage={per_page}
            basePath="/signals"
            query={paginationQuery}
          />
        </>
      )}

      {/* ── Key risks ───────────────────────────────────── */}
      {signals.some((s) => s.key_risks.length > 0) && (
        <div style={{ marginTop: 24 }}>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#F8FAFC",
              marginBottom: 12,
            }}
          >
            Key risks{" "}
            <span style={{ fontSize: 12, color: "#64748B", fontWeight: 400 }}>
              per signal
            </span>
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 12,
            }}
          >
            {signals
              .filter((s) => s.key_risks.length > 0)
              .map((signal) => (
                <div
                  key={signal.id}
                  className="glass-card"
                  style={{ padding: "14px 16px" }}
                >
                  {/* Card header: ticker + catalyst + trap badge */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#F8FAFC",
                      }}
                    >
                      {signal.ticker}
                    </span>
                    <span style={{ fontSize: 11, color: "#64748B" }}>
                      {getCatalystLabel(signal.catalyst_type)}
                    </span>
                    {signal.is_trap && (
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: 3,
                          fontSize: 10,
                          fontWeight: 600,
                          background: "rgba(239,68,68,0.10)",
                          border: "1px solid rgba(239,68,68,0.25)",
                          color: "#EF4444",
                          letterSpacing: "0.04em",
                        }}
                      >
                        TRAP
                      </span>
                    )}
                  </div>

                  {/* Risk list */}
                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {signal.key_risks.map((risk, i) => (
                      <li
                        key={i}
                        style={{
                          display: "flex",
                          gap: 7,
                          fontSize: 12,
                          color: "#CBD5E1",
                          lineHeight: 1.5,
                        }}
                      >
                        <AlertTriangle
                          size={11}
                          color="#EF4444"
                          style={{ flexShrink: 0, marginTop: 2 }}
                          aria-label="Risk"
                        />
                        {risk}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );
}
