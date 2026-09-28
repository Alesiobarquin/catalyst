import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "65vh",
        gap: 20,
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: "rgba(56, 189, 248, 0.10)",
          border: "1px solid rgba(56, 189, 248, 0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Compass size={28} color="#38BDF8" />
      </div>

      <div style={{ maxWidth: 440 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 700,
            color: "#38BDF8",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          404 // Route Not Found
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#F8FAFC",
            letterSpacing: "-0.02em",
            marginBottom: 10,
          }}
        >
          Terminal Node Offline
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#94A3B8",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          The requested path does not map to an active signal stream, order journal, or analytics view.
        </p>
      </div>

      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "#1E293B",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          color: "#F8FAFC",
          padding: "9px 18px",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        <ArrowLeft size={14} />
        Return to Dashboard
      </Link>
    </div>
  );
}
