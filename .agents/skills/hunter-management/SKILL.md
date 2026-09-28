---
name: hunter-management
description: >-
  Guide for running, configuring, testing, and debugging Catalyst market data hunters
  (Squeeze, Biotech, Insider, Whale, and Drifter), managing rate limits, timeouts,
  and running the hunter orchestrator CLI.
---

# Hunter Management & Scraper Operations

Catalyst employs independent ingestion agents ("hunters") that monitor financial feeds, scrapers, and regulatory filings to surface potential market catalysts.

## Hunter Inventory

| Hunter | Module | Primary Source | Protocol / Tech | Kafka Topics | Interval / Rate Limit |
|---|---|---|---|---|---|
| **Squeeze** | `hunters/squeeze_hunter.py` | Finviz screener | HTTP / BeautifulSoup | `signal-squeeze`, `raw-events` | 900s (15 min) |
| **Biotech** | `hunters/biotech_hunter.py` | BioPharmCatalyst | HTTP / BeautifulSoup | `signal-biotech`, `raw-events` | 1800s (30 min) |
| **Insider** | `hunters/insider_hunter.py` | SEC EDGAR Form 4 | HTTP / XML parser | `signal-insider`, `raw-events` | On demand / scheduled |
| **Whale** | `hunters/whale_hunter.py` | Barchart unusual options | Playwright headless | `signal-whale`, `raw-events` | 3600s (1 hr) |
| **Drifter** | `hunters/drifter_hunter.py` | Financial Modeling Prep (FMP) | REST API / JSON | `signal-earnings`, `raw-events` | 3600s (1 hr) |

---

## 1. Running Hunters Locally

### Via the CLI Orchestrator (`hunters/main.py`)

Run all hunters sequentially:
```bash
# In local venv:
python -m hunters.main all

# Run with timeout protection (e.g. 30 seconds per hunter):
python -m hunters.main all --timeout 30

# List available hunters:
python -m hunters.main --list

# Run a specific hunter:
python -m hunters.main squeeze
python -m hunters.main biotech
python -m hunters.main insider
python -m hunters.main whale
python -m hunters.main drifter
```

### Via Docker Compose

Hunters can run as continuous background daemon containers:
```bash
# Start all hunters:
docker compose up -d hunter-squeeze hunter-biotech hunter-drifter hunter-whale

# Start a single hunter:
docker compose up -d hunter-squeeze

# Follow hunter logs:
docker logs -f hunter_squeeze
```

---

## 2. Pre-Emission Filters

Hunters discard low-conviction noise before publishing to Kafka:

### Squeeze Hunter Filters
Only stocks that pass all 5 criteria reach `raw-events`:
- **Price**: \$2.00 to \$60.00
- **Volume**: $\ge 200,000$ shares
- **Relative Volume**: $\ge 2.0\times$ average
- **Short Float**: $\ge 25.0\%$
- **Days to Cover**: $\ge 3.0$ (when reported)

### Drifter Hunter Filters
- **EPS Surprise**: $\ge 5.0\%$ beat over estimate (`DRIFTER_MIN_SURPRISE_PERCENT`)
- **Calendar Lookback**: 3 days (`DRIFTER_LOOKBACK_DAYS`)
- **Deduplication**: `symbol:date` cached in in-memory LRU set

---

## 3. Rate Limits & Anti-Blocking Guidelines

1. **SEC EDGAR (`insider_hunter.py`)**:
   - SEC requires a custom User-Agent in the format: `Sample Company Name AdminContact@domain.com`.
   - Never use generic `python-requests` headers or SEC will return HTTP 403.
   - Max 10 requests per second across all SEC endpoints.

2. **BioPharmCatalyst (`biotech_hunter.py`)**:
   - Strict rate limits; keep sweep intervals at $\ge 1800$ seconds (30 minutes).
   - Ticker cleaning: Cleans company suffixes (e.g., `NASDAQ:`, `.TO`) before emitting.

3. **Barchart (`whale_hunter.py`)**:
   - Uses Playwright headless Chromium.
   - If running in Docker, ensure browser dependencies are installed via `playwright install chromium`.

4. **Finviz (`squeeze_hunter.py`)**:
   - Standard browser user agent rotation.
   - Respect 15-minute intervals during market hours.

---

## 4. Developing a New Hunter

To implement a new hunter:
1. Create `hunters/<name>_hunter.py`.
2. Implement `async def run() -> None` or synchronous `run()`.
3. Standardize outgoing payload to include:
   - `ticker`: uppercase clean symbol
   - `source_hunter` (or `hunter`): string identifier
   - `timestamp_utc`: ISO 8601 UTC timestamp
   - `price`, `volume`, `relative_volume`: float numbers
4. Publish to `raw-events` and `signal-<name>` using `hunters.common.kafka_producer`.
5. Register in `hunters/main.py` `HUNTERS` dictionary.
6. Add coercion logic in `gatekeeper/gatekeeper.py` (`coerce_<name>`).
7. Add unit tests in `tests/test_hunters.py`.
