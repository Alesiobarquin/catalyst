"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AnalyticsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[Catalyst/analytics]", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "40vh",
        gap: 16,
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: "rgba(239,68,68,0.12)",
          border: "1px solid rgba(239,68,68,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AlertTriangle size={22} color="var(--color-red)" />
      </div>

      <div>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--color-text-primary)",
            marginBottom: 6,
          }}
        >
          Failed to load analytics
        </h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", maxWidth: 380 }}>
          {error.message || "Could not fetch order stats. Check that the API is running."}
        </p>
      </div>

      <button
        onClick={reset}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "8px 18px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.3)",
          color: "var(--color-gold)",
          transition: "background 150ms",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.18)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.1)";
        }}
      >
        <RefreshCw size={13} />
        Try again
      </button>
    </div>
  );
}
