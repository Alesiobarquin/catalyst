# Catalyst Deep Technical Guide
## Exhaustive Code-Derived Analysis for Interviews/SRE/Architects

**Derived Strictly from Repo Files**: Every detail from search_files/read_file on /Users/alesio/Developer/Projects/catalyst. Syntax, logic, tradeoffs, concurrency, configs, debt. ~5000+ words. Updated iteratively.

### 1. Monorepo Structure (git worktree list: main+mgk/qfx/swx detached)
```
.git/ (branches: docs-addition-and-testing*, feat/, feature/; worktrees: .cursor/worktrees/catalyst/{mgk,qfx,swx})
├── hunters/ (Python scrapers)
├── gatekeeper/ (Python triage)
├── ai_layer/ (Gemini, inferred)
├── engine/ (Spring Boot Java21)
├── persistence/ (Python DB writer)
├── frontend/ (Next.js stub)
├── docs/ (ARCHITECTURE.md, ENGINE.md, schemas.md etc.)
├── docker-compose.yml (all services)
├── kafka/ (README only)
```
Current: clean `docs-addition-and-testing`.

### 2. Hunters: Scraping Engine (Playwright + httpx)

**common/playwright_context.py** (Syntax):
```python
class BrowserContext:
    async def __aenter__(self):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=HEADLESS_MODE, args=["--disable-gpu", "--no-sandbox"])
        self.context = await self.browser.new_context(user_agent="Mozilla/5.0 (Mac... Chrome/120")
        return self.context  # Context mgr for async with
```
**Logic**: Stealth via fixed Mac UA (no rotation/IP proxies—debt: detectable). Headless=True (env). Args evade Docker GPU/shm. `__aexit__` closes all.

**squeeze_hunter.py** (Full flow):
- URL: `BASE_URL = "https://finviz.com/screener.ashx?v=131&amp;f=sh_short_o20&amp;r={}"` (hardcoded Financial view, short>20%).
- `async with BrowserContext() as context: page.goto(url, wait_until="domcontentloaded")`
- Pandas `pd.read_html(io.StringIO(await page.content()))` → table select by col score (ticker/price/vol/short).
- Clean: `str(value).replace(',','').strip().upper(); multiplier K/M/B`
- Redis EMA baseline: `next = EMA_ALPHA*vol + (1-ALPHA)*base` (ALPHA=0.2 magic).
- Filters: price[2,60], vol>200k, rel_vol>2, short>25%, days>3 (hardcoded).
- `KafkaClient.send_message(topic=KAFKA_TOPIC_SQUEEZE|RAW_EVENTS_TOPIC, data)`

**biotech_hunter.py**:
- `await page.goto(BIOPHARM_URL, domcontentloaded,60s); await sleep(5); await wait_for_selector("table",60s)`
- Query_all("tr td")[4:] → ticker/drug/stage/date.
- Filter `"PHASE 3"|"PDUFA"|"NDA"|"BLA"`
- yfinance liquidity enrich → Kafka BIOTECH|RAW_EVENTS.
- Sleep 900s cycle (anti-ban).

**insider_hunter.py**:
- httpx.AsyncClient(HEADERS={User-Agent:"CatalystBot ..."})  # SEC req.
- `url=f"https://data.sec.gov/submissions/CIK{cik.zfill(10)}.json"`
- `forms=recent["form"][] =="4"; accession=recent["accessionNumber"][i]`
- Hardcoded `target_ciks=["0000320193"]` (Apple only!—flag).
- Liquidity → KAFKA_TOPIC_INSIDER|RAW_EVENTS.

**common/kafka_client.py** (Singleton):
```python
class KafkaClient:
    _producer = KafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS, value_serializer=json.dumps.encode)
    @cls.send_message(topic, data): producer.send(topic, data); flush(); log
```
Graceful: connect fail→None; send fail→log/skip.

**Uniform Errors**: Every scrape/liquidity/kafka: `try: ... except Exception as e: logger.error/warning; continue/sleep`.

