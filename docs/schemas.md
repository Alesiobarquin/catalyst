# Catalyst Data Contracts

This document defines the schemas used across the Catalyst ecosystem. They are designed to convey all minimum necessary context for the Gatekeeper (triage), Gemini (analysis), and Strategy Engine (execution) to make autonomous decisions.

## 1. Topic: `raw-events`
**Producer:** Python Hunters
**Consumer:** Gatekeeper / Gemini Service

### Base Event Standard
All Hunters **MUST** output signals wrapped in this base structure. The `liquidity_metrics` are critical for the **Gatekeeper** to apply hard-filter triage (e.g., dropping low-volume or low-momentum tickers before they rack up Gemini API costs). The `signal_data` object holds Hunter-specific context for **Gemini** to analyze the narrative.

```json
{
  "source_hunter": "string",       // e.g., "insider", "whale", "drifter", "squeeze"
  "ticker": "string",              // e.g., "NVDA"
  "timestamp_utc": "YYYY-MM-DDTHH:MM:SSZ",
  "liquidity_metrics": {           // Required by Gatekeeper Triage
    "price": 105.50,               // Latest price
    "volume": 550000,              // Pre-market or daily volume
    "relative_volume": 1.8         // Ratio of current volume to historical average
  },
  "signal_data": {                 // Hunter-specific attributes (See definitions below)
    ...
  }
}
```

### Hunter-Specific `signal_data` Payloads

#### Squeeze Hunter
Used by Gemini to gauge supernova potential and short panic.
```json
"signal_data": {
  "short_float_pct": 21.32,       // e.g., 21.32 = 21.32%
  "days_to_cover": 4.5,           // Time to exhaust shorts
  "borrow_fee_rate": 15.2         // Cost to borrow (Optional)
}
```

#### Insider Hunter
Used by Gemini to evaluate executive conviction.
```json
"signal_data": {
  "transaction_code": "P",        // 'P' = Purchase, 'S' = Sale
  "transaction_amount_usd": 250000.00,
  "insider_name": "Elon Musk",
  "insider_title": "CEO",
  "shares_traded": 10000
}
```

#### Whale Hunter (Options Flow)
Used by Gemini to identify Smart Money positioning.
```json
"signal_data": {
  "option_type": "Call",          // 'Call' or 'Put'
  "strike_price": 150.00,
  "expiration_date": "2026-03-20",
  "volume": 5000,
  "open_interest": 1000,
  "vol_oi_ratio": 5.0,            // Key momentum validator metric
  "premium_paid_usd": 1250000.00
}
```

#### Biotech Hunter
Used by Gemini to factor in scheduled binary events.
```json
"signal_data": {
  "catalyst_type": "PDUFA",       // or "Phase 3 Data"
  "stage": "Phase 3",
  "drug_name": "ABC-123",
  "event_date": "2026-04-15",
  "notes": "FDA approval decision for Alzheimer's treatment"
}
```

#### Drifter Hunter (Earnings Surprise)
Used by Gemini to establish fundamental shift narratives and swing setups.
```json
"signal_data": {
  "surprise_percent": 15.4,       // Earnings beat percentage
  "eps_estimate": 1.05,
  "eps_actual": 1.21,
  "revenue_estimate": 10000000,
  "revenue_actual": 11500000
}
```

#### Shadow Hunter (Dark Pool)
Used by Gemini to spot hidden liquidity walls and off-exchange institutional accumulation.
```json
"signal_data": {
  "net_value_usd": 150000000.00,
  "block_trade_count": 15,
  "sentiment": "Bullish"          // Estimated from bid/ask fills
}
```

---

## 2. Topic: `validated-signals`
**Producer:** Gemini (The Brain)
**Consumer:** Java Strategy Engine

Generated after the Gatekeeper passes the event to Gemini, and the AI provides a synthetic context rating based on the payload arrays. It explicitly includes confluence data attached by the Gatekeeper.

```json
{
  "ticker": "NVDA",
  "timestamp_utc": "2026-02-03T14:35:00Z",
  "conviction_score": 92,
  "catalyst_type": "SUPERNOVA",
  "rationale": "High short interest + sudden insider buy creates squeeze condition.",
  "is_trap": false,
  "confluence_sources": ["squeeze", "insider"]
}
```

---

## 3. Topic: `trade-orders`
**Producer:** Java Strategy Engine
**Consumer:** Frontend Dashboard / Broker API (Alpaca)

The final actionable trade blueprint. Evaluated using strict probability math (Kelly Criterion, Regime Checks) based on the AI narrative logic.

```json
{
  "ticker": "NVDA",
  "timestamp_utc": "2026-02-03T14:35:05Z",
  "action": "BUY",
  "strategy_used": "Supernova",
  "recommended_size_usd": 12400.00,
  "limit_price": 105.50,
  "stop_loss": 98.00,
  "target_price": 125.00,
  "rationale": "Supernova Pattern identified by Gemini, regime filter passed (VIX < 30)."
}
```