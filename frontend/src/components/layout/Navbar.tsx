"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavClock } from "./NavClock";
import { PipelineStatus } from "./PipelineStatus";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { PUBLIC_DEMO } from "@/lib/snapshot";
import { ArrowUpRight } from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/signals", label: "Signals" },
  { href: "/analytics", label: "Outcomes" },
  { href: "/architecture", label: "How it works" },
  { href: "/settings", label: "Settings" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand-link" aria-label="Catalyst home">
          <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M5 7h6l7 9h9M5 16h13M5 25h6l7-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="5" cy="7" r="2" fill="currentColor" /><circle cx="5" cy="16" r="2" fill="currentColor" /><circle cx="5" cy="25" r="2" fill="currentColor" /><circle cx="27" cy="16" r="2" fill="currentColor" />
          </svg>
          <span>
            <span className="brand-name">Catalyst</span>
            <span className="brand-subtitle">
              Market signal research
            </span>
          </span>
        </Link>

        <nav className="site-nav" aria-label="Main navigation">
          <p className="nav-section-label">Research workspace</p>
          {NAV_LINKS.filter(({ href }) => !PUBLIC_DEMO || href !== "/settings").map(({ href, label }, index) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="site-nav-link"
                aria-current={isActive ? "page" : undefined}
              >
                <span className="nav-link-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span>{label}</span>
              </Link>
            );
          })}
          <div className="workspace-context">
            <span className="workspace-context-label">Collection cadence</span>
            <p>{PUBLIC_DEMO ? "Weekdays, 10:00 ET" : "Local pipeline"}</p>
            <span>{PUBLIC_DEMO ? "Published snapshots.\nBrokerage execution disabled." : "API-backed research and diagnostics."}</span>
            <a href="https://github.com/Alesiobarquin/catalyst" target="_blank" rel="noreferrer">Inspect the source <ArrowUpRight size={13} aria-hidden="true" /></a>
          </div>
        </nav>

        <div className="site-header-tools">
          <ThemeSwitcher />
          <a className="header-source" href="https://github.com/Alesiobarquin/catalyst" target="_blank" rel="noreferrer" aria-label="Source on GitHub"><span>Source</span><ArrowUpRight size={16} aria-hidden="true" /></a>
          {!PUBLIC_DEMO && <><span className="nav-clock"><NavClock /></span><PipelineStatus /></>}
        </div>
      </div>
    </header>
  );
}
