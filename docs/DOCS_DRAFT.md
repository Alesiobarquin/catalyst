# Documentation Draft — Strategic Positioning for Recruiting

*Reference document for interview prep and further doc edits. Used to create README and DEPLOYMENT.md.*

## 1. OPENING PARAGRAPH (2-3 sentences)

**Draft A (recommended):**
> Catalyst discovers market catalysts by aggregating signals from multiple sources, validating them with LLMs, and ranking by conviction. It demonstrates event-driven architecture (Kafka), stateful aggregation (Redis), and LLM integration with search grounding. Built as a learning project to explore data pipelines, signal filtering, and AI-assisted financial analysis.

**Draft B (slightly more technical):**
> Catalyst is a market signal discovery pipeline: Python scrapers collect candidate tickers, a Gatekeeper filters by confluence and volume, and Gemini scores them with live search context. The project explores event-driven design, multi-source aggregation, and structured LLM output—useful concepts for any data-heavy or AI-integrated system.

---

## 2. WHY THIS ARCHITECTURE

**Kafka**
- **Why:** Decouples hunters from downstream processing, buffers bursts, and allows multiple consumers (e.g., future engine, analytics). Handles backpressure if the AI layer is slow.
- **Trade-off:** Current load is ~50–100 events/min during active scrapes. Kafka is overkill for this volume—a Redis queue or even in-process batching would work. Chose Kafka to learn the patterns and design for scale.
- **Alternative:** Would start with a simple queue or DB-polling if rebuilding for minimal complexity.

**Redis**
- **Why:** Rolling-window aggregation for the confluence gate. Need per-ticker state with TTL (5 min), fast lookups, and atomic SET/LPUSH. Redis fits this use case well.
- **Trade-off:** Could use in-memory structures if everything ran in one process, but Redis enables horizontal scaling and persistence across restarts.
- **Alternative:** None—Redis is the right tool for this.

**Gemini + Search Grounding**
- **Why:** Need context-aware signal validation. Raw scraped data is noisy; an LLM can infer trap scenarios, news sentiment, and catalyst type. Google Search grounding adds real-time context (news, filings) without separate API calls.
- **Trade-off:** Proprietary API, cost per token, rate limits. Considered open-source LLMs (Llama, Mistral) but grounding and structured JSON output were harder to get reliably. Gemini's native search integration made iteration faster.
- **Alternative:** Fine-tuning a smaller model—rejected due to data scarcity and maintenance cost.

**Next.js for frontend (planned, not built)**
- **Why:** Planned dashboard to show live signals, conviction scores, and charts. Next.js chosen for React ecosystem, SSR, and easy deployment.
- **Trade-off:** Premature. No frontend exists; Kafka UI and RedisInsight cover current debugging needs. A CLI or Grafana would suffice for now.
- **Honest take:** Next.js is "nice to have" for a polished demo, not essential for the pipeline itself.

**Spring Boot for engine (implemented — `engine/`)**
- **Why:** Consumes `validated-signals`, applies regime filter + Half-Kelly sizing, routes by catalyst type, publishes `trade-orders`, persists `trade_orders` to TimescaleDB. Java chosen for type safety, mature Kafka client, and JVM ecosystem story.
- **Trade-off:** Python could do this; Java adds a second language and container. Documented in depth in [ENGINE.md](ENGINE.md).
- **Honest take:** Not a production execution system — Yahoo Finance + heuristic Kelly are portfolio-grade, not fund-grade.

---

## 3. WHAT ACTUALLY WORKS

**Fully Implemented**
| Component | Status | Notes |
|-----------|--------|-------|
| Squeeze Hunter | ✅ Production | Finviz scrape → Kafka. Pre-emission filters (price, volume, short float). |
| Gatekeeper | ✅ Production | Redis 5-min window, confluence ≥ 2, hard filters (volume, price). |
| AI Layer | ✅ Production | Gemini + Search grounding, structured JSON output, conviction threshold. |
| End-to-end pipeline | ✅ Verified | Squeeze → Gatekeeper → AI → validated-signals. Tested with synthetic events. |
| Docker Compose setup | ✅ Production | All services run locally. Kafka UI, RedisInsight for debugging. |

**Partially Implemented**
| Component | Status | Limitation |
|-----------|--------|------------|
| Insider Hunter | ⚠️ Emits, rarely passes | Scrapes SEC EDGAR (limited scope). Payload lacks liquidity fields—Gatekeeper drops most events unless in confluence with Squeeze. |
| Biotech Hunter | ⚠️ Emits, rarely passes | Scrapes BioPharmCatalyst. Same issue: no volume/price in payload, so Gatekeeper filters out single-source events. |

**Why partial:** Gatekeeper requires `volume` and `relative_volume` to prevent low-liquidity noise. Insider and Biotech sources don't expose those fields. Options: (1) add a price/volume lookup (extra API), (2) relax Gatekeeper for known binary-event hunters, (3) rely on confluence—Insider + Squeeze for same ticker can pass.

**Not Implemented (Planned)**
| Component | Reason |
|-----------|--------|
| Whale Hunter | Implemented. Barchart scraper emits to `signal-whale` + `raw-events`. |
| Drifter Hunter | Implemented. FMP earnings logic emits to `signal-earnings` + `raw-events`. |
| Shadow Hunter | Dropped. Tradytics dark-pool feed is paywalled and not suitable for free scraping. |
| Persistence (TimescaleDB) | No consumer writes to DB. Signals live only in Kafka topics. |
| Frontend | Designed, not built. |
| Strategy Engine | Designed (Kelly, regime filter), not built. |
| Automated Trading | Intentionally out of scope. Human-in-the-loop only. |

