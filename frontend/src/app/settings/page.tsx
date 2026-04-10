"use client";

import { useAuth } from "@clerk/nextjs";
import { useState, useEffect } from "react";
import Link from "next/link";

function apiBase(): string {
  return typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
    : "";
}

export default function SettingsPage() {
  const { getToken, isLoaded } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [hasKeys, setHasKeys] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${apiBase()}/settings/alpaca`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHasKeys(!!data.has_keys);
      }
    })();
  }, [isLoaded, getToken]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch(`${apiBase()}/settings/alpaca`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ api_key: apiKey, secret_key: secretKey }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || res.statusText);
      }
      setMessage("Saved. Paper orders will use these keys when the executor service is running.");
      setHasKeys(true);
      setApiKey("");
      setSecretKey("");
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

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
        Store your{" "}
        <a
          href="https://app.alpaca.markets/paper/dashboard/overview"
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--color-gold)" }}
        >
          Alpaca paper
        </a>{" "}
        API keys. The executor service places limit orders from engine recommendations when both are running.
        Keys are stored server-side per your Clerk account (encrypt at rest in production).
      </p>

      {hasKeys !== null && (
        <p style={{ fontSize: 13, color: hasKeys ? "var(--color-green)" : "var(--color-text-muted)", marginBottom: 16 }}>
          Status: {hasKeys ? "Keys on file" : "No keys saved yet"}
        </p>
      )}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)" }}>API Key ID</span>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-elevated)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
            }}
            placeholder="PKA…"
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)" }}>Secret Key</span>
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            autoComplete="off"
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-elevated)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
            }}
            placeholder="••••••••"
          />
        </label>
        <button
          type="submit"
          disabled={saving || !apiKey || !secretKey}
          style={{
            padding: "12px 20px",
            borderRadius: 8,
            border: "none",
            fontWeight: 600,
            cursor: saving ? "wait" : "pointer",
            background: "linear-gradient(135deg, #f59e0b, #d97706)",
            color: "#000",
          }}
        >
          {saving ? "Saving…" : "Save keys"}
        </button>
      </form>

      {message && (
        <p style={{ marginTop: 16, fontSize: 13, color: "var(--color-text-secondary)" }}>{message}</p>
      )}
    </div>
  );
}