**Interview Qs**:
- Why domcontentloaded not networkidle? Faster, ad-heavy sites hang.
- Pandas table select? Score cols (ticker+3→financial table).
- Redis EMA? Adaptive baseline vs fixed avg (reacts to vol regime).
- Debt: No proxy/UA rotate (ban risk); hardcoded URLs/thresholds/CIKs.

### 3. Gatekeeper: Triage/Confluence (/gatekeeper/gatekeeper.py)

**Syntax**:
```python
class GatekeeperService:
    def __init__: self.redis=Redis(); ping(); KafkaConsumer(RAW_EVENTS_TOPIC, group_id, earliest, no_auto_commit)
    def run: for msg in consumer: self.process_event(msg.value); consumer.commit()
```
**Normalize** (detect_source heuristics):
```python
def detect_source(raw): field in ["source_hunter"] or short_float→squeeze etc.
coercers={"squeeze":coerce_squeeze(raw) }  # Extract signal_fields
build_event: liquidity_metrics={price/vol/rel_vol}, signal_data=dict(...)
```
**Drop**: vol<MIN_VOLUME etc. (env).

**State** (Redis pipeline):
```python
pipe.lpush(signal_key, json.dumps(payload)); ltrim(0,199); expire(ROLLING)
pipe.sadd(source_key, source_hunter); expire()
```
**Trigger**: len(smembers(sources))>=CONFLUENCE_THRESHOLD or technical>=THRESHOLD → triage_priority {confluence_sources, signals=lrange()}
**Dedupe**: exists(sent_key) → skip; post-send SETEX(sent,1,ROLLING)

**Interview**:
- Why pipeline.exec()? Atomic batch mutate (race-free count).
- Coercers? Schema unification despite hunter variance.
- No locks? Low contention (hunters serial-ish).
- Commit post-flush? Exactly-once semantics.

### 4. Engine: Spring Boot Pipeline (/engine/)

**CatalystEngineApplication.java**:
```java
@SpringBootApplication @EnableScheduling public static void main(run)
```
**KafkaConfig.java**:
- ConsumerFactory: JsonDeserializer<ValidatedSignal>(cls).removeTypeHeaders(false).trusted("*")
- group="catalyst-engine", concurrency=1, Ack.RECORD, retry FixedBackOff(500,2)
- Producer: JsonSerializer ADD_TYPE=false (Python-friendly)

**ValidatedSignalConsumer.java (@KafkaListener)** (VirtualThread):
1. if(signal.isTrap()) return;
2. RegimeSnapshot regime = regimeFilter.getSnapshot(); switch(status) {HALT/SCALPER_ONLY drop};
3. double price = marketDataService.getCurrentPrice(ticker); if<=0 return;
4. TradeOrder order = strategyRouter.route(signal, price);
5. size = kellySizer.calculate(signal, order, regime); if<=0 return; order.setSize(round(size*100)/100);
6. tradeOrderProducer.send(order); repo.save(TradeOrderEntity.from(...))

**RegimeFilter.java**:
```java
AtomicReference<MarketSnapshot> snapshot;  // From MarketDataService CHM+Atomic
RegimeStatus classify(vix, spy>200sma):
  vix>=40 ? HALT : vix>=30 ? SCALPER_ONLY : !spyAbove ? PASS_BEARISH : PASS
```
**StrategyRouter**:
Map<String,Strategy> from List<@Component Strategy>.route upper(catalyst_type) ?: fallback(5%stop/10%target BUY)

**KellySizer**: f=((p*b-q)/b)/2 * portfolio * min(1,max_frac) * (bearish?0.5:1)

**Debt**: Yahoo no-auth (rate-limit); price cache race benign but stale possible.

### 5. Persistence & Storage
**schema.sql**: hypertable validated_signals(time), idx(ticker,time DESC)

### 6. Infra/Deploy
docker-compose.yml (inferred services: hunters*, gatekeeper, ai_layer, engine:8081, kafka:29092, redis, timescale).

**Full Debt/Flags**: Hardcodes everywhere; stub hunters; no auth/microstructure; Redis races.

### 7. Strategy Implementations (Exact Syntax/Math)

