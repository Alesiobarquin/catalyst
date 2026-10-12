"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Command, Search, X } from "lucide-react";
import { PUBLIC_DEMO } from "@/lib/snapshot";
import styles from "./CommandMenu.module.css";

const VIEWS = [
  { label: "Overview", code: "OVW", href: "/", description: "Daily scan, hunter reports, and recommendations", keywords: "brief scan research" },
  { label: "Signals", code: "SIG", href: "/signals", description: "Rationale, source agreement, and saved prices", keywords: "archive ticker conviction catalysts" },
  { label: "Outcomes", code: "P&L", href: "/analytics", description: "Modeled returns and the Half-Kelly calculator", keywords: "analytics performance risk sizing" },
  { label: "How it works", code: "SYS", href: "/architecture", description: "Engineering notebook, code, and evidence", keywords: "engineering architecture system pipeline" },
  ...(!PUBLIC_DEMO ? [{ label: "Settings", code: "CFG", href: "/settings", description: "Local pipeline configuration and diagnostics", keywords: "health credentials" }] : []),
];

export function CommandMenu() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const search = query.trim().toLowerCase();
  const views = VIEWS.filter((view) => `${view.label} ${view.code} ${view.keywords}`.toLowerCase().includes(search));
  const ticker = query.trim().toUpperCase();
  const matches = [
    ...views,
    ...(/^[A-Z][A-Z0-9.]{0,9}$/.test(ticker) ? [{ label: `${ticker} · Signal search`, code: "TICKER", href: `/signals?ticker=${encodeURIComponent(ticker)}`, description: "Filter the signal archive by this ticker", keywords: "" }] : []),
  ];
  const active = Math.min(selected, Math.max(0, matches.length - 1));

  function openMenu() {
    setQuery("");
    setSelected(0);
    dialog.current?.showModal();
    input.current?.focus();
  }

  useEffect(() => {
    function handleKeys(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else openMenu();
      }
      const element = event.target;
      const editing = element instanceof HTMLElement && (element.matches("input, textarea, select") || element.isContentEditable);
      if (!editing && !dialog.current?.open && event.altKey && /^Digit[1-5]$/.test(event.code)) {
        const view = VIEWS[Number(event.code.slice(-1)) - 1];
        if (view) { event.preventDefault(); router.push(view.href); }
      }
    }
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [router]);

  function choose(href: string) {
    dialog.current?.close();
    router.push(href);
  }

  return <>
    <button className="terminal-command-trigger" type="button" onClick={openMenu} aria-label="Open command menu" aria-haspopup="dialog" aria-keyshortcuts="Control+k Meta+k">
      <Search size={14} aria-hidden="true" /><span>Find ticker or view</span><kbd><Command size={10} aria-hidden="true" /> K</kbd>
    </button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="command-title" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={styles.surface}>
        <header className={styles.header}><span id="command-title">CAT / COMMAND</span><button type="button" onClick={() => dialog.current?.close()} aria-label="Close command menu"><X size={16} aria-hidden="true" /><kbd>ESC</kbd></button></header>
        <div className={styles.search}><span aria-hidden="true">&gt;</span><input ref={input} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0); }} placeholder="Enter a ticker, view, or command…" aria-label="Find ticker or view" role="combobox" aria-expanded="true" aria-controls="terminal-command-results" aria-autocomplete="list" aria-activedescendant={matches.length ? `terminal-command-${active}` : undefined} onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSelected((active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % (matches.length || 1)); }
          if (event.key === "Enter" && matches[active]) { event.preventDefault(); choose(matches[active].href); }
        }} /></div>
        <p className={styles.label}>{search ? "Matching commands" : "Workspace views"}</p>
        <div id="terminal-command-results" className={styles.results} role="listbox" aria-label="Commands">
          {matches.map((view, index) => <button key={view.href} id={`terminal-command-${index}`} type="button" role="option" aria-selected={index === active} tabIndex={index === active ? 0 : -1} className={styles.option} onMouseMove={() => setSelected(index)} onClick={() => choose(view.href)}><code>{view.code}</code><span><strong>{view.label}</strong><small>{view.description}</small></span><ArrowUpRight size={16} aria-hidden="true" /></button>)}
        </div>
        {matches.length === 0 && <p className={styles.empty} role="status">No matching view. Enter a ticker such as NVDA to search the signal archive.</p>}
        <footer className={styles.footer}><span><kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>↵</kbd> open</span><span><kbd>ALT</kbd> + <kbd>1–4</kbd> jump to view</span></footer>
      </div>
    </dialog>
  </>;
}
