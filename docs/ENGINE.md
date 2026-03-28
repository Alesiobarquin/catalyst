# Strategy Engine (Java Spring Boot): Deep Dive

This document explains **Layer 4** of Catalyst: what the engine does, how each piece fits together, and the **trading concepts** you need to read the code and logs without a finance background.

**Code location:** `engine/`  
**Related:** [ARCHITECTURE.md](ARCHITECTURE.md) (high-level stack), [schemas.md](schemas.md) (Kafka payloads), [TESTING.md](TESTING.md) (how to verify).

---

## 1. What This Layer Is (and Is Not)

| What it **is** | What it **is not** |
|----------------|-------------------|
| A **Kafka consumer** that turns AI-validated signals into **structured trade blueprints** | A broker that places real orders |
| A **risk and regime filter** (macro gates + position sizing) | Guaranteed profitable trading |
| A **publisher** to `trade-orders` and a **writer** to TimescaleDB for history | Live order-flow / Level 2 data (see §9) |

The engine outputs **recommendations** (limit price, stop, target, suggested dollar size). A human or a future execution service (e.g. Alpaca) decides whether to execute.

---

## 2. Glossary: Trading Concepts Used in This Code

### 2.1 Market indices and “regime”

- **SPY** — An ETF that tracks the S&P 500 index. It is a proxy for “how is the broad US stock market doing?” The engine fetches SPY’s price from Yahoo Finance (same public chart API as many retail apps).

- **Simple Moving Average (SMA)** — The average of closing prices over the last *N* days. **200-day SMA** is a common **trend filter**: if price is **above** the 200-day line, many traders treat the long-term trend as bullish; **below** suggests a weaker or bearish backdrop for long-only swings.

- **VIX** — The “CBOE Volatility Index” (often called the **fear index**). It measures **expected** near-term volatility of the S&P 500 (derived from options prices). Rough intuition:
  - **Low VIX** (~12–20): calmer markets; swing strategies are often more comfortable.
  - **Elevated VIX** (~30+): fear and larger daily swings; the engine **tightens** what it allows (see regime rules below).
  - **Very high VIX** (~40+): extreme stress; the engine can **halt** all new signals.

**Regime** here means “what macro backdrop are we in when we size and route this trade?” — not a prediction of the next tick.

### 2.2 Order types and prices in a blueprint

- **Limit price** — The maximum price you’re willing to pay on a **buy** (here, always `BUY`). The strategies add a small **premium** above the last traded price (e.g. +0.2% to +0.5%) to model a realistic fill on fast-moving names; a limit exactly at the last price often misses.

- **Stop loss (stop)** — A price level where the thesis is **invalidated**; you exit to cap loss. The engine sets **stop** as a **price**, not a broker order. Wiring it to a broker stop order is a separate step.

- **Take profit / target** — A price level where you plan to **take partial or full profit** based on the strategy’s reward-to-risk. Again, the engine outputs **numbers**; execution is external.

- **Reward-to-risk ratio (often written as `b`)** — The ratio of **potential gain** to **potential loss** per share, using the strategy’s entry, stop, and target:

  \[
  \text{risk} = \text{entry} - \text{stop}, \quad
  \text{reward} = \text{target} - \text{entry}, \quad
  b = \frac{\text{reward}}{\text{risk}}
  \]

  Example: entry 100, stop 93, target 120 → risk 7, reward 20 → \(b \approx 2.86\).

### 2.3 Kelly criterion and half-Kelly

- **Kelly criterion** — A formula from probability theory that suggests what **fraction** of capital to risk on a **positive edge** bet when you know win probability and payoff odds. In the engine, **conviction_score** (0–100 from Gemini) is treated as a **proxy for win probability** \(p = \text{conviction}/100\). This is a **modeling choice**, not a guarantee that Gemini’s score equals true probability.

- **Full Kelly** — Uses the full fraction from the formula. Often **too aggressive** in practice because the estimated \(p\) is always wrong by some amount.

- **Half-Kelly** — Uses **half** of the full Kelly fraction. Common in industry to reduce drawdowns when probability estimates are uncertain.

