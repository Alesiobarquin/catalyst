"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
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

  const ready    = data?.ready === true;
  const degraded = data && !ready && data.database === "ok";
  const dead     = !loading && (data === null || data.database === "error");

  const dotColor   = dead ? "#EF4444" : degraded ? "#F59E0B" : "#10B981";
  const labelColor = dead ? "#EF4444" : degraded ? "#F59E0B" : "var(--color-text-muted)";
  const label      = loading ? "…" : dead ? "OFFLINE" : ready ? "LIVE" : "DEGRADED";
  const sub        = loading
    ? "Checking"
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
        padding: "4px 10px",
        borderRadius: 4,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "transparent",
      }}
    >
      {dead ? (
        <AlertCircle size={11} color="#EF4444" />
      ) : (
        /* Static dot — NO animation property */
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: dotColor,
            display: "inline-block",
            flexShrink: 0,
          }}
        />
      )}
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: labelColor,
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "var(--color-text-muted)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {sub}
      </span>
    </div>
  );
}
