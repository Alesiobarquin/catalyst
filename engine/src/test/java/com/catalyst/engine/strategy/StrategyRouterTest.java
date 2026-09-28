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

        TradeOrder order = router.route(signal, 100.0);
        assertEquals("Supernova", order.getStrategyUsed());
    }

    @Test
    void routesToScalper() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setCatalystType("SCALPER");
        signal.setTicker("BMRN");

        TradeOrder order = router.route(signal, 100.0);
        assertEquals("Scalper", order.getStrategyUsed());
    }

    @Test
    void routesToFollower() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setCatalystType("FOLLOWER");
        signal.setTicker("AAPL");

        TradeOrder order = router.route(signal, 100.0);
        assertEquals("Follower", order.getStrategyUsed());
    }

    @Test
    void routesToDrifter() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setCatalystType("DRIFTER");
        signal.setTicker("META");

        TradeOrder order = router.route(signal, 100.0);
        assertEquals("Drifter", order.getStrategyUsed());
    }

    @Test
    void handlesFallbackForUnknownType() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setCatalystType("UNKNOWN_TYPE");
        signal.setTicker("XYZ");

        TradeOrder order = router.route(signal, 100.0);
        assertEquals("Fallback", order.getStrategyUsed());
        assertEquals(100.0, order.getLimitPrice(), 0.01);
        assertEquals(95.0, order.getStopLoss(), 0.01);
        assertEquals(110.0, order.getTargetPrice(), 0.01);
        assertTrue(order.getRationale().contains("FALLBACK"));
    }

    @Test
    void handlesFallbackForNullType() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setCatalystType(null);
        signal.setTicker("XYZ");

        TradeOrder order = router.route(signal, 100.0);
        assertEquals("Fallback", order.getStrategyUsed());
    }
}
