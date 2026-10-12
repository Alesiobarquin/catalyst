import styles from "./ScanFlow.module.css";

const STAGES = [
  { code: "01", label: "Collected", topic: "raw-events", rule: "Five market feeds" },
  { code: "02", label: "Triaged", topic: "triage-priority", rule: "Source agreement" },
  { code: "03", label: "Validated", topic: "validated-signals", rule: "Grounded analysis" },
  { code: "04", label: "Sized", topic: "trade-orders", rule: "Risk & regime" },
];

/** A schematic of the pipeline, with exported counters; never live activity. */
export function ScanFlow({ counts }: { counts: Record<string, number> }) {
  return <div className={styles.flow}>
    <div className={styles.caption}><span>SCAN PATH</span><span>Published counters · path schematic</span></div>
    <dl className={styles.stages} aria-label="Events from this scan">
      {STAGES.map((stage, index) => {
        const value = counts[stage.topic];
        const available = Number.isFinite(value) && value >= 0;
        return <div className={styles.stage} key={stage.topic} style={{ "--stage-delay": `${index * 110}ms` } as React.CSSProperties}>
          <dt><span className={styles.code} aria-hidden="true">{stage.code}</span>{stage.label}</dt>
          <dd className={available ? styles.value : styles.unknown}>{available ? value.toLocaleString("en-US") : "—"}</dd>
          <span className={styles.topic}>{stage.topic}</span>
          <p>{available ? stage.rule : "Count not exported"}</p>
          {index < STAGES.length - 1 && <span className={styles.connector} aria-hidden="true"><span />›</span>}
        </div>;
      })}
    </dl>
    <p className={styles.note}>Stage totals describe this scan; the path does not trace individual events or show live processing.</p>
  </div>;
}
