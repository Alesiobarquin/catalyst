import type { Metadata } from "next";
import { getSignals } from "@/lib/api";
import { getCatalystLabel } from "@/lib/utils";
import { AlertTriangle, Radio } from "lucide-react";
import { SignalRow } from "@/components/signals/SignalRow";
import { Pagination } from "@/components/ui/Pagination";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signals — Catalyst",
  description:
    "Raw Gemini AI output — validated signals before strategy routing and risk sizing.",
};

const SIGNALS_PER_PAGE = 15;

const TABLE_COLS = [
  { label: "Ticker",    width: "80px"            },
  { label: "Time",      width: "110px"           },
  { label: "Conv.",     width: "80px"            },
  { label: "Catalyst",  width: "120px"           },
  { label: "Rationale", width: "minmax(220px,1fr)" },
  { label: "Sources",   width: "130px"           },
];

type PageProps = { searchParams: Promise<{ page?: string }> };

export default async function SignalsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const {
    items: signals,
    total,
    page: curPage,
    per_page,
  } = await getSignals({ page, per_page: SIGNALS_PER_PAGE });

  return (
    <>
      {/* ── Page header ─────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
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
          Showing {SIGNALS_PER_PAGE} per page
        </p>
      </div>

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
            No validated signals yet
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
            When the gatekeeper accepts events and the pipeline writes to the
            database, rows appear here. Check that hunters, Kafka, and the
            gatekeeper are running if you expect traffic.
          </p>
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
                minWidth: 760,
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                padding: "10px 20px",
                background: "#0B1121",
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
