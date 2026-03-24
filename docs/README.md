# Catalyst Documentation Index

| Document | Contents |
|----------|----------|
| **[ENGINE.md](ENGINE.md)** | **Strategy engine deep dive:** end-to-end flow per message, regime filter, Half-Kelly, strategy router, Kafka/DB I/O, env vars. **Trading glossary** (VIX, SPY 200 SMA, limit/stop/target, reward-to-risk, Kelly, catalyst types). **Not implemented:** OFI gate. |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Full stack narrative: Hunters → Kafka → Gatekeeper → AI → Engine → persistence/UI. |
| **[schemas.md](schemas.md)** | Kafka JSON contracts (`raw-events`, `validated-signals`, `trade-orders`) + TimescaleDB tables (`trade_orders`, `validated_signals`). |
| **[TESTING.md](TESTING.md)** | Python hunters, Docker/Kafka UI, **Java engine** (synthetic signals, SQL checks, health), troubleshooting. |
| **[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)** | Phases, estimates, dependencies, file locations, recruiting angles. |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | EC2, cost, scheduling; includes engine + egress note. |
| **[DOCS_DRAFT.md](DOCS_DRAFT.md)** | Draft positioning / interview prep notes (partially superseded by README + ENGINE). |

**Start here for “what does the Java layer do?” → [ENGINE.md](ENGINE.md).**
