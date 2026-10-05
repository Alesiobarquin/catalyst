"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ExpandableCardProps {
  title: string;
  children: React.ReactNode;
}

export function ExpandableCard({ title, children }: ExpandableCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="glass-card"
      style={{
        border: "1px solid var(--color-border-subtle)",
        borderRadius: 4,
        background: "var(--color-bg-card)",
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 20px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text-primary)",
          fontSize: 14,
          fontWeight: 600,
          textAlign: "left",
        }}
      >
        {title}
        {isOpen ? (
          <ChevronUp size={16} color="var(--color-text-muted)" />
        ) : (
          <ChevronDown size={16} color="var(--color-text-muted)" />
        )}
      </button>

      {isOpen && (
        <div
          style={{
            padding: "0 20px 20px",
            fontSize: 13,
            color: "var(--color-text-secondary)",
            lineHeight: 1.6,
            borderTop: "1px solid var(--color-border-subtle)",
            paddingTop: 16,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
