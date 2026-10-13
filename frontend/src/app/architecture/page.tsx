import type { Metadata } from "next";
import Link from "next/link";
import { Topology } from "./Topology";
import styles from "./notebook.module.css";
import { ExpandableCard } from "@/components/architecture/ExpandableCard";

export const metadata: Metadata = {
  title: "Engineering notebook — Catalyst",
  description: "Implementation decisions, recorded checks, and limits of Catalyst's daily market-signal pipeline.",
};

const repository = "https://github.com/Alesiobarquin/catalyst";
const source = (path: string) => `${repository}/blob/main/${path}`;

const stages = [
  { title: "Collect", topic: "raw-events", description: "Five Python hunters inspect Yahoo Finance short-interest data, SEC filings, pdufa.bio clinical catalysts, Barchart options activity, and FMP earnings. Each bounded sweep reports its elapsed time, delivered events, and provider failures.", path: "hunters/main.py", label: "Hunter orchestrator" },
  { title: "Find confluence", topic: "triage-priority", description: "Redis tracks distinct hunter sources for each ticker in a rolling five-minute window. The public profile requires two sources, plus price, volume, and relative-volume checks.", path: "gatekeeper/gatekeeper.py", label: "Confluence filter" },
  { title: "Validate evidence", topic: "validated-signals", description: "Gemini with Google Search grounding returns a structured thesis, risks, and conviction score. The public profile requires grounding, a score of at least 50, and has no heuristic fallback.", path: "ai_layer/ai_service.py", label: "Analysis consumer" },
  { title: "Size a recommendation", topic: "trade-orders", description: "Java checks SPY against its 200-session average and reads VIX before applying Half-Kelly sizing. The default allocation cap is 25% of the modeled book per recommendation. At VIX ≥30, only Scalper sizing is allowed; at ≥40, sizing halts. Missing or stale regime data halts sizing.", path: "engine/src/main/java/com/catalyst/engine/sizer/KellySizer.java", label: "Sizing implementation" },
  { title: "Publish and observe", topic: "snapshot.json", description: "TimescaleDB stores results. A finite batch exports bounded API responses to S3, then promotes the manifest. A resolver samples later prices to model outcomes; public brokerage execution is disabled.", path: "deploy/batch.sh", label: "Publication sequence" },
];

function Evidence({ links }: { links: Array<[string, string]> }) {
  return <div className="notebook-evidence">{links.map(([label, path]) => <a key={path} href={source(path)}><span className={styles.evidenceType}>{/test|verification/i.test(path) ? "CHECK" : path.startsWith("docs/") ? "DOC" : "SOURCE"}</span>{label} <span aria-hidden="true">↗</span></a>)}</div>;
}

