"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { PriceBar, SignalDetail, TradeOrder } from "@/types";
import { getPriceHistory } from "@/lib/api";
import { PUBLIC_DEMO } from "@/lib/snapshot";
import { PriceChart } from "@/components/charts/PriceChart";
import { formatPrice, formatPnL, safe } from "@/lib/signalDetailUtils";

// ── Shared style constants ────────────────────────────────────────

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-text-primary)",
  margin: "0 0 16px",
  letterSpacing: 0,
};

const SUB_HEADING: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  margin: "0 0 12px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const SECTION_DIVIDER: React.CSSProperties = {
  height: 1,
  background: "var(--color-bg-row)",
  margin: "0 0 0",
};

function strengthColor(s: "HIGH" | "MODERATE" | "LOW"): string {
  if (s === "HIGH") return "var(--color-profit)";
  if (s === "MODERATE") return "var(--color-warning)";
  return "var(--color-text-muted)";
}

function scenarioColor(type: "best" | "base" | "worst"): string {
  if (type === "best") return "var(--color-profit)";
  if (type === "worst") return "var(--color-loss)";
  return "var(--color-text-secondary)";
}

// ── Props ─────────────────────────────────────────────────────────

interface SignalDetailPanelProps {
  signal: SignalDetail;
  isOpen: boolean;
  onClose: () => void;
  /** Trade order used for price history chart (entry/stop/target overlays). */
  order?: TradeOrder;
  /** True while the server's /orders/{id}/detail fetch is in-flight.
   *  Thesis and confluence sections show skeleton placeholders. */
  isLoading?: boolean;
}

// ── Component ─────────────────────────────────────────────────────

