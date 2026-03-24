package com.catalyst.engine.strategy;

import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Routes a validated signal to the appropriate strategy based on catalyst_type.
 *
 * Uses a Map<String, Strategy> keyed by catalystType() — built at startup from
 * the list of all Strategy beans injected by Spring. This is the classic
 * "Strategy Pattern + Spring dependency injection" approach:
 *   - No switch statement
 *   - Adding a new strategy = implementing Strategy + @Component. Zero changes here.
 *   - Testable: mock any individual strategy without touching the router
 *
 * Unknown catalyst types are handled with a FALLBACK trade order (action=SKIP).
 * We never throw — a bad catalyst_type from Gemini shouldn't halt the consumer loop.
 */
@Service
@Slf4j
public class StrategyRouter {

    private final Map<String, Strategy> strategyMap;

    public StrategyRouter(List<Strategy> strategies) {
        this.strategyMap = strategies.stream()
                .collect(Collectors.toMap(
                        s -> s.catalystType().toUpperCase(),
                        Function.identity()
                ));
        log.info("StrategyRouter initialized with {} strategies: {}",
                strategyMap.size(), strategyMap.keySet());
    }

    /**
     * Routes the signal to a strategy and builds a trade order.
     *
     * @param signal       The validated signal from the AI layer
     * @param currentPrice The live market price, fetched before this call
     * @return             A TradeOrder with entry/stop/target/rationale.
     *                     recommendedSizeUsd is 0.0 — KellySizer fills it next.
     */
    public TradeOrder route(ValidatedSignal signal, double currentPrice) {
        String key = signal.getCatalystType() != null
                ? signal.getCatalystType().toUpperCase()
                : "UNKNOWN";

        Strategy strategy = strategyMap.get(key);

        if (strategy == null) {
            log.warn("[{}] No strategy for catalyst_type='{}'. Using fallback.",
                    signal.getTicker(), signal.getCatalystType());
            return buildFallback(signal, currentPrice);
        }

        log.debug("[{}] Routing to {} strategy", signal.getTicker(), strategy.getClass().getSimpleName());
        return strategy.build(signal, currentPrice);
    }

    /**
     * Fallback order for unrecognized catalyst types.
     *
     * Using a 5%/10% stop/target with action=BUY rather than throwing.
     * The rationale makes it explicit that this was an unrouted signal.
     * The dashboard will show it; the Kelly sizer will still size it;
     * it will still persist. The operator can investigate from there.
     */
    private TradeOrder buildFallback(ValidatedSignal signal, double currentPrice) {
        double limit  = Math.round(currentPrice * 100.0) / 100.0;
        double stop   = Math.round(currentPrice * 0.95 * 100.0) / 100.0;
        double target = Math.round(currentPrice * 1.10 * 100.0) / 100.0;

        return TradeOrder.builder()
                .ticker(signal.getTicker())
                .timestampUtc(Instant.now().toString())
                .action("BUY")
                .strategyUsed("Fallback")
                .limitPrice(limit)
                .stopLoss(stop)
                .targetPrice(target)
                .rationale(String.format(
                        "FALLBACK: Unrecognized catalyst_type='%s'. " +
                        "Conservative 5%% stop, 10%% target applied. " +
                        "Review signal: %s",
                        signal.getCatalystType(), signal.getRationale()))
                .recommendedSizeUsd(0.0)
                .build();
    }
}
