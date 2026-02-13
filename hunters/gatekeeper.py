"""
Layer 2.5: The Gatekeeper (Triage Service)
Role: The Sniper Scope.

This layer acts as a filter between the Hunters (Layer 1) and the AI Analysis (Layer 3).
Its primary goal is to prevent "garbage in, garbage out" significantly reducing API costs
and ensuring only high-quality or confluent signals reach the Brain.

Logic Flow:
1.  **Aggregation (The Wait):**
    -   Consumes messages from `raw-events` Kafka topic.
    -   Holds data in a 5-minute rolling window (using Redis).
    -   Groups signals by Ticker.

2.  **Hard Filters (The Kill):**
    -   Before passing to aggregation, check basic validity.
    -   Liquidity Check: Pre-Market Volume > 50k? (Configurable).
    -   Momentum Check: Relative Volume > 1.5? (Configurable).
    -   If checks fail -> Drop the signal immediately.

3.  **The Trigger Logic (The Release):**
    -   Evaluates the buffered signals for a ticker after the window closes or upon update.
    -   **Trigger Condition 1: Confluence**
        -   Count > 1 (e.g., Squeeze Hunter AND Insider Hunter flagged it).
    -   **Trigger Condition 2: High Conviction**
        -   Technical Score > 70 (if available from source).
    -   **Action:**
        -   If Triggered -> Push to `triage-priority` (or `validated-signals` for Analysis).
        -   If Not Triggered -> Discard or log to `cold-storage`.
"""

import asyncio
import json
import logging
import os
from typing import Dict, List, Optional

# Placeholder for Redis and Kafka clients
# from common.redis_client import redis_client
# from common.kafka_client import producer, consumer

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class Gatekeeper:
    def __init__(self):
        self.rolling_window_seconds = 300  # 5 minutes
        self.min_volume = 50000
        self.min_rvol = 1.5
        self.confluence_threshold = 2
        self.tech_score_threshold = 70
        
        # In-memory buffer for demonstration (Production should use Redis)
        self.signal_buffer: Dict[str, List[Dict]] = {} 

    async def run(self):
        """
        Main loop to consume signals, buffer them, and release based on logic.
        """
        logger.info("Gatekeeper (Layer 2.5) started. Listening for raw events...")
        while True:
            # Mock consuming a message
            # msg = await consumer.get_message()
            # if msg:
            #     await self.process_signal(msg)
            await asyncio.sleep(1) # Prevent busy loop

    async def process_signal(self, signal: Dict):
        ticker = signal.get('ticker')
        if not ticker:
            return

        # 1. Hard Filters (The Kill)
        if not self._passes_hard_filters(signal):
            logger.info(f"Dropped {ticker} due to hard filters.")
            return

        # 2. Aggregation (The Wait)
        # In a real implementation, store in Redis with an expiry
        if ticker not in self.signal_buffer:
            self.signal_buffer[ticker] = []
        self.signal_buffer[ticker].append(signal)
        
        # 3. Trigger Check
        if self._check_trigger(ticker):
            await self.release_signal(ticker)

    def _passes_hard_filters(self, signal: Dict) -> bool:
        """
        Liquidity and Momentum Checks.
        """
        vol = signal.get('volume', 0)
        rvol = signal.get('relative_volume', 0)
        
        if vol < self.min_volume:
            return False
        if rvol < self.min_rvol:
            return False
        return True

    def _check_trigger(self, ticker: str) -> bool:
        """
        Checks for Confluence (>1 source) or High Technical Score.
        """
        signals = self.signal_buffer.get(ticker, [])
        if not signals:
            return False

        # Confluence Check
        sources = set(s.get('source') for s in signals)
        if len(sources) >= self.confluence_threshold:
            return True

        # Technical Score Check (Check max score among signals)
        max_score = max((s.get('technical_score', 0) for s in signals), default=0)
        if max_score > self.tech_score_threshold:
            return True

        return False

    async def release_signal(self, ticker: str):
        """
        Push to next layer.
        """
        logger.info(f"RELEASE: {ticker} passed Gatekeeper. Sending to Brain...")
        # aggregated_data = self._aggregate_data(ticker)
        # await producer.send('validated-signals', aggregated_data)
        
        # Clear buffer after release (or keep for a bit to avoid duplicates?)
        # For now, clear to reset state.
        if ticker in self.signal_buffer:
            del self.signal_buffer[ticker]

if __name__ == "__main__":
    gatekeeper = Gatekeeper()
    asyncio.run(gatekeeper.run())