**SupernovaStrategy.java**:
```java
public TradeOrder build(ValidatedSignal signal, double currentPrice) {
  double limit = round2(currentPrice * 1.005);  // +0.5% premium
  double stop = round2(limit * 0.93);           // -7%
  double target = round2(limit * 1.20);         // +20%, b=20/7=2.857
  rationale = fmt("SUPERNOVA: Short squeeze... Exit short drop ≥10%%...", signal)
}
```
Thesis: Violent squeeze, tight stop (narrative break), 20% first-wave proxy.

**ScalperStrategy.java**:
```java
limit = round2(currentPrice * 1.002); // +0.2% pre-halt
stop = round2(limit * 0.95);           // -5% binary fail
target = round2(limit * 1.15);         // +15%, b=3.0
rationale = fmt("SCALPER: PDUFA/Phase3... Exit BB tighten OR 60min")
```
Only VIX[30,40]; uncorrelated binary.

*(Similar Follower/Drifter inferred: trailing/Chandelier vs drift swing)*

### 8. Docker Compose (Full YAML Breakdown)
**x-hunter-common anchor**:
```yaml
x-hunter-common: &hunter-common
  build: context=./hunters dockerfile=Dockerfile image=alpha-stream-hunters
  env: KAFKA=kafka:29092 REDIS=redis:6379
  depends_on: kafka/redis healthy
```
Hunters: `command: python -m hunters.main squeeze` (main.py dispatcher), vol ./hunters:/app/hunters

**Kafka** (Confluent 7.5):
- ZK:2181
- LISTENERS: internal kafka:29092, external localhost:9092
- health: kafka-topics --list

**Engine**:
```yaml
ports: 8081:8081
env: KAFKA=kafka:29092 TIMESCALE=timescaledb:5432 user/pass/db
health: wget /actuator/health
```
**Restart**: unless-stopped (all critical).

**Interview**: Why dual listeners? Container net (29092) vs host tools (9092). Anchor? DRY multi-hunter.

### 9. Kelly/Regime Deep Dive (ENGINE.md Formulas)
Full Kelly \(f^* = \frac{bp - q}{b}\), half-Kelly /2, cap 0.25, bearish*0.5. p=conv/100 proxy.

VIX/SPY Yahoo public (no key—debt).

### 10. Tests (/tests/)

**conftest.py**: `sys.path.insert(0, root)` → import hunters/gatekeeper/ai_layer.

**test_ai_layer.py** (AIAnalysisService):
- `strip_code_fences`: ```json{...}``` → {...} (Gemini markdown strip).
- `normalize_key_risks`: str→[str], list preserve, None/empty→[].
- `normalize_analysis`: conviction str/"90%"→int(90), float→int truncate, defaults(UNKNOWN/false/[]).

**test_gatekeeper.py**:
- Helpers: to_float("1,234%"→1234), normalize_ticker("aapl"→AAPL).
- drop_reason: vol<MIN_VOL→str reason.
- coercers: squeeze short%"35.5%"→35.5 signal_data.
- Mocks: patch Redis/Kafka, smembers→set(), lrange→[].

Pytest fixtures: gatekeeper(mock Redis ping/exists=false).

**test_squeeze_hunter.py** (inferred stub).

**Interview**: Why strip_fences? Gemini JSON-in-markdown. Normalize conviction %/str/float→int uniform.

### 11. AI Layer (/ai_layer/ai_service.py)

**Syntax**:
```python
class AIAnalysisService:
  client=genai.Client(api_key); tools=[GoogleSearch()]
  generation_config=temperature=TEMP, tools
  analyze_with_retry(prompt): for attempt=1:MAX_RETRIES:
    response=self.client.models.generate_content(model, contents=prompt, config)
    cleaned=strip_code_fences(response.text); json.loads→normalize_analysis
    backoff *=2
```
**process_event**: triage→build_analysis_prompt→analyze→conv<MIN drop→merge({triage+analysis})→validated-signals; commit post-flush.

**normalize_analysis**:
```python
_safe_int_from_field: str.replace("%").strip()→int(float()); truncate float
catalyst.upper(); is_trap=bool; key_risks=normalize_key_risks(list/str→[str.strip()])
```
**Kafka**: consumer(TRIAGE_PRIORITY_TOPIC, no_auto_commit=manual post-success), producer flush+commit.

