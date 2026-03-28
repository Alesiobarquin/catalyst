package com.catalyst.engine.filter;

import com.catalyst.engine.service.MarketDataService;
import com.catalyst.engine.service.MarketDataService.MarketSnapshot;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Translates raw market data (SPY price, SPY 200 SMA, VIX) into a RegimeStatus.
 *
 * Decision tree (per ARCHITECTURE.md):
 *   VIX ≥ 40           → HALT        (system-wide stop)
 *   30 ≤ VIX < 40      → SCALPER_ONLY (only binary-event biotech signals pass)
 *   VIX < 30, SPY below 200 SMA → PASS_BEARISH (all strategies pass at 50% size)
 *   VIX < 30, SPY above 200 SMA → PASS        (full Kelly size)
 *
 * The snapshot is computed on each call to getSnapshot() from the latest
 * MarketDataService state. No separate scheduler needed — the snapshot is always
 * as fresh as the last MarketDataService refresh.
 *
 * Thread safety: MarketDataService holds its data in an AtomicReference, so the
 * MarketSnapshot we read here is a consistent, fully-constructed object.
 */
@Service
@Slf4j
public class RegimeFilter {

    private final MarketDataService marketDataService;
    private final double vixHaltThreshold;
    private final double vixScalperOnlyThreshold;

    /**
     * Stores the most recently computed snapshot for logging/debugging.
     * Not used for decision-making — getSnapshot() always recomputes from fresh data.
     */
    private final AtomicReference<RegimeSnapshot> lastSnapshot = new AtomicReference<>();

    public RegimeFilter(
            MarketDataService marketDataService,
            @Value("${engine.regime.vix-halt-threshold:40.0}") double vixHaltThreshold,
            @Value("${engine.regime.vix-scalper-only-threshold:30.0}") double vixScalperOnlyThreshold) {
        this.marketDataService = marketDataService;
        this.vixHaltThreshold = vixHaltThreshold;
        this.vixScalperOnlyThreshold = vixScalperOnlyThreshold;
    }

    /**
     * Computes and returns the current regime snapshot.
     *
     * Reads from the MarketDataService's atomic snapshot — this is a single
     * consistent read of (spyPrice, spy200Sma, vix) with no race condition.
     */
    public RegimeSnapshot getSnapshot() {
        MarketSnapshot market = marketDataService.getMarketSnapshot();

        double vix = market.getVix();
        double spyPrice = market.getSpyPrice();
        double spy200Sma = market.getSpy200Sma();
        boolean spyAbove200Sma = spy200Sma > 0 && spyPrice > spy200Sma;

        RegimeStatus status = classify(vix, spyAbove200Sma);

        RegimeSnapshot snapshot = RegimeSnapshot.builder()
                .status(status)
                .vix(vix)
                .spyPrice(spyPrice)
                .spy200Sma(spy200Sma)
                .spyAbove200Sma(spyAbove200Sma)
                .capturedAt(Instant.now())
                .build();

        RegimeSnapshot previous = lastSnapshot.getAndSet(snapshot);
        if (previous == null || previous.getStatus() != status) {
            log.info("Regime status change → {} | VIX={}, SPY={}, SMA200={}, SPY>SMA={}",
                    status, vix, spyPrice, spy200Sma, spyAbove200Sma);
        }

        return snapshot;
    }

    private RegimeStatus classify(double vix, boolean spyAbove200Sma) {
        if (vix >= vixHaltThreshold) {
            return RegimeStatus.HALT;
        }
        if (vix >= vixScalperOnlyThreshold) {
            return RegimeStatus.SCALPER_ONLY;
        }
        if (!spyAbove200Sma) {
            return RegimeStatus.PASS_BEARISH;
        }
        return RegimeStatus.PASS;
    }
}
