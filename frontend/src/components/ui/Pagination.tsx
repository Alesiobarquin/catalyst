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
    qs.delete("page");
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <nav
      aria-label="Pagination"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        flexWrap: "wrap",
        marginTop: 28,
        paddingTop: 20,
        borderTop: "1px solid var(--color-border-subtle)",
      }}
    >
      {page <= 1 ? (
        <span aria-disabled="true" style={{ fontSize: 13, color: "var(--color-text-muted)", fontWeight: 600, minHeight: 44, display: "inline-flex", alignItems: "center" }}>
          ← Previous
        </span>
      ) : (
        <Link href={href(prev)} style={{ fontSize: 13, color: "var(--color-link)", textDecoration: "none", fontWeight: 600, minHeight: 44, display: "inline-flex", alignItems: "center" }}>
          ← Previous
        </Link>
      )}
      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)", lineHeight: 1.3 }}>
        <span aria-current="page">Page {page} of {totalPages}</span>
        <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>({total} total)</span>
      </span>
      {page >= totalPages ? (
        <span aria-disabled="true" style={{ fontSize: 13, color: "var(--color-text-muted)", fontWeight: 600, minHeight: 44, display: "inline-flex", alignItems: "center" }}>
          Next →
        </span>
      ) : (
        <Link href={href(next)} style={{ fontSize: 13, color: "var(--color-link)", textDecoration: "none", fontWeight: 600, minHeight: 44, display: "inline-flex", alignItems: "center" }}>
          Next →
        </Link>
      )}
    </nav>
  );
}
