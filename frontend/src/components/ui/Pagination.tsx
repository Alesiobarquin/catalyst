"use client";

import Link from "next/link";

interface PaginationProps {
  page: number;
  total: number;
  perPage: number;
  /** Base path, e.g. "/" or "/signals" */
  basePath: string;
  query?: Record<string, string | number | undefined>;
}

export function Pagination({ page, total, perPage, basePath, query }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;

  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);

  const href = (p: number) => {
    const qs = new URLSearchParams();
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") qs.set(k, String(v));
      }
    }
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        marginTop: 28,
        paddingTop: 20,
        borderTop: "1px solid var(--color-border-subtle)",
      }}
    >
      <Link
        href={href(prev)}
        style={{
          fontSize: 13,
          color: page <= 1 ? "var(--color-text-muted)" : "#0EA5E9",
          pointerEvents: page <= 1 ? "none" : "auto",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        ← Previous
      </Link>
      <span style={{ fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>
        Page {page} of {totalPages}
        <span style={{ color: "var(--color-text-muted)", marginLeft: 8 }}>({total} total)</span>
      </span>
      <Link
        href={href(next)}
        style={{
          fontSize: 13,
          color: page >= totalPages ? "var(--color-text-muted)" : "#0EA5E9",
          pointerEvents: page >= totalPages ? "none" : "auto",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Next →
      </Link>
    </div>
  );
}
