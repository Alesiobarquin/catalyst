import type { OrderStats } from "@/types";
import { Activity, Target, TrendingUp, ShieldAlert } from "lucide-react";

interface StatsBarProps {
  stats: OrderStats;
}

export function StatsBar({ stats }: StatsBarProps) {
  const closedTotal = stats.hit_target_count + stats.hit_stop_count;
  const winRate = closedTotal > 0
    ? `${((stats.hit_target_count / closedTotal) * 100).toFixed(0)}%`
    : "—";

  const cards = [
    {
      label:  "Active signals",
      value:  stats.total_orders.toString(),
      sub:    `${stats.active_count} currently open`,
      icon:   Activity,
    },
    {
      label:  "Avg confidence",
      value:  `${stats.avg_conviction.toFixed(0)}/100`,
      sub:    "out of 100",
      icon:   Target,
    },
    {
      label:  "Win rate",
      value:  winRate,
      sub:    closedTotal > 0
                ? `${stats.hit_target_count} of ${closedTotal} closed`
                : "No closed positions",
      icon:   TrendingUp,
    },
    {
      label:  "Stop rate",
      value:  stats.hit_stop_count === 0 ? "0" : stats.hit_stop_count.toString(),
      sub:    stats.hit_stop_count === 0 ? "No risk events" : `${stats.hit_stop_count} triggered`,
      icon:   ShieldAlert,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
        marginBottom: 24,
      }}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className="stat-card"
          style={{ padding: "20px 24px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <p
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--color-text-muted)",
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {card.label}
            </p>
            <card.icon
              size={16}
              strokeWidth={1.5}
              color="var(--color-text-muted)"
              style={{ flexShrink: 0 }}
            />
          </div>

          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 28,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              lineHeight: 1,
              margin: "0 0 6px",
              letterSpacing: "-0.01em",
            }}
          >
            {card.value}
          </p>

          <p
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              margin: 0,
            }}
          >
            {card.sub}
          </p>
        </div>
      ))}
    </div>
  );
}
