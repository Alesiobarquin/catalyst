package com.catalyst.engine.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

/**
 * Outbound payload to the trade-orders Kafka topic.
 * Also persisted to TimescaleDB via TradeOrderEntity.
 *
 * Schema reference: docs/schemas.md §3.
 */
@Data
@Builder
public class TradeOrder {

    private String ticker;

    @JsonProperty("timestamp_utc")
    private String timestampUtc;

    /** Always "BUY" in this pipeline (no short strategies implemented). */
    private String action;

    @JsonProperty("strategy_used")
    private String strategyUsed;

    /**
     * Half-Kelly position size in USD.
     * Computed after strategy routing so the actual risk/reward ratio
     * from the strategy's stop and target can feed the Kelly formula.
     */
    @JsonProperty("recommended_size_usd")
    private double recommendedSizeUsd;

    @JsonProperty("limit_price")
    private double limitPrice;

    @JsonProperty("stop_loss")
    private double stopLoss;

    @JsonProperty("target_price")
    private double targetPrice;

    private String rationale;
}
