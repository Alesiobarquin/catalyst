import type { OrderStats } from "@/types";
import { Activity, Target, TrendingUp, ShieldAlert } from "lucide-react";

interface StatsBarProps {
  stats: OrderStats;
}

export function StatsBar({ stats }: StatsBarProps) {
  const totalOrders = stats.total_orders ?? 0;
  const activeCount = stats.active_count ?? 0;
  const hitTarget = stats.hit_target_count ?? 0;
  const hitStop = stats.hit_stop_count ?? 0;
  const closedTotal = hitTarget + hitStop;
  const winRate = closedTotal > 0
    ? `${((hitTarget / closedTotal) * 100).toFixed(0)}%`
    : "—";
  const averageConviction = totalOrders > 0
    ? `${(stats.avg_conviction ?? 0).toFixed(0)}/100`
    : "—";

  const cards = [
    {
      label:  "Recommendations",
      value:  totalOrders.toString(),
      sub:    `${activeCount} open now`,
      icon:   Activity,
    },
    {
      label:  "Avg. conviction",
      value:  averageConviction,
      sub:    totalOrders > 0 ? `Across ${totalOrders} recommendations` : "No recommendations yet",
      icon:   Target,
    },
    {
      label:  "Modeled win rate",
      value:  winRate,
      sub:    closedTotal > 0
                ? `${hitTarget} of ${closedTotal} stop/target outcomes`
                : "No stop/target outcomes yet",
      icon:   TrendingUp,
    },
    {
      label:  "Stops hit",
      value:  hitStop.toString(),
      sub:    closedTotal > 0 ? `${hitStop} of ${closedTotal} stop/target outcomes` : "No stop/target outcomes yet",
      icon:   ShieldAlert,
    },
  ];

  return (
    <div className="stats-grid">
      {cards.map((card) => (
        <div
          key={card.label}
          className="stat-card"
          style={{ padding: "16px 18px" }}
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
