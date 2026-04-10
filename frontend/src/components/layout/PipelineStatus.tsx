"use client";

import { useEffect, useState } from "react";
import { Radio, AlertCircle } from "lucide-react";
import type { PipelineHealth } from "@/types";

const POLL_MS = 30_000;

export function PipelineStatus() {
  const [data, setData] = useState<PipelineHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`${base}/health/pipeline`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as PipelineHealth;
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const ready = data?.ready === true;
  const degraded = data && !ready && data.database === "ok";
  const dead = !loading && (data === null || data.database === "error");

  const border = dead
    ? "rgba(239,68,68,0.35)"
    : degraded
      ? "rgba(245,158,11,0.35)"
      : "rgba(34,197,94,0.25)";
  const bg = dead
    ? "rgba(239,68,68,0.08)"
    : degraded
      ? "rgba(245,158,11,0.08)"
      : "rgba(34,197,94,0.06)";
  const labelColor = dead ? "var(--color-red)" : degraded ? "var(--color-gold)" : "var(--color-green)";
  const label = loading ? "…" : dead ? "OFFLINE" : ready ? "LIVE" : "DEGRADED";
  const sub = loading
    ? "Checking…"
    : dead
      ? "API unreachable"
      : ready
        ? "Pipeline ready"
        : `DB ${data?.database ?? "?"} · Engine ${data?.engine ?? "?"}`;

  return (
    <div
      title={data ? `DB: ${data.database} · Engine: ${data.engine}` : sub}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 12px",
        borderRadius: 20,
        border: `1px solid ${border}`,
        background: bg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {dead ? (
          <AlertCircle size={12} color="var(--color-red)" />
        ) : (
          <Radio size={12} color={labelColor} className={ready && !loading ? "animate-blink" : undefined} />
        )}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: labelColor,
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </span>
      </div>
      <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
        {sub}
      </span>
    </div>
  );
}
