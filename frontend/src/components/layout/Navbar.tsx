"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavClock } from "./NavClock";
import { PipelineStatus } from "./PipelineStatus";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { CommandMenu } from "./CommandMenu";
import { PUBLIC_DEMO } from "@/lib/snapshot";
import { ArrowUpRight, Radar, Rows3, ChartNoAxesCombined, Network, Settings2 } from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "Overview", code: "OVW", icon: Radar },
  { href: "/signals", label: "Signals", code: "SIG", icon: Rows3 },
  { href: "/analytics", label: "Outcomes", code: "P&L", icon: ChartNoAxesCombined },
  { href: "/architecture", label: "How it works", code: "SYS", icon: Network },
  { href: "/settings", label: "Settings", code: "CFG", icon: Settings2 },
];

export function Navbar() {
  const pathname = usePathname();
  const currentView = NAV_LINKS.find((view) => view.href === "/" ? pathname === "/" : pathname.startsWith(view.href));

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand-link" aria-label="Catalyst home">
          <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path className="brand-signal-path" d="M5 7h6l7 9h9M5 16h13M5 25h6l7-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="5" cy="7" r="2" fill="currentColor" /><circle cx="5" cy="16" r="2" fill="currentColor" /><circle cx="5" cy="25" r="2" fill="currentColor" /><circle cx="27" cy="16" r="2" fill="currentColor" />
          </svg>
          <span>
            <span className="brand-name">Catalyst</span>
            <span className="brand-subtitle">
              Market signal research
            </span>
          </span>
        </Link>

        <div className="terminal-header-context" aria-hidden="true"><span>CAT</span><span>/</span><strong>{currentView?.code ?? "SYS"}</strong><span className="terminal-header-market">US EQUITIES</span></div>

        <nav className="site-nav" aria-label="Main navigation">
          <div className="nav-workspace-id"><span className="terminal-mode-dot" aria-hidden="true" /><span>{PUBLIC_DEMO ? "SNAPSHOT TERMINAL" : "LOCAL TERMINAL"}</span></div>
          <p className="nav-section-label">Workspace / Functions</p>
          {NAV_LINKS.filter(({ href }) => !PUBLIC_DEMO || href !== "/settings").map(({ href, label, code, icon: Icon }, index) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="site-nav-link"
                aria-current={isActive ? "page" : undefined}
                aria-keyshortcuts={`Alt+${index + 1}`}
                title={`${label} · Alt+${index + 1}`}
              >
                <Icon className="nav-link-icon" size={16} aria-hidden="true" />
                <span>{label}</span>
                <span className="nav-link-code" aria-hidden="true">{code}</span>
                <span className="nav-link-number" aria-hidden="true">{index + 1}</span>
              </Link>
            );
          })}
          <div className="workspace-context">
            <span className="workspace-context-label">Session parameters</span>
            <p>{PUBLIC_DEMO ? "Weekdays, 10:00 ET" : "Local pipeline"}</p>
            <dl className="workspace-session"><div><dt>Universe</dt><dd>US equities</dd></div><div><dt>Delivery</dt><dd>{PUBLIC_DEMO ? "Daily snapshot" : "Connected API"}</dd></div><div><dt>Execution</dt><dd>{PUBLIC_DEMO ? "Disabled" : "Local config"}</dd></div></dl>
            <a href="https://github.com/Alesiobarquin/catalyst" target="_blank" rel="noreferrer">Inspect the source <ArrowUpRight size={13} aria-hidden="true" /></a>
            <p className="workspace-shortcut"><kbd>⌘</kbd><kbd>K</kbd> command menu</p>
          </div>
        </nav>

        <div className="site-header-tools">
          <CommandMenu />
          <ThemeSwitcher />
          <a className="header-source" href="https://github.com/Alesiobarquin/catalyst" target="_blank" rel="noreferrer" aria-label="Source on GitHub"><span>Source</span><ArrowUpRight size={16} aria-hidden="true" /></a>
          {!PUBLIC_DEMO && <><span className="nav-clock"><NavClock /></span><div className="terminal-health"><PipelineStatus /></div></>}
        </div>
      </div>
    </header>
  );
}
