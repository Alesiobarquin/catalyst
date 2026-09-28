"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SettingsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[Catalyst/settings]", error);
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
          Failed to load settings
        </h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", maxWidth: 380 }}>
          {error.message || "Could not retrieve account or key status. Check that the API is running."}
        </p>
      </div>

      <button
        onClick={reset}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          borderRadius: 6,
          background: "var(--color-surface-hover)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        <RefreshCw size={13} />
        Try again
      </button>
    </div>
  );
}
