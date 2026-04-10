package com.catalyst.engine.consumer;

import com.catalyst.engine.filter.RegimeFilter;
import com.catalyst.engine.filter.RegimeSnapshot;
import com.catalyst.engine.filter.RegimeStatus;
import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import com.catalyst.engine.persistence.TradeOrderEntity;
import com.catalyst.engine.persistence.TradeOrderRepository;
import com.catalyst.engine.producer.TradeOrderProducer;
import com.catalyst.engine.service.MarketDataService;
import com.catalyst.engine.sizer.KellySizer;
import com.catalyst.engine.strategy.StrategyRouter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Entry point for the strategy engine pipeline.
 *
 * One message = one full pass through the pipeline:
 *   validated-signal → regime gate → price fetch → strategy → Kelly size → produce + persist
 *
 * Runs on a virtual thread (spring.threads.virtual.enabled=true), so blocking
 * calls to Yahoo Finance during price fetching don't starve the carrier thread pool.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class ValidatedSignalConsumer {

    private final RegimeFilter regimeFilter;
    private final MarketDataService marketDataService;
    private final StrategyRouter strategyRouter;
    private final KellySizer kellySizer;
    private final TradeOrderProducer tradeOrderProducer;
    private final TradeOrderRepository tradeOrderRepository;

    private final ConcurrentHashMap<String, Instant> recentlyProcessed = new ConcurrentHashMap<>();
    private static final Duration COOLDOWN = Duration.ofMinutes(5);

    @KafkaListener(
            topics = "${engine.validated-signals-topic}",
            groupId = "catalyst-engine",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void consume(ValidatedSignal signal) {
        log.info("[{}] Signal received — catalyst={}, conviction={}, trap={}",
                signal.getTicker(), signal.getCatalystType(),
                signal.getConvictionScore(), signal.isTrap());

        // Gate 0: Per-ticker cooldown — prevents duplicate trade orders when
        // the AI layer replays a Kafka message on restart or the gatekeeper
        // forwards the same ticker twice within the rolling window.
        Instant lastProcessed = recentlyProcessed.get(signal.getTicker());
        if (lastProcessed != null && Instant.now().isBefore(lastProcessed.plus(COOLDOWN))) {
            log.info("[{}] Skipping duplicate — already processed within {}-min cooldown window.",
                    signal.getTicker(), COOLDOWN.toMinutes());
            return;
        }
        recentlyProcessed.put(signal.getTicker(), Instant.now());

        // Gate 1: Trap filter — Gemini flagged a conflicting signal pattern.
        // Example: insider buy coinciding with large put volume. Never trade traps.
        if (signal.isTrap()) {
            log.info("[{}] Dropping trap signal.", signal.getTicker());
            return;
        }

        // Gate 2: Regime filter — reads a cached snapshot (refreshed every 5 min).
        // The snapshot is captured atomically, so we use one consistent view of
        // VIX + SPY for this entire signal, even if a refresh happens mid-processing.
        RegimeSnapshot regime = regimeFilter.getSnapshot();

        switch (regime.getStatus()) {
            case HALT -> {
                log.warn("[{}] REGIME HALT — VIX={} ≥ 40. Dropping all signals.",
                        signal.getTicker(), regime.getVix());
                return;
            }
            case SCALPER_ONLY -> {
                if (!"SCALPER".equalsIgnoreCase(signal.getCatalystType())) {
                    log.info("[{}] REGIME SCALPER_ONLY — VIX={}. Dropping {} signal.",
                            signal.getTicker(), regime.getVix(), signal.getCatalystType());
                    return;
                }
            }
            default -> { /* PASS or PASS_BEARISH: continue, Kelly sizer handles the discount */ }
        }

        // Gate 3: Fetch live price. If Yahoo Finance is down, fail safe (skip signal).
        // We never generate a trade order with a stale or zero price.
        double currentPrice = marketDataService.getCurrentPrice(signal.getTicker());
        if (currentPrice <= 0) {
            log.warn("[{}] Could not fetch current price. Skipping signal.", signal.getTicker());
            return;
        }

        // Route to strategy: builds entry, stop, target based on catalyst type.
        TradeOrder order = strategyRouter.route(signal, currentPrice);

        // Kelly sizing: uses the actual stop/target from the strategy for risk/reward ratio.
        // Must happen after routing — we need the prices to compute b = reward/risk.
        double sizeUsd = kellySizer.calculate(signal, order, regime);
        if (sizeUsd <= 0) {
            log.info("[{}] Kelly fraction ≤ 0 — no positive edge at conviction={}. Skipping.",
                    signal.getTicker(), signal.getConvictionScore());
            return;
        }
        order.setRecommendedSizeUsd(Math.round(sizeUsd * 100.0) / 100.0);

        // Publish to trade-orders (consumed by dashboard and future Alpaca integration)
        tradeOrderProducer.send(order);

        // Persist to TimescaleDB with regime context for dashboard history
        tradeOrderRepository.save(TradeOrderEntity.from(order, signal, regime));

        log.info("[{}] Trade order produced — strategy={}, size=${}," +
                        " entry={}, stop={}, target={}, regime={}",
                order.getTicker(), order.getStrategyUsed(), order.getRecommendedSizeUsd(),
                order.getLimitPrice(), order.getStopLoss(), order.getTargetPrice(),
                regime.getStatus());
    }
}