export default function ArchitecturePage() {
  return (
    <article className={`engineering-page ${styles.notebook}`}>
      <header className="page-heading engineering-intro">
        <p className="page-eyebrow">Project notes · Implementation and evidence</p>
        <h1>Engineering notebook</h1>
        <p className="page-description">The engineering behind Catalyst: collecting market events, checking whether sources agree, and publishing bounded research recommendations.</p>
        <div className="notebook-evidence"><a href={repository}>Browse the repository <span aria-hidden="true">↗</span></a><Link href="/">Read the latest scan <span aria-hidden="true">→</span></Link></div>
      </header>
      <div className="engineering-layout">
        <div className="engineering-main">
          <section id="pipeline" className="notebook-section" aria-labelledby="pipeline-heading">
            <header className="notebook-section-heading"><p className="page-eyebrow">01 / Data path</p><h2 id="pipeline-heading">Five stages, one published snapshot</h2></header>
            <p>The public dashboard stays available through S3 and CloudFront. An EC2 worker collects once each weekday at 10:00 AM New York time, runs the pipeline, publishes results, and stops. The local application retains an API-backed dashboard and optional execution services.</p>
            <Topology />
            <ol className="notebook-pipeline">{stages.map((stage, index) => <li className="notebook-stage" key={stage.title}><span className="notebook-stage-number" aria-hidden="true">0{index + 1}</span><div><div className="notebook-stage-heading"><h3>{stage.title}</h3><code>{stage.topic}</code></div><p>{stage.description}</p><code className={styles.sourcePath}>{stage.path}</code><Evidence links={[[stage.label, stage.path]]} /></div></li>)}</ol>
          </section>

          <section id="decisions" className="notebook-section" aria-labelledby="decisions-heading">
            <header className="notebook-section-heading"><p className="page-eyebrow">02 / Design decisions</p><h2 id="decisions-heading">Where the constraints enter</h2></header>
            <p>These choices keep the work separated into observable steps. They also add services, configuration, and failure modes to maintain.</p>
            <div className="notebook-decisions">
              <ExpandableCard title="Why three languages? (Python + Java + TypeScript)"><p>Python handles provider parsing and the Google GenAI SDK. Java owns sizing and regime checks. TypeScript presents API and snapshot data in Next.js. This separates responsibilities, but it also requires maintaining contracts across languages; the frontend types are not generated proof of schema parity.</p><Evidence links={[["Python analysis", "ai_layer/ai_service.py"], ["Java sizing", "engine/src/main/java/com/catalyst/engine/sizer/KellySizer.java"], ["Frontend contracts", "frontend/src/types/index.ts"]]} /></ExpandableCard>
              <ExpandableCard title="Why Apache Kafka over Redis Pub/Sub?"><p>Durable event replay and separate consumer groups let persistence and sizing read the same validated-signals topic independently. Delivery still depends on producer acknowledgments, offset handling, retention, and service configuration. Kafka is additional operational work, not a guarantee that every external event is captured.</p><Evidence links={[["Persistence consumer", "persistence/consumer.py"], ["Batch drain checks", "deploy/batch.sh"]]} /></ExpandableCard>
              <ExpandableCard title="Why Redis Sorted Sets for confluence?"><p>Each source has a timestamp. Expired scores are pruned before counting distinct sources in the five-minute window. An atomic SET NX EX reservation prevents duplicate forwarding; failed dispatch clears it. A compatibility set fallback remains in the implementation.</p><Evidence links={[["Window and reservation", "gatekeeper/gatekeeper.py"], ["Gatekeeper tests", "tests/test_gatekeeper.py"]]} /></ExpandableCard>
              <ExpandableCard title="Why Half-Kelly, not Full Kelly?"><p>Half-Kelly reduces the allocation implied by a probability estimate and reward/risk ratio. Conviction divided by 100 is a probability proxy, not a calibrated win probability. Defaults use a $100,000 book and a 25% per-recommendation allocation cap. There is no aggregate per-ticker exposure limit or implemented 2% loss-risk cap.</p><Evidence links={[["Sizing formula", "engine/src/main/java/com/catalyst/engine/sizer/KellySizer.java"], ["Engine documentation", "docs/ENGINE.md"]]} /></ExpandableCard>
              <ExpandableCard title="Why scheduled EC2 via EventBridge?"><p>A finite worker run limits runtime while static hosting keeps the dashboard available between scans. Normal completion stops the worker; separate shutdown deadlines bound failed runs. The $10/month target is a cost constraint, not a billing cap. The AWS Budget has no email subscription.</p><Evidence links={[["Public infrastructure", "infra/public_demo_stack.py"], ["Operations and cost model", "docs/PUBLIC_DEMO_OPERATIONS.md"]]} /></ExpandableCard>
            </div>
          </section>

          <section id="observations" className="notebook-section" aria-labelledby="observations-heading">
            <header className="notebook-section-heading"><p className="page-eyebrow">03 / Observed failures</p><h2 id="observations-heading">Changes supported by checks</h2></header>
            <div className="notebook-note"><h3>Missing market data must stop sizing</h3><p>Cloud verification found a double-encoded VIX URL returning 404 while SPY succeeded. Passing an already-encoded URI fixed retrieval. An HTTP mock now checks VIX acquisition, the 200-session average, and snapshot freshness. The regime filter halts on unavailable or stale data instead of substituting the latest price for the average.</p><Evidence links={[["Market data implementation", "engine/src/main/java/com/catalyst/engine/service/MarketDataService.java"], ["HTTP regression test", "engine/src/test/java/com/catalyst/engine/service/MarketDataServiceTest.java"], ["Regime tests", "engine/src/test/java/com/catalyst/engine/filter/RegimeFilterTest.java"]]} /></div>
            <div className="notebook-note"><h3>Failed analysis is not a validated signal</h3><p>The public profile disables heuristic fallback and reserves each AI request against a persistent UTC-day budget before network access. A recorded preflight returned a low-conviction response without grounding; enforcement rejected it. That request did not establish an organic validated catalyst.</p><Evidence links={[["Grounding enforcement", "ai_layer/ai_service.py"], ["Persistent request budget", "ai_layer/request_budget.py"], ["Budget regression tests", "tests/test_public_deployment.py"]]} /></div>
            <div className="notebook-note"><h3>A failed publication must preserve the prior dataset</h3><p>The batch uploads an immutable dataset and private backup before promoting the public manifest. A separate status file describes newer attempts. This lets the browser disclose a failed or running attempt while continuing to show the last published results.</p><Evidence links={[["Upload ordering", "deploy/batch.sh"], ["Bounded export", "deploy/export_snapshot.py"], ["Snapshot reader tests", "frontend/src/__tests__/lib/snapshot.test.ts"]]} /></div>
          </section>

          <section id="verification" className="notebook-section" aria-labelledby="verification-heading">
            <header className="notebook-section-heading"><p className="page-eyebrow">04 / Verification and limits</p><h2 id="verification-heading">What the evidence establishes</h2></header>
            <p>The October 11 GitHub release check recorded <strong>566 automated tests</strong>: 342 Python, 36 Java, and 188 Vitest. This terminal redesign passes 191 frontend tests in the combined release candidate. Test counts describe checked behavior; they do not establish throughput or investment performance.</p>
            <div className="scroll-region"><table className="notebook-checks"><caption>Different checks answer different questions</caption><thead><tr><th scope="col">Evidence</th><th scope="col">Scope</th><th scope="col">Limit</th></tr></thead><tbody><tr><th scope="row">Unit and regression tests</th><td>Parsing, filtering, sizing, budget controls, and UI behavior with controlled inputs.</td><td>Do not establish provider availability or prediction quality.</td></tr><tr><th scope="row">Recorded AWS publication</th><td>Worker execution, export, snapshot promotion, and automatic shutdown.</td><td>A successful run does not establish sustained throughput.</td></tr><tr><th scope="row">Modeled outcomes</th><td>Recommendation prices checked against sampled reference prices.</td><td>Daily sampling can miss intraday crossings; these are not broker fills.</td></tr></tbody></table></div>
            <Evidence links={[["Release verification", "docs/verification/2026-10-05-design-refinement.json"], ["Deployment verification", "docs/verification/2026-10-04-deployment.json"], ["Test instructions", "docs/TESTING.md"], ["Price resolver", "resolver/trade_resolver.py"]]} />
            <div className="notebook-note"><h3>Still to establish</h3><p>There is no measured live 50–100 events/minute artifact or demonstrated predictive edge. The public snapshot exposes hunter outcomes and aggregate event counts; exact rejection reasons for individual raw events and original grounding citation URLs are not available in the reviewed signal contract. Zero results alone do not identify which check rejected an event.</p></div>
          </section>
        </div>
        <aside className="engineering-index" aria-label="Notebook contents"><p className="page-eyebrow">In this notebook</p><nav aria-label="Engineering sections"><a href="#pipeline">01 Data path</a><a href="#decisions">02 Design decisions</a><a href="#observations">03 Observed failures</a><a href="#verification">04 Verification and limits</a></nav><p>Public profile</p><ul><li>Weekday collection</li><li>Two-source confluence</li><li>Grounded analysis only</li><li>Modeled recommendations</li><li>Brokerage execution off</li></ul></aside>
      </div>
    </article>
  );
}
