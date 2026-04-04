#!/usr/bin/env python3
"""
Seed script — inserts realistic mock data into TimescaleDB for dev/demo.

Usage:
    python api/seed.py                           # uses DATABASE_URL env var or default
    DATABASE_URL=postgresql://... python api/seed.py

Safe to run multiple times: truncates trade_orders and validated_signals
before inserting so row counts stay predictable.
"""

import asyncio
import json
import os
from datetime import datetime

import asyncpg

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://catalyst_user:password123@localhost:5432/catalyst_db",
)

TRADE_ORDERS = [
    dict(
        ticker="NVDA", timestamp_utc="2026-03-28T14:35:05Z", action="BUY",
        strategy_used="Supernova", recommended_size_usd=12400,
        limit_price=105.50, stop_loss=98.00, target_price=125.00,
        rationale=(
            "High short interest (31.4%) combined with insider purchase of $2.1M signals "
            "forced covering. Gemini identified active squeeze catalyst with options flow "
            "confirming bullish pressure. Regime clear (VIX 17.8)."
        ),
        conviction_score=92, catalyst_type="SUPERNOVA",
        regime_vix=17.8, spy_above_200sma=True, status="ACTIVE",
    ),
    dict(
        ticker="MRNA", timestamp_utc="2026-03-27T09:12:00Z", action="BUY",
        strategy_used="Scalper", recommended_size_usd=7800,
        limit_price=62.80, stop_loss=59.66, target_price=72.22,
        rationale=(
            "PDUFA date for mRNA-1283 bivalent booster approved by FDA. Phase 3 data "
            "shows 94% efficacy. Binary event with high probability outcome. "
            "Biotech hunter + options sweep confluence."
        ),
        conviction_score=78, catalyst_type="SCALPER",
        regime_vix=28.3, spy_above_200sma=True, status="HIT_TARGET",
    ),
    dict(
        ticker="GME", timestamp_utc="2026-03-26T11:47:22Z", action="BUY",
        strategy_used="Supernova", recommended_size_usd=4200,
        limit_price=22.15, stop_loss=20.60, target_price=26.58,
        rationale=(
            "Short float exceeds 28% with days-to-cover of 6.2. Meme catalyst detected "
            "via Reddit sentiment tagging. Squeeze profile matches prior episodes. "
            "Entry on first intraday breakout."
        ),
        conviction_score=67, catalyst_type="SUPERNOVA",
        regime_vix=19.2, spy_above_200sma=True, status="HIT_STOP",
    ),
    dict(
        ticker="TSLA", timestamp_utc="2026-03-25T13:22:10Z", action="BUY",
        strategy_used="Follower", recommended_size_usd=9600,
        limit_price=178.90, stop_loss=166.38, target_price=203.95,
        rationale=(
            "Strong earnings beat (+28% EPS surprise) combined with delivery record. "
            "SPY above 200 SMA, VIX calm. Momentum continuation setup post-gap. "
            "Follower strategy: trailing Chandelier exit."
        ),
        conviction_score=83, catalyst_type="FOLLOWER",
        regime_vix=16.5, spy_above_200sma=True, status="ACTIVE",
    ),
    dict(
        ticker="COIN", timestamp_utc="2026-03-24T10:05:44Z", action="BUY",
        strategy_used="Drifter", recommended_size_usd=5500,
        limit_price=210.40, stop_loss=195.67, target_price=240.00,
        rationale=(
            "Post-earnings drift detected: EPS beat of 34%, revenue $1.95B vs $1.62B est. "
            "High short float creates additional squeeze potential. 3-week drift window expected."
        ),
        conviction_score=74, catalyst_type="DRIFTER",
        regime_vix=21.0, spy_above_200sma=False, status="ACTIVE",
    ),
    dict(
        ticker="SMCI", timestamp_utc="2026-03-22T15:30:00Z", action="BUY",
        strategy_used="Supernova", recommended_size_usd=8100,
        limit_price=44.20, stop_loss=41.11, target_price=53.04,
        rationale=(
            "Short float 42.1%, days-to-cover 8.7. SEC filing resolved, institutional "
            "re-entry detected. Highest conviction squeeze since March 2024 episode. "
            "Confluence: squeeze + insider buy."
        ),
        conviction_score=91, catalyst_type="SUPERNOVA",
        regime_vix=18.6, spy_above_200sma=True, status="HIT_TARGET",
    ),
    dict(
        ticker="AMZN", timestamp_utc="2026-03-20T09:45:00Z", action="BUY",
        strategy_used="Follower", recommended_size_usd=14000,
        limit_price=195.60, stop_loss=181.91, target_price=222.98,
        rationale=(
            "AWS margin expansion + AI infrastructure spend driving fundamental re-rate. "
            "Momentum regime confirmed with relative volume 3.2x average. "
            "Follower entry on pullback to VWAP."
        ),
        conviction_score=88, catalyst_type="FOLLOWER",
        regime_vix=15.9, spy_above_200sma=True, status="ACTIVE",
    ),
    dict(
        ticker="BBAI", timestamp_utc="2026-03-19T11:00:00Z", action="BUY",
        strategy_used="Supernova", recommended_size_usd=2800,
        limit_price=3.42, stop_loss=3.18, target_price=4.10,
        rationale=(
            "AI defense contract announcement + 67% short float. Micro-cap squeeze "
            "conditions met. Small size due to reduced regime (VIX 32). "
            "High conviction despite elevated volatility."
        ),
        conviction_score=71, catalyst_type="SUPERNOVA",
        regime_vix=32.1, spy_above_200sma=False, status="HIT_STOP",
    ),
    dict(
        ticker="PLTR", timestamp_utc="2026-03-18T13:15:00Z", action="BUY",
        strategy_used="Follower", recommended_size_usd=11200,
        limit_price=87.30, stop_loss=81.19, target_price=99.52,
        rationale=(
            "Government contract expansion in European market. Institutional accumulation "
            "detected via dark pool prints. Momentum regime confirmed, ADX > 25 on daily."
        ),
        conviction_score=86, catalyst_type="FOLLOWER",
        regime_vix=17.2, spy_above_200sma=True, status="ACTIVE",
    ),
    dict(
        ticker="RXRX", timestamp_utc="2026-03-15T09:30:00Z", action="BUY",
        strategy_used="Scalper", recommended_size_usd=3200,
        limit_price=8.65, stop_loss=8.22, target_price=9.95,
        rationale=(
            "NDA submission for RX-112 received FDA Fast Track designation. Phase 3 "
            "interim data positive. Binary event setup with tight stop. "
            "60-minute exit if no follow-through."
        ),
        conviction_score=63, catalyst_type="SCALPER",
        regime_vix=29.8, spy_above_200sma=True, status="HIT_TARGET",
    ),
]

