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
      color: "#F8FAFC",
      marginBottom: 20,
      marginTop: 48,
      borderBottom: "1px solid rgba(255,255,255,0.08)",
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
            color: "#F8FAFC",
            letterSpacing: "-0.01em",
            marginBottom: 4,
            lineHeight: 1.25,
          }}
        >
          How It Works
        </h1>
        <p style={{ fontSize: 13, color: "#CBD5E1", margin: 0 }}>
          The engineering behind Catalyst&apos;s market signal pipeline
        </p>
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
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#F8FAFC", marginBottom: 8 }}>
              The Noise Problem
            </h3>
            <p style={{ fontSize: 13, color: "#94A3B8", margin: 0, lineHeight: 1.5 }}>
              Retail traders are overwhelmed by thousands of disconnected market feeds. Over 95% are low-liquidity noise or bull traps.
            </p>
          </div>
          <div className="glass-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#F8FAFC", marginBottom: 8 }}>
              The Cost Problem
            </h3>
            <p style={{ fontSize: 13, color: "#94A3B8", margin: 0, lineHeight: 1.5 }}>
              Feeding raw events directly into an LLM with Google Search grounding costs hundreds of dollars per day in API tokens.
            </p>
          </div>
          <div className="glass-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#F8FAFC", marginBottom: 8 }}>
              The Math Problem
            </h3>
            <p style={{ fontSize: 13, color: "#94A3B8", margin: 0, lineHeight: 1.5 }}>
              LLMs excel at qualitative thesis synthesis but hallucinate on portfolio math — stop-loss calculations, position sizing, and risk management.
            </p>
          </div>
        </div>
        <p style={{ fontSize: 14, color: "#CBD5E1", lineHeight: 1.6, padding: "0 8px" }}>
          Catalyst solves this with a funnel of increasing cognitive depth. Signals are first triaged via cheap, high-speed deterministic filters (Python + Redis) before advancing to expensive, high-latency qualitative reasoning (Gemini AI), and finally passing to strict capital-risk models (Java).
        </p>
      </div>

      {/* Section 2: Pipeline Visualization */}
      <SectionHeading title="The 5-Stage Pipeline" />
      <div style={{ position: "relative", paddingLeft: 16, paddingRight: 16, maxWidth: 800, margin: "0 auto" }}>
        {/* Stages */}
        <PipelineStage
          icon={<Radar size={20} color="#38BDF8" />}
          title="1. Ingestion"
          desc="5 autonomous hunters scan Finviz, SEC EDGAR Form 4, BioPharmCatalyst, Barchart options flow, and FMP earnings."
          tech={["Python 3.12", "Playwright", "HTTPX", "BeautifulSoup"]}
        />
        <PipelineConnector />
        <PipelineStage
          icon={<Filter size={20} color="#A855F7" />}
          title="2. Confluence Filter"
          desc="Redis Sorted Set sliding window requires ≥2 independent sources within 5 minutes. Drops 95% of noise at zero AI cost."
          tech={["Redis 7", "Kafka"]}
        />
        <PipelineConnector />
        <PipelineStage
          icon={<Brain size={20} color="#F59E0B" />}
          title="3. AI Validation"
          desc="Gemini 2.5 with Google Search grounding synthesizes a structured catalyst thesis, conviction score, trap detection, and entry/exit parameters."
          tech={["Google GenAI SDK"]}
        />
        <PipelineConnector />
        <PipelineStage
          icon={<Calculator size={20} color="#10B981" />}
          title="4. Quantitative Sizing"
          desc="Java Spring Boot engine classifies market regime (SPY 200 SMA, VIX), calculates Half-Kelly position size capped at 2% account equity."
          tech={["Java 21", "Spring Boot 3.4"]}
        />
        <PipelineConnector />
        <PipelineStage
          icon={<Target size={20} color="#F43F5E" />}
          title="5. Execution & Resolution"
          desc="Alpaca paper execution with circuit breakers. Autonomous resolver daemon tracks fills, stop/target hits, and computes closed-loop realized PnL."
          tech={["Alpaca REST API", "TimescaleDB"]}
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
          US equity markets are open 6.5 hours per day. Automated weekday scheduling (06:50–16:10 ET via Lambda + EventBridge) cuts AWS hosting costs ~70%, achieving $3–8/month.
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
          <span style={{ fontSize: 32, fontWeight: 700, color: "#10B981", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
            480
          </span>
          <span style={{ fontSize: 16, fontWeight: 600, color: "#F8FAFC" }}>Automated Tests</span>
        </div>
        <p style={{ fontSize: 12, color: "#64748B", fontFamily: "var(--font-mono)", margin: 0 }}>
          294 Python · 33 Java · 153 Vitest
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
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4,
                color: "#CBD5E1",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Section 5: What I Learned */}
      <SectionHeading title="What I Learned" />
      <div style={{ display: "flex", flexDirection: "column", gap: 20, color: "#CBD5E1", fontSize: 14, lineHeight: 1.6 }}>
        <p>
          <strong style={{ color: "#F8FAFC" }}>Event-driven complexity vs. monolith simplicity</strong> — The overhead of Kafka topics, consumer groups, and offset management is real. But the ability to add the Notifier service as a new consumer of <code>validated-signals</code> without touching a single line of existing code proved the decoupling thesis.
        </p>
        <p>
          <strong style={{ color: "#F8FAFC" }}>Confluence filtering as AI cost control</strong> — The Gatekeeper drops ~95% of raw events before they reach Gemini. This isn&apos;t just noise reduction — it&apos;s the difference between a $200/day API bill and a $3/day one.
        </p>
        <p>
          <strong style={{ color: "#F8FAFC" }}>Deterministic math belongs in a typed language</strong> — Python is excellent for rapid prototyping, but Half-Kelly position sizing with regime-dependent caps requires the kind of strict numerical type safety that Java&apos;s type system naturally enforces.
        </p>
        <p>
          <strong style={{ color: "#F8FAFC" }}>Closed-loop validation changes everything</strong> — Building the Resolver daemon to track actual trade outcomes (wins, losses, stops, expirations) transformed Catalyst from a signal generator into a system that can measure its own accuracy.
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
              background: "#111827",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              color: "#F8FAFC",
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
            background: "rgba(255,255,255,0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid rgba(255,255,255,0.08)"
          }}
        >
          {icon}
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "#F8FAFC", margin: 0 }}>
          {title}
        </h3>
      </div>
      <p style={{ fontSize: 14, color: "#94A3B8", margin: 0, lineHeight: 1.5 }}>
        {desc}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        {tech.map((t) => (
          <span
            key={t}
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "#D97706",
              background: "rgba(217, 119, 6, 0.1)",
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
        background: "rgba(255,255,255,0.12)",
        margin: "0 auto",
      }}
    />
  );
}
