import type { Metadata } from "next";
import { getSignals } from "@/lib/api";
import { getCatalystLabel } from "@/lib/utils";
import { AlertTriangle, Radio } from "lucide-react";
import { SignalRow } from "@/components/signals/SignalRow";
import { Pagination } from "@/components/ui/Pagination";

export const metadata: Metadata = {
  title: "Signals — Catalyst",
  description:
    "Raw Gemini AI output — validated signals before strategy routing and risk sizing.",
};

const SIGNALS_PER_PAGE = 15;

type PageProps = { searchParams: Promise<{ page?: string }> };

export default async function SignalsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const { items: signals, total, page: curPage, per_page } = await getSignals({
    page,
    per_page: SIGNALS_PER_PAGE,
  });

  return (
    <>
      {/* ── Page header ───────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: 4,
          }}
        >
          Validated Signals
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
          Raw Gemini output · Before strategy routing ·{" "}
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              padding: "1px 6px",
              borderRadius: 4,
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
            }}
          >
            validated-signals
          </code>{" "}
          Kafka topic
        </p>
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
          Showing {SIGNALS_PER_PAGE} signals per page.
        </p>
      </div>

      {/* ── Signals table ─────────────────────────────────── */}
      {signals.length === 0 ? (
        <div
          className="glass-card"
          style={{
            padding: "48px 32px",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          <Radio
            size={40}
            strokeWidth={1.25}
            style={{ color: "var(--color-text-muted)", marginBottom: 16 }}
            aria-hidden
          />
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              marginBottom: 8,
            }}
          >
            No validated signals yet
          </h2>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6, maxWidth: 420, margin: "0 auto" }}>
            When the gatekeeper accepts events and the pipeline writes to the database, rows appear here. Check that hunters,
            Kafka, and the gatekeeper are running if you expect traffic.
          </p>
        </div>
      ) : (
        <>
          <div className="glass-card" style={{ overflow: "hidden", marginBottom: 24 }}>
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "80px 110px 80px 120px 1fr 100px",
                gap: 0,
                borderBottom: "1px solid var(--color-border)",
                padding: "10px 20px",
                background: "var(--color-bg-elevated)",
              }}
            >
              {["TICKER", "TIME", "CONV.", "CATALYST", "RATIONALE", "SOURCES"].map(
                (h) => (
                  <span
                    key={h}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--color-text-muted)",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {h}
                  </span>
                )
              )}
            </div>

            {/* Rows — each is a Client Component due to hover handlers */}
            {signals.map((signal, i) => (
              <SignalRow
                key={signal.id}
                signal={signal}
                isLast={i === signals.length - 1}
              />
            ))}
          </div>

          <Pagination page={curPage} total={total} perPage={per_page} basePath="/signals" />
        </>
      )}

      {/* ── Key risks section ─────────────────────────────── */}
      {signals.some((s) => s.key_risks.length > 0) && (
        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              marginBottom: 12,
            }}
          >
            Key Risks{" "}
            <span style={{ fontSize: 13, color: "var(--color-text-muted)", fontWeight: 400 }}>
              (per signal)
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
                  style={{ padding: "16px 18px" }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {signal.ticker}
                    </span>
                    <span
                      style={{ fontSize: 11, color: "var(--color-text-muted)" }}
                    >
                      {getCatalystLabel(signal.catalyst_type)}
                    </span>
                    {signal.is_trap && (
                      <span
                        style={{
                          padding: "2px 7px",
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          background: "rgba(239,68,68,0.12)",
                          border: "1px solid rgba(239,68,68,0.3)",
                          color: "var(--color-red)",
                          letterSpacing: "0.06em",
                        }}
                      >
                        TRAP
                      </span>
                    )}
                  </div>
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
                          gap: 8,
                          fontSize: 12,
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        <AlertTriangle
                          size={11}
                          color="var(--color-red)"
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
