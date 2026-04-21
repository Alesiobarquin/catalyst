# Catalyst Documentation Index

| Document | Contents |
|----------|----------|
| **[ENGINE.md](ENGINE.md)** | **Strategy engine deep dive:** end-to-end flow per message, regime filter, Half-Kelly, strategy router, Kafka/DB I/O, env vars. **Trading glossary** (VIX, SPY 200 SMA, limit/stop/target, reward-to-risk, Kelly, catalyst types). **Not implemented:** OFI gate. |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Full stack narrative: Hunters → Kafka → Gatekeeper → AI → Engine → persistence/UI. |
| **[schemas.md](schemas.md)** | Kafka JSON contracts (`raw-events`, `validated-signals`, `trade-orders`) + TimescaleDB tables (`trade_orders`, `validated_signals`). |
| **[TESTING.md](TESTING.md)** | Python hunters, Docker/Kafka UI, **Java engine** (synthetic signals, SQL checks, health), troubleshooting. |
| **[PRODUCT_PRIORITIES.md](PRODUCT_PRIORITIES.md)** | **Ordered backlog:** daily pipeline reliability → second hunter → UI polish; checklists; what to defer. **Start here for “what should we build next?”** |
| **[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)** | Older phased estimates, dependencies, recruiting context (may lag code; cross-check priorities doc). |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | EC2, cost, scheduling; includes engine + egress note. |
| **[PRE_AWS_READINESS_CHECKLIST.md](PRE_AWS_READINESS_CHECKLIST.md)** | Required product/reliability/testing gates that must be complete before AWS deployment. |
| **[AUGUST_ACTIVATION_CHECKLIST.md](AUGUST_ACTIVATION_CHECKLIST.md)** | Fast go-live checklist to enable AWS runtime when recruiting season starts. |
| **[AWS_DEPLOY_RUNBOOK.md](AWS_DEPLOY_RUNBOOK.md)** | Ordered execution steps for the minimal EC2 + Lambda + EventBridge deployment. |
| **[VALIDATION_REPORT_2026-04-21.md](VALIDATION_REPORT_2026-04-21.md)** | Snapshot of local validation results and blockers to close before AWS rollout. |
| **[DOCS_DRAFT.md](DOCS_DRAFT.md)** | Draft positioning / interview prep notes (partially superseded by README + ENGINE). |

**Start here for “what does the Java layer do?” → [ENGINE.md](ENGINE.md).**