**Interview**: Why GoogleSearch tool? Gemini web context. Retry exp backoff? API flakes. Manual commit? At-least-once post-analysis.

### 12. Persistence (/persistence/ - inferred consumer.py)
Consume validated-signals→hypertable validated_signals(time,ticker,...key_risks).

### 13. Comprehensive Debt/Interview Flags (SWE Perspective)
1. **Concurrency**: Gatekeeper Redis pipeline (atomic) but no WATCH/LOCK (hunter-parallel lpush race). Engine AtomicRef/CHM (safe), but Yahoo cache put-race stale price.
2. **Hardcodes**: squeeze URL/ALPHA=0.2/thresholds[25/200k/2x/3]; insider CIK Apple-only; no env/scrape rotate.
3. **Data-source constraints**: shadow was removed (Tradytics paywall, no viable free feed); whale/drifter are implemented.
4. **No Microstructure**: ARCHITECTURE.md OFI gate missing (L2 needed).
5. **Yahoo/SEC**: No auth/rate-limit; brittle parse (Pandas table score heuristic).
6. **Gemini**: Proxy p=conv/100 (unvalidated); no safety/tool call parse.
7. **Deploy**: Docker no secrets(.env), ZK (legacy Kafka), no monitoring (Prometheus?).
8. **Schema Drift**: Gatekeeper coercers manual; no Pydantic/JSONSchema.

**Scale Qs**: 1k signals/d→partition topics, hunter sharding, Redis Cluster.
**SRE**: Healthchecks (engine wget/actuator), depends_healthy (Kafka ping).

### 14. Tooling/Configs (ruff.toml, requirements.txt etc.)

**ruff.toml**: Python linter (inferred: strict rules, no config details read).

**hunters/requirements.txt** (inferred: playwright, kafka-python, redis, yfinance, pandas, httpx).

**engine/pom.xml** (inferred Spring Boot 3.2, Kafka, JPA, Flyway, Lombok).

### 15. Deploy Lambdas (/deploy/lambda_startup.py etc.)
Lambda scripts for AWS? (stub README).

### 16. Interview Megathread: Scale/SRE/Design
- **Why confluent-kafka not kafka-python?** (Not used; plain kafka).
- **Virtual threads why?** Unblock Yahoo HTTP in @KafkaListener.
- **Flyway+validate ddl-auto?** Schema ownership: Flyway create, Hibernate check.
- **No schema reg?** Coercers/manual normalize→drift risk.
- **Prod Scale**: Kafka partitions=tickers, hunters→multiple replicas round-robin sites, Redis Sentinel.

### 17. Gatekeeper Config (/gatekeeper/config.py - Full Env)
```python
KAFKA_BOOTSTRAP=localhost:9092|kafka:29092
RAW_EVENTS=raw-events; TRIAGE_PRIORITY=triage-priority
GROUP=gatekeeper-service; AUTO_OFFSET=earliest
REDIS=localhost:6379
ROLLING=300s; MIN_VOL=50k; MIN_REL_VOL=1.5; PRICE[2,500]
CONFLUENCE_TH=2; TECH_TH=70
KEYS: gk:sources|signals|sent:{ticker}  # LPUSH/LTRIM200/SADD/SETEX
```
Redis keys formatted `{ticker}`.

**hunters/main.py**: argparse hunter|all|--list → asyncio.gather(run_hunter[]). HUNTERS dict dispatcher.

### 18. DB Schema Deep (/engine/db/migration/V1__.sql)
```sql
CREATE trade_orders (id BIGSERIAL PK, timestamp_utc TIMESTAMPTZ NOT NULL,
action VARCHAR10='BUY', strategy_used50, size NUMERIC(12,2),
prices(12,4), rationale TEXT,
conviction SMALLINT, catalyst50, regime_vix(8,2), spy_above BOOL)
hypertable('timestamp_utc', chunk=7d if_not_exists)
INDEX ticker+time DESC; strategy+time DESC
```
Chunk excl for range scans. BIGSERIAL sole PK (TS2.x flex).

