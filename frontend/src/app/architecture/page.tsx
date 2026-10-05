import type { Metadata } from "next";
import { Radar, Filter, Brain, Calculator, Target } from "lucide-react";
import { ExpandableCard } from "@/components/architecture/ExpandableCard";

export const metadata: Metadata = {
  title: "Architecture — Catalyst",
  description: "The engineering behind Catalyst's market signal pipeline.",
};

const SectionHeading = ({ title }: { title: string }) => (
  <h2
    style={{
      fontSize: 18,
      fontWeight: 600,
      color: "var(--color-text-primary)",
      marginBottom: 20,
      marginTop: 48,
      borderBottom: "1px solid var(--color-border-subtle)",
      paddingBottom: 12,
    }}
  >
    {title}
  </h2>
);

export default function ArchitecturePage() {
  return (
    <>
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.01em",
            marginBottom: 4,
            lineHeight: 1.25,
          }}
        >
          How It Works
        </h1>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
          The engineering behind Catalyst&apos;s market signal pipeline
        </p>
      </div>

      <div className="glass-card" style={{ padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, color: "var(--color-link)", marginBottom: 8 }}>Continuous access, daily collection</h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13, lineHeight: 1.7 }}>The public portfolio site runs on private S3 and CloudFront. At 10:00 AM New York time on weekdays, an AWS EC2 worker runs the Docker/Kafka pipeline, exports FastAPI results, and shuts down. The dashboard displays the latest published collection time and source outcomes. Processing capacity describes active runs; it does not imply continuous scraping. No broker execution is enabled. Outcomes use sampled prices and modeled allocations.</p>
      </div>
      {/* Section 1: Hero */}
      <div style={{ marginBottom: 48 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div className="glass-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>
              The Noise Problem
            </h3>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>
              Retail traders are overwhelmed by thousands of disconnected market feeds. Many feeds contain low-liquidity noise or conflicting catalysts.
            </p>
          </div>
          <div className="glass-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>
              The Cost Problem
            </h3>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>
              Sending every raw event to a grounded LLM adds unnecessary token and search costs. Confluence filtering and a persistent daily request cap keep the public demo bounded.
            </p>
          </div>
          <div className="glass-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>
              The Math Problem
            </h3>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>
              LLMs excel at qualitative thesis synthesis but hallucinate on portfolio math — stop-loss calculations, position sizing, and risk management.
            </p>
          </div>
        </div>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6, padding: "0 8px" }}>
          Catalyst solves this with a funnel of increasing cognitive depth. Signals are first triaged via cheap, high-speed deterministic filters (Python + Redis) before advancing to expensive, high-latency qualitative reasoning (Gemini AI), and finally passing to strict capital-risk models (Java).
        </p>
      </div>

      {/* Section 2: Pipeline Visualization */}
      <SectionHeading title="The 5-Stage Pipeline" />
      <div style={{ position: "relative", paddingLeft: 16, paddingRight: 16, maxWidth: 800, margin: "0 auto" }}>
        {/* Stages */}
        <PipelineStage
          icon={<Radar size={20} color="var(--color-link)" />}
          title="1. Ingestion"
          desc="5 autonomous hunters scan Finviz, SEC EDGAR Form 4, BioPharmCatalyst, Barchart options flow, and FMP earnings."
          tech={["Python 3.12", "Playwright", "HTTPX", "BeautifulSoup"]}
        />
        <PipelineConnector />
        <PipelineStage
          icon={<Filter size={20} color="var(--color-category-follower)" />}
          title="2. Confluence Filter"
          desc="Redis Sorted Set sliding window requires ≥2 independent sources within 5 minutes. The public profile disables the single-source technical exception."
          tech={["Redis 7", "Kafka"]}
        />
        <PipelineConnector />
        <PipelineStage
          icon={<Brain size={20} color="var(--color-warning)" />}
          title="3. AI Validation"
          desc="Gemini 3.8 Flash with Google Search grounding synthesizes a structured catalyst thesis, conviction score, trap detection, and entry/exit parameters."
          tech={["Google GenAI SDK"]}
        />
        <PipelineConnector />
        <PipelineStage
          icon={<Calculator size={20} color="var(--color-profit)" />}
          title="4. Quantitative Sizing"
          desc="Java Spring Boot engine classifies market regime (SPY 200 SMA, VIX), calculates Half-Kelly position size capped at 25% allocated capital per recommendation on a $100k book."
          tech={["Java 21", "Spring Boot 3.4"]}
        />
        <PipelineConnector />
        <PipelineStage
          icon={<Target size={20} color="var(--color-loss)" />}
          title="5. Execution & Resolution"
          desc="TimescaleDB persists sized recommendations for FastAPI snapshot export. A daily resolver samples prices for modeled outcomes. The optional local Alpaca executor is disabled in this public deployment."
          tech={["FastAPI", "TimescaleDB", "S3 / CloudFront"]}
        />
      </div>

      {/* Section 3: Architectural Decisions */}
      <SectionHeading title="Architectural Decisions" />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <ExpandableCard title="Why three languages? (Python + Java + TypeScript)">
          Python for rapid scraper engineering and native Google GenAI SDK. Java 21 for deterministic capital-risk math with strict type safety and JPA transactional integrity. TypeScript/Next.js 16 for full-stack type sync with Pydantic models and streaming React Server Components.
        </ExpandableCard>
        <ExpandableCard title="Why Apache Kafka over Redis Pub/Sub?">
          Durable event replay, topic-level partition scaling, and multi-consumer decoupling: Persistence, Java Engine, and Notifier consume <code>validated-signals</code> independently without data loss during service restarts.
        </ExpandableCard>
        <ExpandableCard title="Why Redis Sorted Sets for confluence?">
          Microsecond sliding window pruning via <code>ZREMRANGEBYSCORE</code>. Atomic lock deduplication via <code>SET NX EX</code> prevents race conditions during market-open signal bursts.
        </ExpandableCard>
        <ExpandableCard title="Why Half-Kelly, not Full Kelly?">
          Full Kelly maximizes geometric growth but exhibits extreme drawdown volatility in non-Gaussian market distributions. Half-Kelly retains ~75% of compound growth while cutting variance and max drawdown by ~50%.
        </ExpandableCard>
        <ExpandableCard title="Why scheduled EC2 via EventBridge?">
          EventBridge Scheduler starts the worker at 10:00 AM America/New_York on weekdays. It stops after publication, with boot and scheduler shutdown deadlines. S3 and CloudFront keep the dashboard online. A $10 AWS budget tracks spending; it is an alert threshold, not a hard spending cap.
        </ExpandableCard>
      </div>

      {/* Section 4: Engineering Quality */}
      <SectionHeading title="Engineering Quality & Resilience" />
      <div
        className="glass-card"
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 32, fontWeight: 700, color: "var(--color-profit)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
            511
          </span>
          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>Automated Tests</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)", margin: 0 }}>
          301 Python · 36 Java · 174 Vitest
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
          {[
            "Kafka offset commits on poison-pill payloads",
            "Exponential backoff on HTTP 429 rate limits",
            "Alpaca execution circuit breaker",
            "Gemini model fallback chain",
            "Redis memory TTL protection",
            "Hypertable time-bound query optimization",
            "GitHub Actions 3-job CI matrix"
          ].map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 12,
                padding: "6px 12px",
                background: "var(--color-bg-row)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: 4,
                color: "var(--color-text-secondary)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Section 5: What I Learned */}
      <SectionHeading title="What I Learned" />
      <div style={{ display: "flex", flexDirection: "column", gap: 20, color: "var(--color-text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
        <p>
          <strong style={{ color: "var(--color-text-primary)" }}>Event-driven complexity vs. monolith simplicity</strong> — The overhead of Kafka topics, consumer groups, and offset management is real. But the ability to add the Notifier service as a new consumer of <code>validated-signals</code> without touching a single line of existing code proved the decoupling thesis.
        </p>
        <p>
          <strong style={{ color: "var(--color-text-primary)" }}>Confluence filtering as AI cost control</strong> — The Gatekeeper requires two distinct hunter sources before public signals reach Gemini. A persistent two-request daily cap bounds AI usage even across worker restarts. Published run reports expose observed event counts.
        </p>
        <p>
          <strong style={{ color: "var(--color-text-primary)" }}>Deterministic math belongs in a typed language</strong> — Python is excellent for rapid prototyping, but Half-Kelly position sizing with regime-dependent caps requires the kind of strict numerical type safety that Java&apos;s type system naturally enforces.
        </p>
        <p>
          <strong style={{ color: "var(--color-text-primary)" }}>Closed-loop validation changes everything</strong> — Building the Resolver daemon to track actual trade outcomes (wins, losses, stops, expirations) transformed Catalyst from a signal generator into a system that can measure its own accuracy.
        </p>
      </div>

      {/* Section 6: Tech Stack Grid */}
      <SectionHeading title="Tech Stack" />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 40 }}>
        {[
          "Python 3.12", "Java 21", "TypeScript", "Next.js 16", "React 19",
          "Spring Boot 3.4", "FastAPI", "Apache Kafka", "Redis 7", "TimescaleDB",
          "Google Gemini 2.5", "AWS CDK", "Docker", "Playwright", "Vitest", "JUnit 5", "Pytest"
        ].map((tech) => (
          <div
            key={tech}
            style={{
              padding: "10px 16px",
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--color-text-primary)",
            }}
          >
            {tech}
          </div>
        ))}
      </div>
    </>
  );
}

// Helper components for Pipeline Visualization

function PipelineStage({ icon, title, desc, tech }: { icon: React.ReactNode, title: string, desc: string, tech: string[] }) {
  return (
    <div
      className="glass-card"
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        position: "relative",
        zIndex: 2,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: "var(--color-bg-row)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--color-border-subtle)"
          }}
        >
          {icon}
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>
          {title}
        </h3>
      </div>
      <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>
        {desc}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        {tech.map((t) => (
          <span
            key={t}
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--color-link)",
              background: "var(--color-category-supernova-bg)",
              padding: "4px 8px",
              borderRadius: 3,
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function PipelineConnector() {
  return (
    <div
      style={{
        width: 2,
        height: 32,
        background: "var(--color-bg-row)",
        margin: "0 auto",
      }}
    />
  );
}
