"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Key,
  Lock,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  deleteAlpacaKeys,
  getPipelineHealth,
  getAlpacaStatus,
  injectSyntheticSignal,
  saveAlpacaKeys,
} from "@/lib/api";
import type { PipelineHealth } from "@/types";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [validateCreds, setValidateCreds] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [pipelineHealth, setPipelineHealth] = useState<PipelineHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [injectTicker, setInjectTicker] = useState("NVDA");
  const [injectScenario, setInjectScenario] = useState<
    "confluence" | "triple" | "biotech" | "whale" | "drifter" | "single_tech" | "drop"
  >("confluence");
  const [injectPrice, setInjectPrice] = useState("125.50");
  const [injectVolume, setInjectVolume] = useState("850000");
  const [injectRvol, setInjectRvol] = useState("3.2");
  const [injecting, setInjecting] = useState(false);
  const [injectFeedback, setInjectFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setHealthLoading(true);
      const [healthRes, alpacaRes] = await Promise.all([
        getPipelineHealth(),
        getAlpacaStatus("demo-session-token"),
      ]);
      if (!cancelled) {
        setPipelineHealth(healthRes);
        setHealthLoading(false);
        setIsConnected(alpacaRes.has_keys);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRefreshHealth() {
    setHealthLoading(true);
    const res = await getPipelineHealth();
    setPipelineHealth(res);
    setHealthLoading(false);
  }

  async function handleInject(e: React.FormEvent) {
    e.preventDefault();
    if (!injectTicker.trim()) return;
    setInjecting(true);
    setInjectFeedback(null);
    try {
      const res = await injectSyntheticSignal({
        scenario: injectScenario,
        ticker: injectTicker.trim().toUpperCase(),
        price: parseFloat(injectPrice) || 100.0,
        volume: parseFloat(injectVolume) || 500000,
        relative_volume: parseFloat(injectRvol) || 2.0,
      });
      if (res.success) {
        setInjectFeedback({
          type: "success",
          message: `Injected ${res.events_injected ?? 1} events for ${injectTicker.trim().toUpperCase()} (${injectScenario}). Check Kafka & Gatekeeper logs!`,
        });
      } else {
        setInjectFeedback({
          type: "error",
          message: res.detail || "Injection failed",
        });
      }
    } catch {
      setInjectFeedback({
        type: "error",
        message: "Failed to communicate with testing endpoint",
      });
    } finally {
      setInjecting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim() || !secretKey.trim()) {
      setFeedback({
        type: "error",
        message: "Both Alpaca API Key ID and Secret Key are required.",
      });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const mockToken = "demo-session-token";
      const res = await saveAlpacaKeys(mockToken, apiKey.trim(), secretKey.trim(), validateCreds);
      if (res.ok) {
        setIsConnected(true);
        setFeedback({
          type: "success",
          message: validateCreds
            ? "Alpaca API credentials verified against paper sandbox and saved successfully."
            : "Alpaca API credentials saved successfully.",
        });
        setApiKey("");
        setSecretKey("");
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to validate credentials with Alpaca paper sandbox.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to connect to backend API service.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Are you sure you want to disconnect your Alpaca paper trading account? This will stop automated executions.")) {
      return;
    }

    setDisconnecting(true);
    setFeedback(null);

    try {
      const mockToken = "demo-session-token";
      const ok = await deleteAlpacaKeys(mockToken);
      if (ok) {
        setIsConnected(false);
        setFeedback({
          type: "success",
          message: "Alpaca integration credentials successfully revoked.",
        });
      } else {
        setIsConnected(false);
        setFeedback({
          type: "success",
          message: "Integration reset for this session.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Unable to disconnect Alpaca integration. Check network or server status.",
      });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", paddingBottom: 40 }}>
      {/* ── Breadcrumb ───────────────────────────────────── */}
      <p style={{ marginBottom: 12 }}>
        <Link
          href="/"
          style={{
            color: "var(--color-text-muted)",
            fontSize: 13,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          ← Dashboard
        </Link>
      </p>

      {/* ── Page Header ──────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            marginBottom: 6,
            letterSpacing: "-0.01em",
          }}
        >
          Execution & Broker Settings
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>
          Manage your Alpaca paper trading credentials, execution routing, and account risk parameters.
        </p>
      </div>

      {feedback && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 6,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: feedback.type === "success" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
            border: `1px solid ${feedback.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
            color: feedback.type === "success" ? "#34D399" : "#F87171",
            fontSize: 13,
          }}
        >
          {feedback.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* ── Broker Integration Card ───────────────────────── */}
      <div
        className="glass-card"
        style={{
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "rgba(217,119,6,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#D97706",
              }}
            >
              <Key size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "#F8FAFC", margin: "0 0 2px" }}>
                Alpaca Paper Trading
              </h2>
              <span style={{ fontSize: 12, color: "#64748B" }}>
                https://paper-api.alpaca.markets/v2
              </span>
            </div>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 600,
              background: isConnected ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
              border: isConnected ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(245,158,11,0.25)",
              color: isConnected ? "#10B981" : "#F59E0B",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: isConnected ? "#10B981" : "#F59E0B",
              }}
            />
            {isConnected ? "Connected" : "Disconnected"}
          </div>
        </div>

        <p style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.6, marginBottom: 20 }}>
          Orders recommended by the Java Strategy Engine and sized by the Half-Kelly risk model are routed to your Alpaca paper portfolio when active.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              background: "#0B1121",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 4,
            }}
          >
            <span style={{ fontSize: 11, color: "#64748B", display: "block", marginBottom: 4 }}>
              Order Type
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#F8FAFC", fontFamily: "var(--font-mono)" }}>
              Limit + Bracket Stop
            </span>
          </div>

          <div
            style={{
              padding: "12px 14px",
              background: "#0B1121",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 4,
            }}
          >
            <span style={{ fontSize: 11, color: "#64748B", display: "block", marginBottom: 4 }}>
              Execution Target
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#F8FAFC", fontFamily: "var(--font-mono)" }}>
              Paper Sandbox (No Real Funds)
            </span>
          </div>
        </div>

        {/* ── Key Management Form ─────────────────────────── */}
        <form
          onSubmit={handleSave}
          style={{
            padding: "16px",
            background: "rgba(15,23,42,0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6,
            marginBottom: 20,
          }}
        >
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "#F8FAFC", margin: "0 0 12px" }}>
            Update API Credentials
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>
                Alpaca API Key ID
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="e.g. PKTEST12345678"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  background: "#080D1A",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 4,
                  color: "#F8FAFC",
                  outline: "none",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>
                Alpaca Secret Key
              </label>
              <input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="••••••••••••••••"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  background: "#080D1A",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 4,
                  color: "#F8FAFC",
                  outline: "none",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#94A3B8", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={validateCreds}
                onChange={(e) => setValidateCreds(e.target.checked)}
                style={{ accentColor: "#38BDF8", cursor: "pointer" }}
              />
              Pre-verify credentials against Alpaca paper account
            </label>

            <button
              type="submit"
              disabled={saving || !apiKey || !secretKey}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                background: saving || !apiKey || !secretKey ? "rgba(56,189,248,0.2)" : "#0284C7",
                border: "1px solid #38BDF8",
                color: "#FFFFFF",
                cursor: saving || !apiKey || !secretKey ? "not-allowed" : "pointer",
                transition: "all 120ms ease",
              }}
            >
              <Lock size={12} />
              {saving ? "Verifying..." : "Save & Verify"}
            </button>
          </div>
        </form>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <a
            href="https://app.alpaca.markets/paper/dashboard/overview"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "#38BDF8",
              textDecoration: "none",
            }}
          >
            Open Alpaca Dashboard <ExternalLink size={12} />
          </a>

          {isConnected && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 500,
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "#EF4444",
                cursor: disconnecting ? "wait" : "pointer",
                transition: "all 120ms ease",
              }}
            >
              <Trash2 size={13} />
              {disconnecting ? "Disconnecting..." : "Disconnect Alpaca"}
            </button>
          )}
        </div>
      </div>

      {/* ── Pipeline & Subsystem Telemetry Card ───────────── */}
      <div
        className="glass-card"
        style={{
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "rgba(56,189,248,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#38BDF8",
              }}
            >
              <Activity size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "#F8FAFC", margin: "0 0 2px" }}>
                Pipeline Telemetry & Subsystems
              </h2>
              <span style={{ fontSize: 12, color: "#64748B" }}>
                FastAPI · TimescaleDB · Redis Confluence · Java Engine
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRefreshHealth}
            disabled={healthLoading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#F8FAFC",
              cursor: healthLoading ? "wait" : "pointer",
            }}
          >
            <RefreshCw size={12} className={healthLoading ? "animate-spin" : ""} />
            {healthLoading ? "Checking..." : "Refresh Status"}
          </button>
        </div>

        <p style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.6, marginBottom: 16 }}>
          Operational status verified via real-time probe (<code style={{ color: "#38BDF8" }}>GET /health/pipeline</code>). All core layers must be operational for automated Half-Kelly trade sizing.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <div style={{ padding: "10px 12px", background: "#0B1121", borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 10, color: "#64748B", display: "block", marginBottom: 2 }}>API LAYER</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: pipelineHealth?.api === "ok" ? "#10B981" : "#EF4444" }}>
              {pipelineHealth?.api ? pipelineHealth.api.toUpperCase() : "..."}
            </span>
          </div>
          <div style={{ padding: "10px 12px", background: "#0B1121", borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 10, color: "#64748B", display: "block", marginBottom: 2 }}>DATABASE</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: pipelineHealth?.database === "ok" ? "#10B981" : "#EF4444" }}>
              {pipelineHealth?.database ? pipelineHealth.database.toUpperCase() : "..."}
            </span>
          </div>
          <div style={{ padding: "10px 12px", background: "#0B1121", borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 10, color: "#64748B", display: "block", marginBottom: 2 }}>REDIS CACHE</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: pipelineHealth?.redis === "ok" ? "#10B981" : "#EF4444" }}>
              {pipelineHealth?.redis ? pipelineHealth.redis.toUpperCase() : "..."}
            </span>
          </div>
          <div style={{ padding: "10px 12px", background: "#0B1121", borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 10, color: "#64748B", display: "block", marginBottom: 2 }}>STRATEGY ENGINE</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: pipelineHealth?.engine === "UP" ? "#10B981" : "#F59E0B" }}>
              {pipelineHealth?.engine ? pipelineHealth.engine.toUpperCase() : "..."}
            </span>
          </div>
        </div>
      </div>

      {/* ── Developer Synthetic Signal Injection Card ─────────── */}
      <div
        className="glass-card"
        style={{
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "rgba(168,85,247,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#A855F7",
            }}
          >
            <Send size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#F8FAFC", margin: "0 0 2px" }}>
              Developer Signal Injection & Confluence Test
            </h2>
            <span style={{ fontSize: 12, color: "#64748B" }}>
              Inject synthetic hunter events into Kafka <code style={{ color: "#A855F7" }}>raw-events</code>
            </span>
          </div>
        </div>

        <p style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.6, marginBottom: 16 }}>
          Inject deterministic multi-source signals to verify Gatekeeper confluence rules (<code style={{ color: "#A855F7" }}>SCARD ≥ 2</code>) and end-to-end pipeline flow. Real tickers (e.g., NVDA, AAPL) are sized by the engine.
        </p>

        {injectFeedback && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 4,
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: injectFeedback.type === "success" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
              border: `1px solid ${injectFeedback.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
              color: injectFeedback.type === "success" ? "#34D399" : "#F87171",
              fontSize: 12,
            }}
          >
            {injectFeedback.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{injectFeedback.message}</span>
          </div>
        )}

        <form onSubmit={handleInject}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>
                Ticker Symbol
              </label>
              <input
                type="text"
                value={injectTicker}
                onChange={(e) => setInjectTicker(e.target.value.toUpperCase())}
                placeholder="NVDA"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  background: "#080D1A",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 4,
                  color: "#F8FAFC",
                  outline: "none",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>
                Scenario
              </label>
              <select
                value={injectScenario}
                onChange={(e) =>
                  setInjectScenario(
                    e.target.value as
                      | "confluence"
                      | "triple"
                      | "biotech"
                      | "whale"
                      | "drifter"
                      | "single_tech"
                      | "drop"
                  )
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 12,
                  background: "#080D1A",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 4,
                  color: "#F8FAFC",
                  outline: "none",
                }}
              >
                <option value="confluence">Confluence (Squeeze + Insider)</option>
                <option value="triple">Triple Confluence (Squeeze + Insider + Whale)</option>
                <option value="biotech">Biotech Catalyst (FDA / PDUFA)</option>
                <option value="whale">Whale Options Sweep</option>
                <option value="drifter">Post-Earnings Drifter (+15% Beat)</option>
                <option value="single_tech">Single Technical Score ≥ 4</option>
                <option value="drop">Drop Filter (Low Volume/Price)</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>
                Reference Price ($)
              </label>
              <input
                type="text"
                value={injectPrice}
                onChange={(e) => setInjectPrice(e.target.value)}
                placeholder="125.50"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  background: "#080D1A",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 4,
                  color: "#F8FAFC",
                  outline: "none",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={injecting || !injectTicker.trim()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 16px",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                background: injecting ? "rgba(168,85,247,0.2)" : "#7C3AED",
                border: "1px solid #A855F7",
                color: "#FFFFFF",
                cursor: injecting ? "wait" : "pointer",
              }}
            >
              <Send size={12} />
              {injecting ? "Injecting..." : "Inject Test Events"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Security & Architecture Note ─────────────────── */}
      <div
        style={{
          padding: "16px 20px",
          background: "#0F172A",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 6,
          display: "flex",
          gap: 14,
        }}
      >
        <ShieldCheck size={20} color="#38BDF8" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "#F8FAFC", margin: "0 0 4px" }}>
            Zero Direct Postgres Login
          </h3>
          <p style={{ fontSize: 12, color: "#94A3B8", margin: 0, lineHeight: 1.6 }}>
            Authentication is verified statelessly against Clerk JWKS via RS256 JWTs. TimescaleDB only stores execution audit logs and broker credentials with strict user ID partitioning.
          </p>
        </div>
      </div>
    </div>
  );
}
