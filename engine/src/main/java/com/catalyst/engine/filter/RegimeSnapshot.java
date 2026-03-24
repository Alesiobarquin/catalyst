package com.catalyst.engine.filter;

import lombok.Builder;
import lombok.Value;

import java.time.Instant;

/**
 * Immutable snapshot of market regime state at a point in time.
 *
 * Why immutable + builder?
 *   RegimeFilter holds this in an AtomicReference. The entire snapshot is replaced
 *   atomically on each refresh — no partial reads where a consumer sees a new VIX
 *   paired with an old SPY price from an in-progress update.
 */
@Value
@Builder
public class RegimeSnapshot {
    RegimeStatus status;
    double vix;
    double spyPrice;
    double spy200Sma;
    boolean spyAbove200Sma;
    Instant capturedAt;
}
