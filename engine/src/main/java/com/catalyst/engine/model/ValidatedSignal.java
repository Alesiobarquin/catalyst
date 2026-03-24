package com.catalyst.engine.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Inbound Kafka payload from the AI Layer (validated-signals topic).
 * Produced by Python — no Spring type headers, plain JSON.
 *
 * Schema reference: docs/schemas.md §2.
 */
@Data
@NoArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class ValidatedSignal {

    private String ticker;

    @JsonProperty("timestamp_utc")
    private String timestampUtc;

    /**
     * Gemini confidence 0–100. Drives Kelly sizing.
     * Below ~50 may produce a negative Kelly fraction (no edge → no trade).
     */
    @JsonProperty("conviction_score")
    private int convictionScore;

    /**
     * One of: SUPERNOVA, SCALPER, FOLLOWER, DRIFTER.
     * Drives strategy routing and regime filtering (SCALPER passes VIX 30–40).
     */
    @JsonProperty("catalyst_type")
    private String catalystType;

    /**
     * Gemini's natural-language narrative, threaded into the trade-order rationale.
     */
    private String rationale;

    /**
     * If true, Gemini detected a "trap" pattern (e.g., insider buy + bearish options flow).
     * Hard stop — never route a trap signal.
     */
    @JsonProperty("is_trap")
    private boolean trap;

    /**
     * Which hunters contributed (e.g., ["squeeze", "insider"]).
     * Used for enriching rationale text; not used in sizing logic.
     */
    @JsonProperty("confluence_sources")
    private List<String> confluenceSources;
}