- **Cap (`max-kelly-fraction`)** — Even if Kelly says “25% of portfolio,” risk limits often cap **maximum** fraction per trade (e.g. 25%). This prevents one “high conviction” signal from dominating the portfolio.

### 2.4 Catalyst types (strategy names)

These map **Gemini’s `catalyst_type`** to Java **strategy** classes:

| `catalyst_type` | Strategy name | Intuition |
|-----------------|---------------|-----------|
| `SUPERNOVA` | Supernova | Short squeeze / violent momentum; tighter stop, wider target profile. |
| `SCALPER` | Scalper | Biotech **binary** events (e.g. PDUFA); shorter horizon, **only** type allowed when VIX is in the “scalper-only” band. |
| `FOLLOWER` | Follower | Insider-led accumulation; **trailing stop** narrative (Chandelier-style exit described in rationale). |
| `DRIFTER` | Drifter | Post-earnings **drift** (multi-day swing); swing-style stop/target. |

Unknown types fall through to a **Fallback** strategy (conservative placeholder) so the consumer never crashes on a new label.

### 2.5 “Trap” (`is_trap`)

Gemini can set **`is_trap: true`** when the narrative looks like a **false positive** (e.g. insider buy but conflicting flow). The engine **drops** those signals immediately — no sizing, no Kafka `trade-orders`.

---

## 3. End-to-End Flow (One Message)

For each **validated signal** from Kafka `validated-signals`:

1. **Deserialize** JSON → `ValidatedSignal` (Jackson; no Spring Kafka type headers from Python).
2. **Trap gate** — If `is_trap` is true → **stop** (log and return).
3. **Regime snapshot** — Read cached **SPY + VIX + 200-day SMA** (refreshed on a schedule; see §4).
4. **Regime gates:**
   - **HALT** (VIX ≥ threshold, default 40) → **stop** all.
   - **SCALPER_ONLY** (VIX ≥ 30, default) → **only** `catalyst_type == SCALPER` continues; others **stop**.
   - **PASS** / **PASS_BEARISH** → continue; **bearish** path (SPY below 200 SMA) **halves** Kelly-sized dollars later.
5. **Price** — Fetch **current price** for the **signal ticker** (Yahoo Finance). If unavailable → **stop** (no fake prices).
6. **Strategy router** — Pick strategy by `catalyst_type` → compute **limit, stop, target, rationale** (`recommended_size_usd` still 0).
7. **Kelly sizer** — Compute **dollar size** from conviction, **actual** `b` from prices, regime (bearish discount), and portfolio cap.
8. If size ≤ 0 → **stop** (no edge at this conviction vs. payoff structure).
9. **Produce** async to Kafka `trade-orders` (key = ticker).
10. **Persist** row to TimescaleDB `trade_orders` (includes regime snapshot fields for analytics).

---

## 4. Regime Filter and Market Data

### 4.1 Data source

- **Yahoo Finance** public chart endpoints (same family as `query1.finance.yahoo.com/v8/finance/chart/...`).  
- **No API key** — suitable for a portfolio project; **not** a SLA-backed market data feed. **Do not** treat this as production-grade for real money.

### 4.2 What is cached

- **Regime snapshot** (SPY price, VIX, SPY 200 SMA) — Updated on a **fixed delay** schedule (default 5 minutes).  
- **Per-ticker price** — Short TTL cache (default 30 seconds) to avoid hammering Yahoo when many signals hit the same symbol.

### 4.3 Regime states (implemented)

| State | Meaning (simplified) |
|-------|----------------------|
| `PASS` | VIX below “scalper-only” threshold **and** SPY **above** 200-day SMA. |
| `PASS_BEARISH` | VIX below scalper-only threshold **but** SPY **not** above 200-day SMA — **still trade**, but **half** Kelly dollars. |
| `SCALPER_ONLY` | VIX high enough that only **SCALPER** signals pass (binary events less tied to broad market beta). |
| `HALT` | VIX at or above **halt** threshold — **no** new trade orders. |

