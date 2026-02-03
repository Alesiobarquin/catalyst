# Catalyst Data Contracts
We will eventually have all the schema's in here for reference

## 1. Topic: `raw-events`
**Producer:** Python Hunters
**Consumer:** Gemini Service
**Schema:**
```json
{
  "source_hunter": "Hunter_F_Drifter",
  "ticker": "NVDA",
  "timestamp_utc": "2026-02-03T14:30:00Z",
  "raw_signal": {
    "metric": "EPS_SURPRISE",
    "value": 15.4,
    "context": "Beat estimates by $0.15"
  }
}

## 2. Topic: validated-signals
Producer: Gemini Service
Consumer: Java Strategy Engine
Schema:

JSON
{
  "ticker": "NVDA",
  "conviction_score": 92,
  "catalyst_type": "DRIFTER",
  "rationale": "Strong earnings beat + sector momentum.",
  "is_trap": false
}