"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, RefreshCw, Volume2, VolumeX, Zap } from "lucide-react";

interface StreamSignalPayload {
  ticker: string;
  catalyst_type?: string;
  conviction_score?: number;
  timestamp_utc?: string;
}

function playSignalChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.12); // A5
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  } catch {
    // Audio blocked or unsupported
  }
}

export function LiveStreamBanner() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [newCount, setNewCount] = useState(0);
  const [latestSignal, setLatestSignal] = useState<StreamSignalPayload | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [autoReload, setAutoReload] = useState(false);

  // Keep refs for event listener callbacks
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const autoReloadRef = useRef(autoReload);
  autoReloadRef.current = autoReload;

  // Initialize preferences from localStorage on mount
  useEffect(() => {
    try {
      const savedSound = localStorage.getItem("catalyst_stream_sound");
      if (savedSound !== null) setSoundEnabled(savedSound === "true");
      const savedReload = localStorage.getItem("catalyst_stream_autoreload");
      if (savedReload !== null) setAutoReload(savedReload === "true");
    } catch {
      // localStorage may be disabled
    }
  }, []);

  function toggleSound() {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("catalyst_stream_sound", String(next));
      } catch {}
      if (next) playSignalChime(); // Audio test confirmation
      return next;
    });
  }

  function toggleAutoReload() {
    setAutoReload((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("catalyst_stream_autoreload", String(next));
      } catch {}
      return next;
    });
  }

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: NodeJS.Timeout | null = null;

    function connect() {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      es = new EventSource(`${apiBase}/signals/stream`);

      es.onopen = () => {
        setStatus("connected");
      };

      es.addEventListener("connected", () => {
        setStatus("connected");
      });

      es.addEventListener("signal", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as StreamSignalPayload;
          setNewCount((prev) => prev + 1);
          setLatestSignal(data);

          if (soundRef.current) {
            playSignalChime();
          }

          if (autoReloadRef.current) {
            startTransition(() => {
              router.refresh();
            });
          }
        } catch {
          // ignore parse errors
        }
      });

      es.onerror = () => {
        setStatus("disconnected");
        es?.close();
        // Auto-reconnect after 5 seconds
        retryTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [router]);

  function handleRefresh() {
    setNewCount(0);
    setLatestSignal(null);
    startTransition(() => {
      router.refresh();
    });
  }

  const statusColor =
    status === "connected"
      ? "#10B981"
      : status === "connecting"
        ? "#F59E0B"
        : "#64748B";

  const statusText =
    status === "connected"
      ? "STREAM LIVE"
      : status === "connecting"
        ? "CONNECTING..."
        : "DISCONNECTED";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 10,
        padding: "8px 14px",
        marginBottom: 16,
        background: "#0F172A",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 4,
        fontSize: 12,
      }}
    >
      {/* Connection Indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            position: "relative",
            display: "inline-flex",
            width: 8,
            height: 8,
          }}
        >
          {status === "connected" && (
            <span
              style={{
                position: "absolute",
                display: "inline-flex",
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                backgroundColor: statusColor,
                opacity: 0.75,
                animation: "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite",
              }}
            />
          )}
          <span
            style={{
              position: "relative",
              display: "inline-flex",
              borderRadius: "50%",
              width: 8,
              height: 8,
              backgroundColor: statusColor,
            }}
          />
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
            color: statusColor,
          }}
        >
          {statusText}
        </span>
        <span style={{ color: "#475569", fontSize: 11 }}>•</span>
        <span style={{ color: "#94A3B8", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
          <Activity size={12} />
          SSE /signals/stream
        </span>
      </div>

      {/* Middle/Right: Signal alert pill or listening state + Preferences */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {newCount > 0 && latestSignal ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(14, 165, 233, 0.12)",
              border: "1px solid rgba(14, 165, 233, 0.35)",
              padding: "3px 10px",
              borderRadius: 4,
            }}
          >
            <span style={{ color: "#38BDF8", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <Zap size={13} />
              {newCount} new signal{newCount > 1 ? "s" : ""}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", color: "#F8FAFC", fontWeight: 700 }}>
              {latestSignal.ticker}
            </span>
            {latestSignal.conviction_score !== undefined && (
              <span style={{ color: "#94A3B8", fontSize: 11 }}>
                {latestSignal.conviction_score}% conv.
              </span>
            )}
            <button
              type="button"
              onClick={handleRefresh}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "#0284C7",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 3,
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <RefreshCw size={11} />
              Load Now
            </button>
          </div>
        ) : (
          <span style={{ color: "#64748B", fontSize: 11, fontFamily: "var(--font-mono)" }}>
            Listening for live engine triggers...
          </span>
        )}

        {/* Action Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Auto Reload Toggle */}
          <button
            type="button"
            onClick={toggleAutoReload}
            title={autoReload ? "Auto-reload on new signal is active" : "Enable auto-reload on new signal"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 8px",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              background: autoReload ? "rgba(16, 185, 129, 0.12)" : "rgba(255, 255, 255, 0.04)",
              border: `1px solid ${autoReload ? "rgba(16, 185, 129, 0.3)" : "rgba(255, 255, 255, 0.08)"}`,
              color: autoReload ? "#34D399" : "#94A3B8",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: autoReload ? "#10B981" : "#64748B",
              }}
            />
            Auto-sync
          </button>

          {/* Sound Alert Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            title={soundEnabled ? "Audio alert is ON (click to mute)" : "Enable audio chime alert"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 4,
              fontSize: 11,
              background: soundEnabled ? "rgba(56, 189, 248, 0.15)" : "rgba(255, 255, 255, 0.04)",
              border: `1px solid ${soundEnabled ? "rgba(56, 189, 248, 0.35)" : "rgba(255, 255, 255, 0.08)"}`,
              color: soundEnabled ? "#38BDF8" : "#64748B",
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
          >
            {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
            <span>{soundEnabled ? "Chime On" : "Chime Off"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
