"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SignalsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[Catalyst/signals]", error);
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
          Failed to load signals
        </h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", maxWidth: 380 }}>
          {error.message || "Could not fetch validated signals. Check that the API is running."}
        </p>
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