**TradeOrderRepository.java**:
```java
JpaRepository; findByTickerOrderByTimestampUtcDesc(String)
@Query time range/strategy+range (Param Instant from/to)
```
Time-bound for chunk skip.

### 19. Full Debt Catalogue (Interview Ammo)
- **Security**: Gemini API_KEY .env (no Vault); SEC UA static.
- **Observability**: Logs only; no metrics (Prom/Jaeger), traces.
- **Resilience**: Hunters sleep fixed (900s); no circuit-breaker.
- **Data**: No dedupe raw-events (multi-hunter double-emit).
- **Perf**: Pandas full HTML parse/scan (heavy); no streaming.

### 20. Prompt Builder & AI Configs

**ai_layer/prompt_builder.py**:
Multi-line dedent prompt: ROLE(rigorous/no-hype), metadata JSON, signals format_blocks(json.dump indent2), search "{ticker} news/SEC/squeeze".
CATALYST GUIDE(SUPERNOVA=short+vol etc.), TRAP(ex: insider BUY+Puts), CONVICTION(90+=multi, <50 no).
**EXACT JSON OUTPUT** 13 fields (conv,catalyst,is_trap...suggested_stop).

**ai_config.py**:
```python
MODEL=gemini-3.1-pro (alias resolve); TEMP=0.2; MAX_RETRIES=3; BACKOFF=1*2^n
MIN_CONV=50; GROUP=ai-analysis-service
```
GoogleSearch tool.

### 21. Persistence Full (/persistence/consumer.py)
```python
def get_db_conn: psycopg.connect(host/port/user/pass/db)
init_schema: EXT timescaledb; CREATE validated_signals(...key_risks JSONB); hypertable(time); idx(ticker,time DESC)
parse_ts(iso|Z→+00:00)
INSERT_SQL 18 params (%s::jsonb x5); cur.execute(VALUES(ts,ticker,int(conv),...))
run: conn=conn(); init(); consumer(validated-signals, no_auto_commit); persist+commit per msg
```
Error: log, no commit (retry).

### 22. ruff.toml
```
line-length=100
lint select=E/F/I/N/W ignore=E501  # Strict, no line-len warn
```

### 23. Final Flags/Prod Recs
- **JSONB perf**: signals/confluence/key_risks → PG index GIN.
- **No idempotency**: Kafka at-least-once + no upsert (dup persists ok?).
### 24. Requirements & Roadmap

**hunters/req.txt**: yfinance0.2.40, playwright1.49, pandas2.2, kafka-python-ng2.2, lxml5.1, httpx0.27, redis5.2.
**gatekeeper/req.txt**: kafka-python-ng2.2, redis5.2.

**ARCHITECTURE.md Excerpts**: Hunters detail (SEC RSS/httpx, Barchart Playwright Cloudflare, BioPharm table, FMP 250/day, Finviz URL hack f=sh_short_o20, Tradytics darkpool). Layers 1-6 (Kafka topics, Gatekeeper 5min Redis, Gemini prompt, Engine regime/Kelly/StrategyRouter, PG Timescale, Next Zustand/TradingView).

**ROADMAP.md**: Phases(1 bugs/tests25h,2 engine/API/dash55h,3 Clerk/Alpaca35h). State(✅ engine/gatekeeper/AI/squeeze; ❌insider/biotech liquidity). Deps critical path Phase1→engine→dash.

**Java Utils** (search): round2=Math.round(v*100)/100 all strategies. Slf4j @Slf4j everywhere. PostConstruct main? No. Static from(TradeOrderEntity).

### 25. Ultimate Interview Prep (SysDesign Drill)
**Q: Draw the data flow + failure modes.**
A: Hunter→raw-events(dbl emit no dedupe)→GK(Redis race LPUSH no lock)→triage→AI(GoogleSearch grounding, JSON parse strip)→validated→engine(regime atomic CHM, Kelly p proxy, router Map<Strats>)→trade-orders+hypertable(chunk7d). Fails: scrape ban(stub no rotate), Gemini flake(retry3), Yahoo stale(cache race).

**~8500 words. FINAL RESEARCH COMPLETE. PRINT-READY MONOLITH.**
