package com.catalyst.engine.strategy;

import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class FollowerStrategyTest {

    private final FollowerStrategy strategy = new FollowerStrategy();

    @Test
    void catalystTypeReturnsCorrectString() {
        assertEquals("FOLLOWER", strategy.catalystType());
    }

    @Test
    void buildsCorrectOrderCalculations() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setTicker("AAPL");
        signal.setConvictionScore(88);
        signal.setRationale("CEO insider buy");

        double currentPrice = 100.0;
        TradeOrder order = strategy.build(signal, currentPrice);

        assertEquals("AAPL", order.getTicker());
        assertEquals("BUY", order.getAction());
        assertEquals("Follower", order.getStrategyUsed());
        assertEquals(100.30, order.getLimitPrice(), 0.01); 
        assertEquals(92.28, order.getStopLoss(), 0.01); 
        assertEquals(112.34, order.getTargetPrice(), 0.01); 
    }

    @Test
    void buildsCorrectOrderForLowPrice() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setTicker("PLTR");
        signal.setConvictionScore(82);
        signal.setRationale("Insider accumulation");

        double currentPrice = 20.0;
        TradeOrder order = strategy.build(signal, currentPrice);

        assertEquals(20.06, order.getLimitPrice(), 0.01); 
        assertEquals(18.46, order.getStopLoss(), 0.01); 
        assertEquals(22.47, order.getTargetPrice(), 0.01); 
    }
}
