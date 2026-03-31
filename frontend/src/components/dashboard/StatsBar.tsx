import type { OrderStats } from "@/types";
import { formatCompact, formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, Activity, Target } from "lucide-react";

interface StatsBarProps {
  stats: OrderStats;
}

export function StatsBar({ stats }: StatsBarProps) {
  const winRate = stats.total_orders > 0
    ? ((stats.hit_target_count / (stats.hit_target_count + stats.hit_stop_count)) * 100).toFixed(0)
    : "—";

  const cards = [
    {
      label:  "Total Signals",
      value:  stats.total_orders.toString(),
      sub:    `${stats.active_count} active`,
      icon:   Activity,
      color:  "var(--color-gold)",
      glow:   "var(--color-gold-glow)",
    },
    {
      label: "Avg Conviction",
      value: `${stats.avg_conviction.toFixed(0)}`,
      sub:   "out of 100",
      icon:  Target,
      color: "var(--color-green)",
      glow:  "var(--color-green-glow)",
    },
    {
      label: "Hit Target",
      value: stats.hit_target_count.toString(),
      sub:   `Win rate ${winRate}%`,
      icon:  TrendingUp,
      color: "var(--color-green)",
      glow:  "var(--color-green-glow)",
    },
    {
      label: "Hit Stop",
      value: stats.hit_stop_count.toString(),
      sub:   `${stats.active_count} unresolved`,
      icon:  TrendingDown,
      color: "var(--color-red)",
      glow:  "var(--color-red-glow)",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 16,
        marginBottom: 24,
      }}
    >
      {cards.map((card, i) => (
        <div
          key={card.label}
          className="glass-card animate-fade-up"
          style={{
            padding: "20px 22px",
            animationDelay: `${i * 60}ms`,
            animationFillMode: "both",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6 }}>
                {card.label.toUpperCase()}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 28,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  lineHeight: 1,
                  marginBottom: 4,
                }}
              >
                {card.value}
              </p>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {card.sub}
              </p>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `color-mix(in srgb, ${card.color} 15%, transparent)`,
                border: `1px solid color-mix(in srgb, ${card.color} 30%, transparent)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <card.icon size={16} color={card.color} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