export function SignalDetailPanel({
  signal,
  isOpen,
  onClose,
  order,
  isLoading = false,
}: SignalDetailPanelProps) {
  const [rawFactorsOpen, setRawFactorsOpen] = useState(false);
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [historyStatus, setHistoryStatus] = useState<
    "idle" | "loading" | "live" | "synthetic"
  >("idle");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // ESC key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Scroll lock on body
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("panel-open");
      document.body.style.overflow = "hidden";
    } else {
      document.body.classList.remove("panel-open");
      document.body.style.overflow = "";
    }
    return () => {
      document.body.classList.remove("panel-open");
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Focus close button on open
  useEffect(() => {
    if (isOpen) {
      // Defer one frame so the animation has started
      const id = requestAnimationFrame(() => closeButtonRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen]);

  // Focus trap
  useEffect(() => {
    if (!isOpen) return;
    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !order) return;

    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setHistoryStatus("loading");
    });
    getPriceHistory(order.ticker, order.timestamp_utc)
      .then((data) => {
        if (cancelled) return;
        setBars(data.length > 0 ? data : []);
        setHistoryStatus(data.length > 0 ? "live" : "synthetic");
      })
      .catch(() => {
        if (!cancelled) setHistoryStatus("synthetic");
      });

    return () => {
      cancelled = true;
      setBars([]);
      setHistoryStatus("idle");
    };
  }, [isOpen, order]);

  // Portal target is only available in a browser environment.
  if (typeof document === "undefined") return null;

  const pnlColor =
    signal.pnlPercent != null && signal.pnlPercent < 0 ? "var(--color-loss)" : "var(--color-profit)";
  const statusColor = signal.status === "Stopped" ? "var(--color-loss)" : "var(--color-profit)";

  const panel = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Backdrop ─────────────────────────────── */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            aria-hidden="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "var(--color-scrim)",
              zIndex: 99,
            }}
          />

          {/* ── Panel ────────────────────────────────── */}
          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`panel-title-${signal.ticker}`}
            aria-hidden={isOpen ? "false" : "true"}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%", transition: { duration: 0.15 } }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "fixed",
              right: 0,
              top: "7.5vh",
              width: "min(640px, 90vw)",
              height: "85vh",
              background: "var(--color-bg-page)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              boxShadow: "0 25px 50px -12px var(--color-scrim)",
              zIndex: 100,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* ════════════════════════════════════════════
                SECTION 1 — SIGNAL HEADER (sticky)
            ════════════════════════════════════════════ */}
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 10,
                background: "var(--color-bg-page)",
                padding: "20px 24px 16px",
                borderBottom: "1px solid var(--color-border-subtle)",
              }}
            >
              {/* Row 1: ticker + close button */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <h1
                  id={`panel-title-${signal.ticker}`}
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                    margin: 0,
                    letterSpacing: "0.01em",
                    lineHeight: 1,
                  }}
                >
                  {safe(signal.ticker)}
                </h1>
                <button
                  className="panel-close-button"
                  ref={closeButtonRef}
                  onClick={onClose}
                  aria-label="Close panel"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 0",
                  }}
                >
                  <X size={16} strokeWidth={1.5} />
                  Close
                </button>
              </div>

              {/* Row 2: exchange · sector + status */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {safe(signal.exchange)}&nbsp;·&nbsp;{safe(signal.sector)}
                </span>
                <span
                  style={{ fontSize: 12, fontWeight: 500, color: statusColor }}
                >
                  {safe(signal.status)}
                </span>
              </div>

              {/* Row 3: action badge + strategy + conviction + P&L */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                >
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 3,
                      fontSize: 11,
                      fontWeight: 500,
                      background: "var(--color-bg-row)",
                      border: "1px solid var(--color-border-subtle)",
                      color: "var(--color-text-secondary)",
                      letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {safe(signal.action)}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    {safe(signal.strategy)}
                    {signal.strategyDescription
                      ? ` · ${signal.strategyDescription}`
                      : ""}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    Conviction&nbsp;
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {safe(signal.convictionScore)}/{safe(signal.convictionMax)}
                    </span>
                    &nbsp;
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                      {safe(signal.convictionLabel)}
                    </span>
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 18,
                    fontWeight: 600,
                    color: pnlColor,
                  }}
                >
                  {formatPnL(signal.pnlPercent)}
                </span>
              </div>

              {/* Row 4: entry / stop / target boxes */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {[
                  {
                    label: "Entry",
                    value: formatPrice(signal.entryPrice),
                    color: "var(--color-text-primary)",
                  },
                  {
                    label: "Stop loss",
                    value: formatPrice(signal.stopLoss),
                    color: "var(--color-warning)",
                  },
                  {
                    label: "Target",
                    value: formatPrice(signal.targetPrice),
                    color: "var(--color-profit)",
                  },
                ].map((p) => (
                  <div
                    key={p.label}
                    style={{
                      flex: 1,
                      background: "var(--color-bg-card)",
                      border: "1px solid var(--color-border-subtle)",
                      borderRadius: 3,
                      padding: "10px 12px",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: "var(--color-text-muted)",
                        marginBottom: 4,
                        letterSpacing: "0.02em",
                        margin: "0 0 4px",
                      }}
                    >
                      {p.label}
                    </p>
                    <p
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 15,
                        fontWeight: 600,
                        color: p.color,
                        margin: 0,
                      }}
                    >
                      {p.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Row 5: R:R · size · horizon · age */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  R:R&nbsp;
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {safe(signal.riskReward)}
                  </span>
                </span>
                <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                  ·
                </span>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Size&nbsp;
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {safe(signal.positionSize)}
                  </span>
                </span>
                <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                  ·
                </span>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Horizon&nbsp;
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                    {safe(signal.timeHorizon)}
                  </span>
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                  }}
                >
                  {safe(signal.age)}
                </span>
              </div>
            </div>

            {/* ── Scrollable body ───────────────────── */}
            <div style={{ flex: 1, padding: "0 24px 32px" }}>

              {/* Loading indicator — visible while server fetch is in-flight */}
              {isLoading && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--color-border-subtle)",
                    marginBottom: -1,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--color-link)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    Fetching pipeline analysis…
                  </span>
                </div>
              )}

              {/* ════════════════════════════════════════════
                  SECTION 2 — PRICE ACTION
              ════════════════════════════════════════════ */}
              <section
                style={{
                  padding: "24px 0",
                  borderBottom: "1px solid var(--color-border-subtle)",
                }}
              >
                <h2 style={SECTION_TITLE}>Price action</h2>
                {order ? (
                  historyStatus === "loading" ? (
                    <div
                      style={{
                        height: 280,
                        background: "var(--color-bg-page)",
                        border: "1px solid var(--color-border-subtle)",
                        borderRadius: 3,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                        Loading price history…
                      </span>
                    </div>
                  ) : PUBLIC_DEMO && bars.length === 0 ? (
                    <p style={{ color: "var(--color-text-muted)", fontSize: 13, padding: 24 }}>Price history was unavailable for this published run.</p>
                  ) : (
                    <PriceChart
                      order={order}
                      bars={bars}
                      height={280}
                      dataSource={historyStatus === "live" ? "live" : "synthetic"}
                    />
                  )
                ) : (
                  <div
                    style={{
                      height: 280,
                      background: "var(--color-bg-page)",
                      border: "1px solid var(--color-border-subtle)",
                      borderRadius: 3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                      Price chart unavailable
                    </span>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    marginTop: 10,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 15,
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {signal.currentPrice != null
                      ? formatPrice(signal.currentPrice)
                      : "—"}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 14,
                      fontWeight: 500,
                      color: pnlColor,
                    }}
                  >
                    {formatPnL(signal.pnlPercent)}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {safe(signal.age)}
                  </span>
                </div>
              </section>

              {/* ════════════════════════════════════════════
                  SECTION 3 — SIGNAL CONFLUENCE
              ════════════════════════════════════════════ */}
              <section
                style={{
                  padding: "24px 0",
                  borderBottom: "1px solid var(--color-border-subtle)",
                }}
              >
                <h2 style={SECTION_TITLE}>Signal confluence</h2>
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      minWidth: 360,
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid var(--color-border)",
                        }}
                      >
                        {["Source", "Strength", "Data"].map((h) => (
                          <th
                            key={h}
                            style={{
                              fontSize: 11,
                              fontWeight: 500,
                              color: "var(--color-text-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              textAlign: "left",
                              padding: "0 20px 10px 0",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(signal.confluence?.factors ?? []).map((f, i) => (
                        <tr
                          key={i}
                          className="factor-row"
                          style={{
                            borderBottom:
                              i < (signal.confluence.factors.length - 1)
                                ? "1px solid var(--color-border)"
                                : "none",
                          }}
                        >
                          <td
                            style={{
                              padding: "10px 20px 10px 0",
                              fontSize: 13,
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            {safe(f.source)}
                          </td>
                          <td
                            style={{
                              padding: "10px 20px 10px 0",
                              fontSize: 12,
                              fontWeight: 600,
                              color: strengthColor(f.strength),
                            }}
                          >
                            {safe(f.strength)}
                          </td>
                          <td
                            style={{
                              padding: "10px 0",
                              fontFamily: "var(--font-mono)",
                              fontSize: 13,
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            {safe(f.data)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {signal.confluence?.summaryText && (
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--color-text-muted)",
                      margin: "16px 0 0",
                    }}
                  >
                    {signal.confluence.summaryText}
                  </p>
                )}
              </section>

              {/* ════════════════════════════════════════════
                  SECTION 4 — CATALYST THESIS
              ════════════════════════════════════════════ */}
              <section
                style={{
                  padding: "24px 0",
                  borderBottom: "1px solid var(--color-border-subtle)",
                }}
              >
                <h2 style={SECTION_TITLE}>Catalyst thesis</h2>

                {isLoading ? (
                  /* Skeleton bars while server fetch is in-flight */
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {[100, 92, 84, 76, 60].map((w) => (
                      <div
                        key={w}
                        style={{
                          height: 13,
                          width: `${w}%`,
                          borderRadius: 3,
                          background: "var(--color-bg-row)",
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--color-text-secondary)",
                        margin: "0 0 16px",
                      }}
                    >
                      Primary catalyst: {safe(signal.thesis?.primaryCatalyst)}
                    </p>
                    {(signal.thesis?.bodyParagraphs ?? []).map((p, i) => (
                      <p
                        key={i}
                        style={{
                          fontSize: 14,
                          color: "var(--color-text-secondary)",
                          lineHeight: 1.7,
                          margin:
                            i < (signal.thesis.bodyParagraphs.length - 1)
                              ? "0 0 16px"
                              : "0",
                        }}
                      >
                        {p}
                      </p>
                    ))}
                    {(signal.thesis?.counterArguments?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 20 }}>
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--color-text-secondary)",
                            margin: "0 0 10px",
                          }}
                        >
                          Counter-arguments to monitor:
                        </p>
                        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                          {signal.thesis.counterArguments.map((arg, i) => (
                            <li
                              key={i}
                              style={{
                                position: "relative",
                                paddingLeft: 16,
                                fontSize: 14,
                                color: "var(--color-text-muted)",
                                lineHeight: 1.6,
                                marginBottom:
                                  i < signal.thesis.counterArguments.length - 1
                                    ? 8
                                    : 0,
                              }}
                            >
                              <span
                                style={{ position: "absolute", left: 0, top: 0 }}
                              >
                                •
                              </span>
                              {arg}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* ════════════════════════════════════════════
                  SECTION 5 — RISK MANAGEMENT
              ════════════════════════════════════════════ */}
              <section
                style={{
                  padding: "24px 0",
                  borderBottom: "1px solid var(--color-border-subtle)",
                }}
              >
                <h2 style={SECTION_TITLE}>Risk management</h2>

                {/* A: Position parameters */}
                <div style={{ marginBottom: 24 }}>
                  <p style={SUB_HEADING}>Position parameters</p>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {(signal.risk?.parameters ?? []).map((p, i) => (
                      <div
                        key={i}
                        style={{
                          marginBottom:
                            i < (signal.risk?.parameters.length ?? 0) - 1
                              ? 20
                              : 0,
                        }}
                      >
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "var(--color-text-secondary)",
                            margin: "0 0 3px",
                          }}
                        >
                          {safe(p.label)}
                        </p>
                        <p
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 14,
                            fontWeight: 600,
                            color: "var(--color-text-primary)",
                            margin: p.description ? "0 0 3px" : "0",
                          }}
                        >
                          {safe(p.value)}
                        </p>
                        {p.description && (
                          <p
                            style={{
                              fontSize: 13,
                              color: "var(--color-text-muted)",
                              margin: 0,
                              lineHeight: 1.5,
                            }}
                          >
                            {p.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* B: Exit triggers */}
                <div style={{ marginBottom: 24 }}>
                  <p style={SUB_HEADING}>Exit triggers (priority order)</p>
                  <ol
                    style={{
                      margin: 0,
                      padding: 0,
                      listStyle: "none",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {(signal.risk?.exitTriggers ?? []).map((t, i) => (
                      <li
                        key={i}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "var(--color-text-primary)",
                            minWidth: 18,
                            flexShrink: 0,
                          }}
                        >
                          {t.priority}.
                        </span>
                        <span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            {safe(t.condition)}
                          </span>
                          <span
                            style={{ fontSize: 13, color: "var(--color-text-muted)" }}
                          >
                            &nbsp;—&nbsp;{safe(t.action)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* C: Scenario analysis */}
                <div>
                  <p style={SUB_HEADING}>Scenario analysis</p>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      marginBottom: 14,
                    }}
                  >
                    {(signal.risk?.scenarios ?? []).map((s, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: scenarioColor(s.type),
                            minWidth: 80,
                          }}
                        >
                          {safe(s.label)}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 14,
                            fontWeight: 600,
                            color: scenarioColor(s.type),
                          }}
                        >
                          {safe(s.value)}
                        </span>
                        <span
                          style={{
                            marginLeft: "auto",
                            fontSize: 12,
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {safe(s.probability)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--color-text-primary)",
                      margin: "16px 0 0",
                    }}
                  >
                    Expected value: {safe(signal.risk?.expectedValue)}
                  </p>
                </div>
              </section>

              {/* ════════════════════════════════════════════
                  SECTION 6 — PIPELINE DATA
              ════════════════════════════════════════════ */}
              <section
                style={{
                  padding: "24px 0",
                  borderBottom: "1px solid var(--color-border-subtle)",
                }}
              >
                <h2 style={SECTION_TITLE}>Pipeline data</h2>

                {/* Metadata grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px 24px",
                    marginBottom: 20,
                  }}
                >
                  {[
                    { label: "Signal ID", value: safe(signal.pipeline?.signalId) },
                    { label: "Generated", value: safe(signal.generatedAt) },
                    {
                      label: "Engine version",
                      value: safe(signal.pipeline?.engineVersion),
                    },
                  ].map((item) => (
                    <div key={item.label}>
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: "var(--color-text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          margin: "0 0 3px",
                        }}
                      >
                        {item.label}
                      </p>
                      <p
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          color: "var(--color-text-secondary)",
                          margin: 0,
                        }}
                      >
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Timeline table (shown when data is available) */}
                {(signal.pipeline?.timeline?.length ?? 0) > 0 && (
                  <div style={{ marginBottom: 16, overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: 360,
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            borderBottom: "1px solid var(--color-border)",
                          }}
                        >
                          {["Stage", "Time", "Detail"].map((h) => (
                            <th
                              key={h}
                              style={{
                                fontSize: 11,
                                fontWeight: 500,
                                color: "var(--color-text-muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                textAlign: "left",
                                padding: "0 16px 8px 0",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {signal.pipeline.timeline.map((t, i) => (
                          <tr
                            key={i}
                            style={{
                              borderBottom:
                                i < signal.pipeline.timeline.length - 1
                                  ? "1px solid var(--color-border)"
                                  : "none",
                            }}
                          >
                            <td
                              style={{
                                padding: "8px 16px 8px 0",
                                fontSize: 13,
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              {safe(t.stage)}
                            </td>
                            <td
                              style={{
                                padding: "8px 16px 8px 0",
                                fontFamily: "var(--font-mono)",
                                fontSize: 12,
                                color: "var(--color-text-muted)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {safe(t.timestamp)}
                            </td>
                            <td
                              style={{
                                padding: "8px 0",
                                fontFamily: "var(--font-mono)",
                                fontSize: 12,
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              {safe(t.detail)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Collapsible raw factors */}
                <div>
                  <button
                    className="text-action-link"
                    onClick={() => setRawFactorsOpen((v) => !v)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 13,
                      color: "var(--color-link)",
                      padding: 0,
                      marginBottom: rawFactorsOpen ? 8 : 0,
                      display: "block",
                    }}
                  >
                    {rawFactorsOpen ? "Hide raw factors" : "Show raw factors"}
                  </button>
                  {rawFactorsOpen && (
                    <pre
                      style={{
                        background: "var(--color-bg-card)",
                        border: "1px solid var(--color-border-subtle)",
                        borderRadius: 3,
                        padding: "12px 16px",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        color: "var(--color-text-muted)",
                        overflowX: "auto",
                        margin: 0,
                        lineHeight: 1.6,
                      }}
                    >
                      <code>
                        {JSON.stringify(signal.pipeline?.rawFactors ?? {}, null, 2)}
                      </code>
                    </pre>
                  )}
                </div>

              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(panel, document.body);
}
