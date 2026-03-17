import json
from textwrap import dedent


def build_analysis_prompt(triage_payload):
    ticker = triage_payload.get("ticker", "UNKNOWN")
    signal_blocks = format_signal_blocks(triage_payload.get("signals", []))
    metadata_block = json.dumps(
        {
            "ticker": ticker,
            "timestamp_utc": triage_payload.get("timestamp_utc"),
            "confluence_count": triage_payload.get("confluence_count"),
            "confluence_sources": triage_payload.get("confluence_sources", []),
            "liquidity_metrics": triage_payload.get("liquidity_metrics", {}),
        },
        indent=2,
        sort_keys=True,
    )

    return dedent(
        f"""
        ROLE:
        You are a rigorous trading signal analyst for Catalyst. You are not a hype machine.
        Bad analysis costs real money. Only classify what the evidence supports and keep the
        answer grounded in the supplied signals.

        TRIAGE METADATA:
        {metadata_block}

        SIGNAL DATA:
        {signal_blocks}

        CATALYST TYPE GUIDE:
        - SUPERNOVA: high short interest + squeeze conditions + unusual volume
        - SCALPER: imminent binary event (FDA, earnings)
        - FOLLOWER: C-suite insider purchase, large dollar amount
        - DRIFTER: post-earnings beat, swing setup
        - UNKNOWN: cannot classify with confidence

        TRAP GUIDE:
        Set is_trap=true when the signals conflict in a way that makes the setup dangerous.
        Examples:
        - Insider BUY but options flow is Puts
        - High short interest but earnings were catastrophically bad
        - Whale Calls but stock is already up 40%+ and extended
        - Dark pool bullish but insider is selling large blocks

        CONVICTION CALIBRATION:
        - 90-100: Multiple confirming signals, no contradictions
        - 70-89: Strong, most signals align
        - 50-69: Moderate, single dominant signal
        - Below 50: Do not trade
        - If is_trap=true, conviction_score must be below 40

        OUTPUT SCHEMA:
        Return ONLY a JSON object with this exact shape and no markdown:
        {{
          "conviction_score": 0,
          "catalyst_type": "SUPERNOVA|SCALPER|FOLLOWER|DRIFTER|UNKNOWN",
          "is_trap": false,
          "trap_reason": null,
          "rationale": "1-2 sentences explaining the edge",
          "news_sentiment": "bullish|bearish|neutral",
          "risk_level": "low|medium|high|extreme",
          "suggested_timeframe": "scalp|intraday|swing",
          "key_risks": ["string", "string"],
          "raw_signals_summary": "one sentence digest of the hunter data"
        }}
        """
    ).strip()


def format_signal_blocks(signals):
    if not signals:
        return "No accumulated signals were provided."

    blocks = []
    for index, signal in enumerate(signals, start=1):
        source = signal.get("source_hunter", "unknown")
        signal_data = json.dumps(signal.get("signal_data", {}), indent=2, sort_keys=True)
        blocks.append(
            dedent(
                f"""
                Signal {index}:
                Source: {source}
                Payload:
                {signal_data}
                """
            ).strip()
        )
    return "\n\n".join(blocks)
