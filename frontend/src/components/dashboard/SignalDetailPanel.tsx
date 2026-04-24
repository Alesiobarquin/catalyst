"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { SignalDetail } from "@/types";
import { formatPrice, formatPnL, safe } from "@/lib/signalDetailUtils";

// ── Shared style constants ────────────────────────────────────────

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#F8FAFC",
  margin: "0 0 16px",
  letterSpacing: 0,
};

const SUB_HEADING: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#E2E8F0",
  margin: "0 0 12px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const SECTION_DIVIDER: React.CSSProperties = {
  height: 1,
  background: "rgba(255,255,255,0.06)",
  margin: "0 0 0",
};

function strengthColor(s: "HIGH" | "MODERATE" | "LOW"): string {
  if (s === "HIGH") return "#10B981";
  if (s === "MODERATE") return "#F59E0B";
  return "#64748B";
}

function scenarioColor(type: "best" | "base" | "worst"): string {
  if (type === "best") return "#10B981";
  if (type === "worst") return "#EF4444";
  return "#CBD5E1";
}

// ── Props ─────────────────────────────────────────────────────────

interface SignalDetailPanelProps {
  signal: SignalDetail;
  isOpen: boolean;
  onClose: () => void;
  /** True while the server's /orders/{id}/detail fetch is in-flight.
   *  Thesis and confluence sections show skeleton placeholders. */
  isLoading?: boolean;
}

// ── Component ─────────────────────────────────────────────────────

