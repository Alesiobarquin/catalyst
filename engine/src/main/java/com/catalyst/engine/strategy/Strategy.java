package com.catalyst.engine.strategy;

import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;

/**
 * Contract for all strategy implementations.
 *
 * Each strategy is responsible for:
 *   1. Computing the limit price (entry), stop loss, and target price
 *      from the current market price and signal context.
 *   2. Writing a specific rationale that explains the exit logic.
 *
 * What a strategy does NOT do:
 *   - Size the position (KellySizer does that after routing)
 *   - Check regime state (ValidatedSignalConsumer does that before routing)
 *   - Fetch market data (currentPrice is injected by the consumer)
 *
 * The returned TradeOrder has recommendedSizeUsd=0.0 — the KellySizer fills it
 * after receiving the order with its computed stop and target.
 */
public interface Strategy {

    /**
     * The catalyst type this strategy handles.
     * Used by StrategyRouter to match catalyst_type from the signal.
     * Must match exactly one of: SUPERNOVA, SCALPER, FOLLOWER, DRIFTER.
     */
    String catalystType();

    /**
     * Builds a trade order for the given signal and current market price.
     *
     * @param signal       The validated AI signal (for rationale, ticker, timestamp)
     * @param currentPrice The live market price fetched just before routing
     * @return             A TradeOrder with entry/stop/target/rationale set; size is 0.0
     */
    TradeOrder build(ValidatedSignal signal, double currentPrice);

    /**
     * Rounds a price to 2 decimal places.
     * All prices in the system are USD, 2dp is the standard tick granularity.
     */
    default double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
