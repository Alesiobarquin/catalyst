import type { ValidatedSignal } from "@/types";
import { SignalRow } from "@/components/signals/SignalRow";

const COLUMNS = [
  { label: "Ticker", width: "72px" },
  { label: "Time", width: "92px" },
  { label: "Conviction", width: "64px" },
  { label: "Catalyst", width: "minmax(145px, 190px)" },
  { label: "Rationale", width: "minmax(180px, 1fr)" },
  { label: "Sources", width: "minmax(110px, 130px)" },
];

export function SignalTable({ signals }: { signals: ValidatedSignal[] }) {
  return (
    <div className="glass-card signal-table" role="table" aria-label="Validated signals">
      <div role="rowgroup">
        <div
          className="signal-table-header"
          role="row"
          style={{
            display: "grid",
            gridTemplateColumns: COLUMNS.map((column) => column.width).join(" "),
            columnGap: 16,
            padding: "10px 20px",
            background: "var(--color-bg-page)",
            borderBottom: "1px solid var(--color-border-subtle)",
          }}
        >
          {COLUMNS.map((column) => (
            <span key={column.label} role="columnheader">
              {column.label}
            </span>
          ))}
        </div>
      </div>
      <div role="rowgroup">
        {signals.map((signal, index) => (
          <SignalRow
            key={signal.id}
            signal={signal}
            isLast={index === signals.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