export function SignalDetailPanel({
  signal,
  isOpen,
  onClose,
  isLoading = false,
}: SignalDetailPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [rawFactorsOpen, setRawFactorsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Mount check for portal (SSR safety)
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

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

  if (!mounted) return null;

  const pnlColor =
    signal.pnlPercent != null && signal.pnlPercent < 0 ? "#EF4444" : "#10B981";
  const statusColor = signal.status === "Stopped" ? "#EF4444" : "#10B981";

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
              background: "rgba(0,0,0,0.4)",
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
              background: "#0B1121",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 4,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
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
                background: "#0B1121",
                padding: "20px 24px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
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
                    color: "#F8FAFC",
                    margin: 0,
                    letterSpacing: "0.01em",
                    lineHeight: 1,
                  }}
                >
                  {safe(signal.ticker)}
                </h1>
                <button
                  ref={closeButtonRef}
                  onClick={onClose}
                  aria-label="Close panel"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#64748B",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 0",
                    transition: "color 100ms ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "#F8FAFC";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "#64748B";
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
                <span style={{ fontSize: 12, color: "#64748B" }}>
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
                      background: "#1E293B",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "#CBD5E1",
                      letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {safe(signal.action)}
                  </span>
                  <span style={{ fontSize: 12, color: "#64748B" }}>
                    {safe(signal.strategy)}
                    {signal.strategyDescription
                      ? ` · ${signal.strategyDescription}`
                      : ""}
                  </span>
                  <span style={{ fontSize: 12, color: "#64748B" }}>
                    Conviction&nbsp;
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#CBD5E1",
                      }}
                    >
                      {safe(signal.convictionScore)}/{safe(signal.convictionMax)}
                    </span>
                    &nbsp;
                    <span style={{ fontSize: 11, color: "#64748B" }}>
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
                    color: "#F8FAFC",
                  },
                  {
                    label: "Stop loss",
                    value: formatPrice(signal.stopLoss),
                    color: "#F59E0B",
                  },
                  {
                    label: "Target",
                    value: formatPrice(signal.targetPrice),
                    color: "#10B981",
                  },
                ].map((p) => (
                  <div
                    key={p.label}
                    style={{
                      flex: 1,
                      background: "#111827",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 3,
                      padding: "10px 12px",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: "#64748B",
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
                <span style={{ fontSize: 12, color: "#64748B" }}>
                  R:R&nbsp;
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "#94A3B8",
                    }}
                  >
                    {safe(signal.riskReward)}
                  </span>
                </span>
                <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
                  ·
                </span>
                <span style={{ fontSize: 12, color: "#64748B" }}>
                  Size&nbsp;
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "#CBD5E1",
                    }}
                  >
                    {safe(signal.positionSize)}
                  </span>
                </span>
                <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
                  ·
                </span>
                <span style={{ fontSize: 12, color: "#64748B" }}>
                  Horizon&nbsp;
                  <span style={{ fontSize: 12, color: "#CBD5E1" }}>
                    {safe(signal.timeHorizon)}
                  </span>
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    color: "#64748B",
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
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    marginBottom: -1,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#D97706",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, color: "#64748B" }}>
                    Fetching pipeline analysis…
                  </span>
                </div>
              )}

              {/* ════════════════════════════════════════════
                  SECTION 2 — PRICE ACTION (placeholder)
              ════════════════════════════════════════════ */}
              <section
                style={{
                  padding: "24px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <h2 style={SECTION_TITLE}>Price action</h2>
                <div
                  style={{
                    height: 280,
                    background: "#0F172A",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 3,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 13, color: "#64748B" }}>
                    Chart visualization area
                  </span>
                  <span style={{ fontSize: 12, color: "#475569" }}>
                    Integration pending
                  </span>
                </div>
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
                      color: "#F8FAFC",
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
                      color: "#64748B",
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
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
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
                          borderBottom: "1px solid rgba(255,255,255,0.12)",
                        }}
                      >
                        {["Source", "Strength", "Data"].map((h) => (
                          <th
                            key={h}
                            style={{
                              fontSize: 11,
                              fontWeight: 500,
                              color: "#64748B",
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
                          style={{
                            borderBottom:
                              i < (signal.confluence.factors.length - 1)
                                ? "1px solid rgba(255,255,255,0.06)"
                                : "none",
                            transition: "background 80ms ease",
                          }}
                          onMouseEnter={(e) => {
                            (
                              e.currentTarget as HTMLTableRowElement
                            ).style.background = "#1E293B";
                          }}
                          onMouseLeave={(e) => {
                            (
                              e.currentTarget as HTMLTableRowElement
                            ).style.background = "transparent";
                          }}
                        >
                          <td
                            style={{
                              padding: "10px 20px 10px 0",
                              fontSize: 13,
                              color: "#CBD5E1",
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
                              color: "#E2E8F0",
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
                      color: "#94A3B8",
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
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
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
                          background: "#1E293B",
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
                        color: "#E2E8F0",
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
                          color: "#CBD5E1",
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
                            color: "#E2E8F0",
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
                                color: "#94A3B8",
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
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
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
                            color: "#CBD5E1",
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
                            color: "#F8FAFC",
                            margin: p.description ? "0 0 3px" : "0",
                          }}
                        >
                          {safe(p.value)}
                        </p>
                        {p.description && (
                          <p
                            style={{
                              fontSize: 13,
                              color: "#94A3B8",
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
                            color: "#F8FAFC",
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
                              color: "#CBD5E1",
                            }}
                          >
                            {safe(t.condition)}
                          </span>
                          <span
                            style={{ fontSize: 13, color: "#94A3B8" }}
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
                            color: "#94A3B8",
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
                      color: "#F8FAFC",
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
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
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
                          color: "#64748B",
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
                          color: "#E2E8F0",
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
                            borderBottom: "1px solid rgba(255,255,255,0.12)",
                          }}
                        >
                          {["Stage", "Time", "Detail"].map((h) => (
                            <th
                              key={h}
                              style={{
                                fontSize: 11,
                                fontWeight: 500,
                                color: "#64748B",
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
                                  ? "1px solid rgba(255,255,255,0.06)"
                                  : "none",
                            }}
                          >
                            <td
                              style={{
                                padding: "8px 16px 8px 0",
                                fontSize: 13,
                                color: "#CBD5E1",
                              }}
                            >
                              {safe(t.stage)}
                            </td>
                            <td
                              style={{
                                padding: "8px 16px 8px 0",
                                fontFamily: "var(--font-mono)",
                                fontSize: 12,
                                color: "#94A3B8",
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
                                color: "#E2E8F0",
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
                    onClick={() => setRawFactorsOpen((v) => !v)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 13,
                      color: "#0EA5E9",
                      padding: 0,
                      marginBottom: rawFactorsOpen ? 8 : 0,
                      display: "block",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.opacity =
                        "0.72";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.opacity =
                        "1";
                    }}
                  >
                    {rawFactorsOpen ? "Hide raw factors" : "Show raw factors"}
                  </button>
                  {rawFactorsOpen && (
                    <pre
                      style={{
                        background: "#111827",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 3,
                        padding: "12px 16px",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        color: "#94A3B8",
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

                {/* Pipeline action links */}
                <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
                  {["Export raw JSON", "View in pipeline explorer"].map(
                    (label) => (
                      <button
                        key={label}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 13,
                          color: "#0EA5E9",
                          padding: 0,
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.opacity =
                            "0.72";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.opacity =
                            "1";
                        }}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>
              </section>

              {/* ════════════════════════════════════════════
                  SECTION 7 — ACTIONS FOOTER
              ════════════════════════════════════════════ */}
              <section style={{ padding: "24px 0 0" }}>
                {/* Primary action buttons */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 20,
                  }}
                >
                  {["View live chart", "Set price alert", "Export"].map(
                    (label) => (
                      <button
                        key={label}
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 4,
                          padding: "8px 16px",
                          fontSize: 13,
                          fontWeight: 500,
                          color: "#0EA5E9",
                          cursor: "pointer",
                          transition:
                            "background 100ms ease, border-color 100ms ease",
                        }}
                        onMouseEnter={(e) => {
                          const el = e.currentTarget as HTMLButtonElement;
                          el.style.background = "#1E293B";
                          el.style.borderColor = "rgba(255,255,255,0.2)";
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget as HTMLButtonElement;
                          el.style.background = "transparent";
                          el.style.borderColor = "rgba(255,255,255,0.12)";
                        }}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>

                {/* Secondary text links */}
                <div
                  style={{
                    display: "flex",
                    gap: 0,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {["Dismiss signal", "Mark as reviewed", "Report issue"].map(
                    (label, i) => (
                      <span
                        key={label}
                        style={{ display: "flex", alignItems: "center" }}
                      >
                        <button
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 12,
                            color: "#64748B",
                            padding: 0,
                            transition: "color 100ms ease",
                          }}
                          onMouseEnter={(e) => {
                            (
                              e.currentTarget as HTMLButtonElement
                            ).style.color = "#CBD5E1";
                          }}
                          onMouseLeave={(e) => {
                            (
                              e.currentTarget as HTMLButtonElement
                            ).style.color = "#64748B";
                          }}
                        >
                          {label}
                        </button>
                        {i < 2 && (
                          <span
                            style={{
                              color: "#64748B",
                              margin: "0 10px",
                              fontSize: 12,
                            }}
                          >
                            ·
                          </span>
                        )}
                      </span>
                    )
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
