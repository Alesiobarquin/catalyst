"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart3, Zap, Settings, User } from "lucide-react";
import { NavClock } from "./NavClock";

const NAV_LINKS = [
  { href: "/",          label: "Dashboard",  icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics",  icon: BarChart3       },
  { href: "/signals",   label: "Signals",    icon: Zap             },
  { href: "/settings",  label: "Settings",   icon: Settings        },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "#0B1121",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "0 24px",
          height: 64,
          display: "flex",
          alignItems: "center",
          gap: 32,
        }}
      >
        {/* ── Logo ─────────────────────────────────────────── */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              background: "#D97706",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M8 1L2 8h5l-1 5 6-7H7L8 1z" fill="#fff" />
            </svg>
          </div>
          {/* Text */}
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: 15,
                color: "#D97706",
                letterSpacing: "0.08em",
                lineHeight: 1.15,
              }}
            >
              CATALYST
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--color-text-muted)",
                letterSpacing: "0.04em",
                lineHeight: 1.15,
              }}
            >
              Signal intelligence platform
            </div>
          </div>
        </Link>

        {/* ── Nav links ─────────────────────────────────────── */}
        <nav style={{ display: "flex", alignItems: "stretch", gap: 0, height: "100%", flex: 1 }}>
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  textDecoration: "none",
                  borderBottom: isActive
                    ? "2px solid #0EA5E9"
                    : "2px solid transparent",
                  transition: "color 100ms ease",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-text-secondary)";
                  }
                }}
              >
                <Icon size={14} strokeWidth={1.5} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* ── Right side ────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
          {/* Clock */}
          <NavClock />

          {/* Static live indicator — NO animation */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#10B981",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: "var(--color-text-muted)",
                fontWeight: 600,
                letterSpacing: "0.06em",
              }}
            >
              LIVE
            </span>
          </div>

          {/* User avatar placeholder */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--color-bg-row)",
              border: "1px solid rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <User size={13} color="var(--color-text-muted)" strokeWidth={1.5} />
          </div>
        </div>
      </div>
    </header>
  );
}