---

## 4. WHAT I LEARNED

1. **Confluence is harder than it looks.** Many "signals" are retail momentum, not catalysts. Confluence helps (Squeeze + Insider = stronger), but false positives still get through. Better filtering would need more signals or a feedback loop (e.g., "did this actually move?").

2. **LLMs need grounding.** Without search context, Gemini hallucinates news and sentiment. Enabling Google Search grounding fixed that—but cost and latency went up. Learned to treat LLMs as one layer, not the source of truth.

3. **Kafka was overkill initially.** For ~50 events/min, a simple queue would have worked. Chose Kafka to learn it and design for scale. Would start simpler next time and add Kafka when throughput or multi-consumer needs justify it.

4. **Scraping is fragile.** Finviz and BioPharmCatalyst change layouts. Playwright helps, but selectors break. Would invest in more robust extraction (e.g., API-first sources) or a monitoring/alerting layer for scraper health.

5. **Testing the happy path isn't enough.** Early bugs (missing `import time`, wrong Kafka client args) only showed up when Kafka was down or when running full E2E. Adding integration tests and failure-path coverage was necessary.

---

## 5. DEPLOYMENT & SCALING (for DEPLOYMENT.md)

**Current Setup**
- Docker Compose locally
- Squeeze hunter: runs on schedule (e.g., every 5 min)
- Gatekeeper: single consumer, drains `raw-events`
- AI Layer: single consumer, drains `triage-priority`
- Load: ~50–100 events/min, bursty during scrape cycles

**AWS Deployment (ECS)**
- Hunters: ECS tasks on CloudWatch Events schedule (e.g., `cron(0/5 14-21 ? * MON-FRI *)` for market hours)
- Gatekeeper: ECS service, 1–2 tasks, scale on Kafka consumer lag
- AI Layer: ECS service, 1–2 tasks, scale on lag or queue depth
- Kafka: AWS MSK (managed), single broker sufficient for current load
- Redis: ElastiCache (single node)
- Secrets: GEMINI_API_KEY in Secrets Manager

**Estimated Cost (current load)**
- ECS Fargate (3–4 tasks): ~$30–50/mo
- MSK (single broker): ~$150/mo (minimum)
- ElastiCache (cache.t3.micro): ~$15/mo
- Gemini API: variable, ~$5–20/mo for low volume
- **Total: ~$200–250/mo** (MSK dominates; consider SQS + Lambda for lower cost if Kafka not required)

**Scaling to 10x**
- Bottleneck: Gemini rate limits and cost
- Mitigation: Batch scoring, cache repeated tickers, raise conviction threshold to reduce calls
- Kafka: trivial at 500/min
- Redis: scale up instance or add replicas if memory pressure

**Scaling to 100x**
- Bottleneck: AI Layer throughput
- Mitigation: Multiple AI consumers, partition `triage-priority` by ticker, consider async/batch Gemini calls
- Hunters: More instances, more frequent scrapes
- Monitoring: CloudWatch alarms on Kafka lag, error rate, Gemini latency

---

## 6. SUGGESTED README STRUCTURE

1. **What is Catalyst?** — 2 paragraphs, plain English, no jargon
2. **What Actually Works** — Honest scope table, no surprises
3. **Architecture** — Diagram + "Why This Architecture" subsection
4. **Quick Start** — Prerequisites, `docker compose up`, verify
5. **How to Run It** — Start services, run hunters, E2E testing
6. **Components** — Hunters, Gatekeeper, AI Layer (detailed)
7. **What I Learned** — 3–4 bullet points, self-reflection
8. **Deployment** — Link to DEPLOYMENT.md, one-sentence summary
9. **Future Work** — Honest roadmap
10. **Tech Stack** — Table

---

## 7. TONE & VOICE CALIBRATION

**Target tone:** Confident, honest, professional. Sounds like someone who built something, debugged it, and can explain trade-offs.

**Avoid:**
- Marketing: "revolutionary," "cutting-edge," "powerful"
- Defensive: "I know it's not perfect," "it's just a demo"
- Vague: "robust," "scalable," "production-ready" without evidence

**Use:**
- Specifics: "Squeeze hunter filters by short float ≥ 25% and relative volume ≥ 2x"
- Trade-offs: "Kafka is overkill for current load; chose it to learn the patterns"
- Scope: "Insider/Biotech emit but rarely pass Gatekeeper due to missing liquidity fields"

**Example sentences:**
- ✅ "Catalyst discovers market catalysts by aggregating signals from multiple sources."
- ❌ "Catalyst is a revolutionary alpha discovery platform."
- ✅ "Gemini with search grounding avoids hallucinated news; cost and latency increase."
- ❌ "Our AI-powered analysis is fast and accurate."

---

## 8. FINAL CHECKLIST

- [x] Opening paragraph is clear and honest
- [x] Each tech choice has a "why" (not just "it's cool")
- [x] Scope is crystal clear (no surprises)
- [x] Learned section is articulated
- [x] Deployment thinking is shown (ops mindset)
- [x] Tone is professional (not marketing, not defensive)
- [x] A recruiter could understand the project in 3 min
- [x] An engineer could understand the design decisions
- [x] A hiring manager would know what was learned
