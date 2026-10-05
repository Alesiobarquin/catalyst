"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavClock } from "./NavClock";
import { PipelineStatus } from "./PipelineStatus";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { PUBLIC_DEMO } from "@/lib/snapshot";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/analytics", label: "Analytics" },
  { href: "/signals", label: "Signals" },
  { href: "/architecture", label: "How It Works" },
  { href: "/settings", label: "Settings" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand-link" aria-label="Catalyst home">
          <span>
            <span className="brand-name">Catalyst</span>
            <span className="brand-subtitle">
              Signal intelligence platform
            </span>
          </span>
        </Link>

        <nav className="site-nav" aria-label="Main navigation">
          {NAV_LINKS.filter(({ href }) => !PUBLIC_DEMO || href !== "/settings").map(({ href, label }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="site-nav-link"
                aria-current={isActive ? "page" : undefined}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="site-header-tools">
          <ThemeSwitcher />
          <span className="nav-clock"><NavClock /></span>
          {PUBLIC_DEMO ? <span className="daily-demo-label">Daily demo</span> : <PipelineStatus />}
        </div>
      </div>
    </header>
  );
}
