# Project Catalyst: The Plan

## 1. The Core Philosophy
**We do not guess. We verify.**
Catalyst is a High-Fidelity Signal Generator. It replaces manual chart monitoring with a three-stage automated pipeline: Data Ingestion, AI-Driven Contextual Analysis, and Algorithmic Strategy Formulation.

- **Ingestion:** We hunt for specific setups: Offensive Flow (Whales buying) and Defensive Traps (Shorts stuck).
- **Analysis:** AI (Gemini) determines the narrative of the trade (e.g., "Is this a trap?").
- **Strategy Formulation:** We don't just say "Buy." We calculate the mathematical edge (Kelly Criterion) and generating a precise Trade Plan (Entry, Stop, Target) for the user to execute.

## 2. The Architecture Stack

### Layer 1: The Hunters (Python Ingestion)
**Role:** The Ears. We listen to the market.
We monitor 6 distinct data streams (The "Hunters").

1.  **Insider Hunter: The SEC Watchdog**
    *   *Role:* The fastest, most reliable signal in the stack.
    *   *Source:* `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent`
    *   *Logic:* Use Python's `httpx` to poll the RSS feed.
    *   *The Edge:* Don't just scan the ticker; extract the transactionCode and transactionAmount.
    *   *Kafka Topic:* `signal-insider`

2.  **Whale Hunter: The Options Flow**
    *   *Role:* The "Smart Money" validator.
    *   *Source:* `https://www.barchart.com/options/unusual-activity/stocks`
    *   *The Hack:* Barchart uses Cloudflare protection. Standard requests will fail. You must use Playwright (headless browser) to render the page and extract the table.
    *   *Logic:* Filter for Vol/OI > 2.0 and Type == 'Call'.
    *   *Kafka Topic:* `signal-whale`

3.  **Biotech Hunter: The FDA Scout**
    *   *Role:* The "Scheduled Catalyst" finder.
    *   *Source:* `https://www.biopharmcatalyst.com/calendars/pdufa-calendar`
    *   *The Hack:* Use Playwright to bypass anti-bot screens.
    *   *Logic:* Extract table rows where Stage == 'Phase 3' or Catalyst == 'PDUFA'.
    *   *Storage:* Store in Redis (Key: `biotech_calendar`).

4.  **Drifter Hunter: The Earnings Engine**
    *   *Role:* The "Swing Trade" generator.
    *   *Source:* Financial Modeling Prep (FMP) API.
    *   *The Constraint:* Free Tier = 250 calls/day. Do not poll continuously.
    *   *The Logic:* Call once per hour during market hours (7x daily). Filter for SurprisePercent > 10.
    *   *Kafka Topic:* `signal-earnings`

5.  **Squeeze Hunter: The Supernova Gauge**
    *   *Role:* The "Short Squeeze" fuel tank.
    *   *Source:* `https://finviz.com/screener.ashx?v=111&f=sh_short_o20`
    *   *The Hack:* The URL parameter `f=sh_short_o20` tells Finviz to filter for >20% short interest.
    *   *Kafka Topic:* `signal-squeeze`

6.  **Shadow Hunter: Dark Pool Tracker**
    *   *Role:* The "Hidden" liquidity.
    *   *Source:* `https://tradytics.com/darkpool-market`
    *   *The Hack:* Use Playwright to render the "Darkpool Market Summary" table.
    *   *Logic:* Filter for Net Value > $100M.
    *   *Kafka Topic:* `signal-shadow`

### Layer 2: The Nervous System (Apache Kafka)
**Role:** Decoupling. Handles the speed mismatch between fast data and deep thought.
*   **Topic 1:** `raw-events` $\rightarrow$ All Hunter outputs go here.
*   **Topic 2:** `validated-signals` $\rightarrow$ Enriched JSON from Gemini (Layer 3).
*   **Topic 3:** `trade-orders` $\rightarrow$ Final calculated trade instructions from Spring Boot (Layer 4).

### Layer 2.5: The Gatekeeper (Triage Service)
**Role:** The Sniper Scope.
This layer prevents "garbage in, garbage out" and saves API costs by filtering raw events from the Hunters before they reach the expensive AI analysis layer.

*   **The Rule:** The AI only gets woken up if a ticker passes a Hard Metric Threshold or shows Confluence.
*   **Aggregation (The Wait):**
    *   Consumes `raw-events`.
    *   Holds data in a 5-minute rolling window using Redis.
    *   **Goal:** Detect if multiple Hunters spot the same ticker (e.g., Squeeze + Insider).
