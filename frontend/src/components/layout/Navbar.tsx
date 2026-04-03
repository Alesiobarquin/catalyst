"use client";

import Link from "next/link";
import { Activity, BarChart3, Zap, Radio } from "lucide-react";

const NAV_LINKS = [
  { href: "/",          label: "Dashboard",  icon: Activity  },
  { href: "/analytics", label: "Analytics",  icon: BarChart3 },
  { href: "/signals",   label: "Signals",    icon: Zap       },
];

export function Navbar() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(8,10,15,0.85)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "0 24px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 12px rgba(245,158,11,0.4)",
            }}
          >
            <Zap size={16} color="#000" fill="#000" />
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              fontSize: 16,
              color: "var(--color-text-primary)",
              letterSpacing: "0.05em",
            }}
          >
            CATALYST
          </span>
        </Link>

        {/* Nav links */}
        <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                textDecoration: "none",
                transition: "color 150ms, background 150ms",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-text-primary)";
                (e.currentTarget as HTMLAnchorElement).style.background = "var(--color-bg-elevated)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-text-secondary)";
                (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
              }}
            >
              <Icon size={14} />
              {label}
            </Link>
          ))}
        </nav>

        {/* Pipeline status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 12px",
            borderRadius: 20,
            border: "1px solid rgba(34,197,94,0.25)",
            background: "rgba(34,197,94,0.06)",
          }}
        >
          <div className="animate-blink" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Radio size={12} color="var(--color-green)" />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-green)", letterSpacing: "0.08em" }}>
              LIVE
            </span>
          </div>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
            Pipeline Active
          </span>
        </div>
      </div>
    </header>
  );
}
