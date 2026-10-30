package com.catalyst.engine.strategy;

import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StrategyRouterTest {

    private StrategyRouter router;

    @BeforeEach
    void setUp() {
        router = new StrategyRouter(Arrays.asList(
                new SupernovaStrategy(),
                new ScalperStrategy(),
                new FollowerStrategy(),
                new DrifterStrategy()
        ));
    }

    @Test
    void routesToSupernova() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setCatalystType("SUPERNOVA");
        signal.setTicker("GME");

        TradeOrder order = router.route(signal, 100.0).orElseThrow();
        assertEquals("Supernova", order.getStrategyUsed());
    }

    @Test
    void routesToScalper() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setCatalystType("SCALPER");
        signal.setTicker("BMRN");

        TradeOrder order = router.route(signal, 100.0).orElseThrow();
        assertEquals("Scalper", order.getStrategyUsed());
    }

    @Test
    void routesToFollower() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setCatalystType("FOLLOWER");
        signal.setTicker("AAPL");

        TradeOrder order = router.route(signal, 100.0).orElseThrow();
        assertEquals("Follower", order.getStrategyUsed());
    }

    @Test
    void routesToDrifter() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setCatalystType("DRIFTER");
        signal.setTicker("META");

        TradeOrder order = router.route(signal, 100.0).orElseThrow();
        assertEquals("Drifter", order.getStrategyUsed());
    }

    @Test
    void unknownTypesProduceNoOrder() {
        for (String type : new String[] {"UNKNOWN", "UNKNOWN_TYPE", null}) {
            ValidatedSignal signal = new ValidatedSignal();
            signal.setCatalystType(type);
            signal.setTicker("XYZ");

            assertTrue(router.route(signal, 100.0).isEmpty(), String.valueOf(type));
        }
    }
}
