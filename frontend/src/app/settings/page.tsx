"use client";

import Link from "next/link";

export default function SettingsPage() {
  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <p style={{ marginBottom: 8 }}>
        <Link href="/" style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          ← Dashboard
        </Link>
      </p>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--color-text-primary)",
          marginBottom: 8,
        }}
      >
        Alpaca paper trading
      </h1>
      <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 24, lineHeight: 1.6 }}>
        Saving API keys here will return once authentication is enabled. Deploy and stabilize the stack first,
        then we will wire Clerk and per-account key storage again.
      </p>
    </div>
  );
}
