"use client";

import { useState } from "react";
import styles from "./notebook.module.css";

const nodes = [
  ["01", "INGEST", "Python hunters", "raw-events"],
  ["02", "CONFLUENCE", "Redis · 5 min window", "triage-priority"],
  ["03", "VALIDATE", "Gemini · Search", "validated-signals"],
  ["04", "SIZE", "Java · Half-Kelly", "trade-orders"],
  ["05", "PUBLISH", "TimescaleDB → S3", "snapshot.json"],
];

export function Topology() {
  const [replay, setReplay] = useState(0);
  return (
    <figure className={styles.topology} aria-labelledby="topology-caption">
      <div className={styles.topologyChrome}><span>SYSTEM / TOPOLOGY</span><button type="button" onClick={() => setReplay(replay + 1)}>Replay path <span aria-hidden="true">↻</span></button></div>
      <div className={styles.topologySources}><span className={styles.sourceLabel}>INPUTS</span><span>Finviz</span><span>BioPharmCatalyst</span><span>SEC EDGAR</span><span>Barchart</span><span>FMP</span></div>
      <ol key={replay} className={styles.topologyNodes}>
        {nodes.map(([number, name, runtime, output]) => <li key={number} className={styles.topologyNode}>
          <div className={styles.nodeIdentity}><span>{number}</span><strong>{name}</strong></div>
          <p>{runtime}</p><code>{output}</code>
        </li>)}
      </ol>
      <div className={styles.topologyBranches}><span>PUBLIC PROFILE / Execution off</span><span>Resolver → sampled outcomes</span><span>SPY + VIX → sizing gate</span></div>
      <figcaption id="topology-caption">Architecture illustration. Moving paths indicate stage connections, not live events, measured latency, or a running scan.</figcaption>
    </figure>
  );
}