*   **Hard Filters (The Kill):**
    *   **Liquidity Check:** Is Pre-Market Volume > 50k? (If No $\rightarrow$ Drop).
    *   **Momentum Check:** Is Relative Volume > 1.5? (If No $\rightarrow$ Drop).
*   **The Trigger Logic:**
    *   IF **Confluence_Count > 1** (Two sources confirm)
    *   OR **Technical_Score > 70** (Massive outlier event)
    *   THEN $\rightarrow$ Push to `triage-priority` (or directly to `validated-signals` for analysis).

### Layer 3: The Brain (Gemini 1.5 Pro)
**Role:** The Synthesizer. It classifies context.
*   **Input:** Reads from `raw-events`. Fetches recent news headlines + Sector Sentiment.
*   **Prompt Logic:** "Analyze confluence. Identify the Catalyst Type. Check for 'Trap' scenarios (e.g., Insider Buy but Bearish Options Flow). Output structured JSON."
*   **Output to Kafka (validated-signals):**
    ```json
    {
      "ticker": "XYZ",
      "conviction_score": 92,
      "catalyst_type": "SUPERNOVA",
      "rationale": "High short interest + sudden insider buy creates squeeze condition."
    }
    ```

### Layer 4: The Strategist (Java Spring Boot)
**Role:** Strict Math. The Strategy Pattern.
This layer consumes `validated-signals` and turns a "feeling" into a "plan."

*   **Step 1: The Regime Filter (The "Kill Switch")**
    *   Check: Is SPY > 200 SMA? Is VIX < 30?
    *   Logic: If VIX > 30, Reject all Swing strategies. Only "Scalper" signals are passed. If VIX > 40, Hard Stop (System Halt).
*   **Step 2: The Kelly Sizer (Money Management)**
    *   Input: Gemini Conviction Score (e.g., 92%).
    *   Formula: Fractional Kelly Criterion (Half-Kelly).
    *   Output: "Recommended Position Size: $12,400".
*   **Step 3: The Strategy Router**
    *   Assigns the Exit Logic based on the Catalyst Type:
        *   A. Supernova (Short Squeeze): Exit when Short Interest drops by 10%.
        *   B. Scalper (Biotech): Exit when Bollinger Bands tighten. Time limit: 60 mins.
        *   C. Follower (Insider): Chandelier Exit (Trailing Stop).
        *   D. Drifter (Earnings): Exit if ADX < 25.
*   **Step 4: The Micro-Structure Gate (The Trigger)**
    *   The Check: Order Flow Imbalance (OFI).
    *   Logic: Are trades hitting the Ask? (Aggressor == BUY).
    *   Result: If validated, publish to `trade-orders`.

### Layer 5: The Memory (PostgreSQL)
**Role:** Persistence.
Stores: Trade History, Active Signals, Performance Metrics.

### Layer 6: The Interface (Next.js + Tailwind)
**Role:** The Cockpit.
*   **Live Feed:** WebSocket subscription to `trade-orders` (via the Java backend).
*   **The "Trade Card":** Displays the final output for the user.
    *   Ticker: XYZ
    *   Action: BUY
    *   Limit Price: $105.50
    *   Stop Loss: $98.00
    *   Reason: "Supernova Pattern identified by Gemini."
*   **Action:** User physically places the trade at their broker based on this card.

## 3. Technology Stack Details

1.  **Data Ingestion (The Hunters)**
    *   Language: Python 3.11+
    *   Libs: `asyncio`, `pandas`, `confluent-kafka`
    *   Network: `httpx`, `websockets`

2.  **Message Bus (The Nervous System)**
    *   Core: Apache Kafka 3.6+ (Kraft mode)
    *   UI: Redpanda Console or UI for Apache Kafka

3.  **The Brain (Intelligence)**
    *   Model: Google Gemini 1.5 Pro
    *   Integration: Python Microservice or Java

4.  **Strategy Engine (The Executioner)**
    *   Language: Java 21 (LTS)
    *   Framework: Spring Boot 3.2.x
    *   Concurrency: Virtual Threads (Project Loom)
    *   Communication: Kafka Consumer API, Alpaca-Java SDK, Spring Websocket (STOMP)

5.  **Persistence (Memory)**
    *   Hot Storage: Redis 7
    *   Cold Storage: PostgreSQL 16 with TimescaleDB extension

6.  **Frontend (The Face)**
    *   Framework: Next.js 14 (App Router)
    *   Styling: Tailwind CSS + shadcn/ui
    *   State: Zustand
    *   Charts: TradingView Lightweight Charts
