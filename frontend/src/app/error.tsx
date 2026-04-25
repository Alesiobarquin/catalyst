"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[Catalyst]", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "50vh",
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
          Something went wrong
        </h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", maxWidth: 380 }}>
          {error.message || "An unexpected error occurred. The API may be unreachable."}
        </p>
        {error.digest && (
          <p
            style={{
              marginTop: 6,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-muted)",
            }}
          >
            digest: {error.digest}
          </p>
        )}
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
          color: "var(--color-teal)",
          transition: "background 150ms, border-color 150ms",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.18)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(245,158,11,0.5)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,158,11,0.1)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(245,158,11,0.3)";
        }}
      >
        <RefreshCw size={13} />
        Try again
      </button>
    </div>
  );
}
