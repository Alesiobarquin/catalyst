package com.catalyst.engine.strategy;

import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Optional;
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
 * Unknown or UNKNOWN catalyst types produce no order: an unclassified setup has
 * no defined entry, stop or target, so sizing it would be invented risk.
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
     * @return             A TradeOrder with entry/stop/target/rationale, or empty when
     *                     no strategy handles the catalyst type.
     *                     recommendedSizeUsd is 0.0 — KellySizer fills it next.
     */
    public Optional<TradeOrder> route(ValidatedSignal signal, double currentPrice) {
        String key = signal.getCatalystType() != null
                ? signal.getCatalystType().toUpperCase()
                : "UNKNOWN";

        Strategy strategy = strategyMap.get(key);

        if (strategy == null) {
            log.info("[{}] No strategy for catalyst_type='{}'. No order.",
                    signal.getTicker(), signal.getCatalystType());
            return Optional.empty();
        }

        log.debug("[{}] Routing to {} strategy", signal.getTicker(), strategy.getClass().getSimpleName());
        return Optional.of(strategy.build(signal, currentPrice));
    }
}