Thresholds are **environment-configurable** (see `docker-compose.yml` for `engine`).

---

## 5. Kelly Sizer (Implementation Details)

**Inputs:**

- `p` = `conviction_score / 100`
- `q` = `1 - p`
- `risk` = `limit_price - stop_loss`
- `reward` = `target_price - limit_price`
- `b` = `reward / risk` (if risk or reward ≤ 0, the code uses a **small floor size** or **zero** edge path — see code comments)

**Kelly (full):**

\[
f^* = \frac{p \cdot b - q}{b}
\]

**Half-Kelly:** `f = f* / 2`, then **cap** by `max-kelly-fraction`, multiply by **portfolio value** env.

**Bearish:** If regime is `PASS_BEARISH`, **multiply** dollar size by **0.5**.

---

## 6. Strategy Router (Per-Strategy Math)

Each strategy sets **entry premium**, **stop** as a fraction of entry, **target** as a fraction of entry. The exact percentages are **policy choices** documented in the Java classes (`SupernovaStrategy`, `ScalperStrategy`, `FollowerStrategy`, `DrifterStrategy`).

They **do not** fetch intraday order book or Level 2 data.

---

## 7. Kafka Producer and Persistence

### 7.1 `trade-orders` topic

- **Producer:** `JsonSerializer` with **no** Spring type headers — plain JSON for any consumer (Python, Node, etc.).
- **Key:** `ticker` for partition affinity (same ticker → same partition if you add partitions later).

### 7.2 TimescaleDB `trade_orders` table

- Created by **Flyway** migration in `engine/src/main/resources/db/migration/`.
- **Hypertable** on `timestamp_utc` for time-range queries (dashboard / API later).
- **Extra columns** vs `trade-orders` Kafka JSON: `conviction_score`, `catalyst_type`, `regime_vix`, `spy_above_200sma` for **historical analysis**.

### 7.3 Relationship to Python `validated_signals` persistence

The **`persistence/`** Python service writes **validated** AI signals to **`validated_signals`**. The **Java engine** writes **trade outputs** to **`trade_orders`**. Both can coexist; they answer different questions: “what did the AI say?” vs “what did the engine recommend?”

---

## 8. Configuration Reference (Environment)

| Variable | Role |
|----------|------|
| `KAFKA_BOOTSTRAP_SERVERS` | Broker list (e.g. `kafka:29092` in Docker) |
| `VALIDATED_SIGNALS_TOPIC` | Consume topic (default `validated-signals`) |
| `TRADE_ORDERS_TOPIC` | Produce topic (default `trade-orders`) |
| `TIMESCALE_*` | JDBC connection for Flyway + JPA |
| `PORTFOLIO_VALUE` | Notional account size for Kelly dollar output |
| `MAX_KELLY_FRACTION` | Hard cap on fraction of portfolio per trade |
| `VIX_HALT_THRESHOLD` / `VIX_SCALPER_ONLY_THRESHOLD` | Regime thresholds |
| `REGIME_REFRESH_MS` | How often SPY/VIX/SMA refresh |

---

## 9. Not Implemented (Architecture vs Code)

[ARCHITECTURE.md](ARCHITECTURE.md) mentions a **micro-structure gate** (order flow / aggressor side). **That is not implemented** in the current engine: if a signal passes regime + strategy + Kelly, it is published. Adding OFI or Level 2 would require a **separate data feed** and new module.

---

## 10. Operational Notes

- **Health:** `GET http://localhost:8081/actuator/health` (mapped in Docker `8081:8081`).
- **Virtual threads:** Enabled in `application.yml` so blocking HTTP to Yahoo does not pin platform threads.
- **Yahoo Finance** may rate-limit or change shape; failures are logged and **last** regime snapshot may be retained (see `MarketDataService`).

---

## 11. Further Reading

- [TESTING.md](TESTING.md) — Synthetic messages, Kafka UI, SQL checks.
- [schemas.md](schemas.md) — Exact JSON fields for `validated-signals` and `trade-orders`.
- [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) — Phase 2 API and dashboard next steps.
