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
          background: "var(--color-loss-bg)",
          border: "1px solid var(--color-loss-border)",
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
        className="button-secondary"
        onClick={reset}
      >
        <RefreshCw size={13} />
        Try again
      </button>
    </div>
  );
}