VALIDATED_SIGNALS = [
    dict(
        time="2026-03-28T14:34:00Z", ticker="NVDA", conviction_score=92,
        catalyst_type="SUPERNOVA", is_trap=False,
        rationale=(
            "High short interest (31.4%) combined with insider purchase of $2.1M signals "
            "forced covering. Short squeeze conditions fully met."
        ),
        confluence_count=2,
        confluence_sources=["squeeze", "insider"],
        key_risks=[
            "Market-wide correction could suppress squeeze",
            "Short seller defends position with additional borrows",
        ],
    ),
    dict(
        time="2026-03-27T09:10:00Z", ticker="MRNA", conviction_score=78,
        catalyst_type="SCALPER", is_trap=False,
        rationale="PDUFA date for mRNA-1283 with Phase 3 success. FDA approval probability elevated.",
        confluence_count=2,
        confluence_sources=["biotech", "whale"],
        key_risks=[
            "FDA may request additional data (Complete Response Letter)",
            "Competing product approval in same week",
        ],
    ),
    dict(
        time="2026-03-26T11:45:00Z", ticker="GME", conviction_score=67,
        catalyst_type="SUPERNOVA", is_trap=False,
        rationale="Classic meme squeeze setup. Short float 28%, but retail catalyst weaker than 2021.",
        confluence_count=1,
        confluence_sources=["squeeze"],
        key_risks=["Meme momentum decays rapidly", "No fundamental catalyst underlying squeeze"],
    ),
    dict(
        time="2026-03-25T10:00:00Z", ticker="SPY", conviction_score=41,
        catalyst_type="UNKNOWN", is_trap=True,
        rationale="Index signal with no clear catalyst. Volume spike may be options expiration artifact.",
        confluence_count=1,
        confluence_sources=["squeeze"],
        key_risks=["No directional edge", "Options pinning effect"],
    ),
]


async def seed(dsn: str) -> None:
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute("TRUNCATE TABLE trade_orders")
        await conn.execute("TRUNCATE TABLE validated_signals")
        print("Cleared existing rows.")

        for row in TRADE_ORDERS:
            await conn.execute(
                """
                INSERT INTO trade_orders (
                    ticker, timestamp_utc, action, strategy_used, recommended_size_usd,
                    limit_price, stop_loss, target_price, rationale, conviction_score,
                    catalyst_type, regime_vix, spy_above_200sma, status
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                """,
                row["ticker"],
                datetime.fromisoformat(row["timestamp_utc"].replace("Z", "+00:00")),
                row["action"],
                row["strategy_used"],
                row["recommended_size_usd"],
                row["limit_price"],
                row["stop_loss"],
                row["target_price"],
                row["rationale"],
                row["conviction_score"],
                row["catalyst_type"],
                row.get("regime_vix"),
                row.get("spy_above_200sma"),
                row["status"],
            )
        print(f"Inserted {len(TRADE_ORDERS)} trade orders.")

        for row in VALIDATED_SIGNALS:
            await conn.execute(
                """
                INSERT INTO validated_signals (
                    time, ticker, conviction_score, catalyst_type, is_trap,
                    rationale, confluence_count, confluence_sources, key_risks
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                """,
                datetime.fromisoformat(row["time"].replace("Z", "+00:00")),
                row["ticker"],
                row["conviction_score"],
                row["catalyst_type"],
                row["is_trap"],
                row["rationale"],
                row["confluence_count"],
                json.dumps(row["confluence_sources"]),
                json.dumps(row["key_risks"]),
            )
        print(f"Inserted {len(VALIDATED_SIGNALS)} validated signals.")
        print("Seed complete.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(seed(DATABASE_URL))
