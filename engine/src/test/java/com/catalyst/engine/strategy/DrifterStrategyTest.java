package com.catalyst.engine.strategy;

import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class DrifterStrategyTest {

    private final DrifterStrategy strategy = new DrifterStrategy();

    @Test
    void catalystTypeReturnsCorrectString() {
        assertEquals("DRIFTER", strategy.catalystType());
    }

    @Test
    void buildsCorrectOrderCalculations() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setTicker("META");
        signal.setConvictionScore(92);
        signal.setRationale("Earnings beat by 15%");

        double currentPrice = 100.0;
        TradeOrder order = strategy.build(signal, currentPrice);

        assertEquals("META", order.getTicker());
        assertEquals("BUY", order.getAction());
        assertEquals("Drifter", order.getStrategyUsed());
        assertEquals(100.40, order.getLimitPrice(), 0.01); // 100 * 1.004
        assertEquals(92.37, order.getStopLoss(), 0.01); // 100.4 * 0.92 = 92.368 -> 92.37
        assertEquals(118.47, order.getTargetPrice(), 0.01); // 100.4 * 1.18 = 118.472 -> 118.47
    }

    @Test
    void buildsCorrectOrderForLowPrice() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setTicker("SOFI");
        signal.setConvictionScore(80);
        signal.setRationale("Earnings beat");

        double currentPrice = 10.0;
        TradeOrder order = strategy.build(signal, currentPrice);

        assertEquals(10.04, order.getLimitPrice(), 0.01); 
        assertEquals(9.24, order.getStopLoss(), 0.01); // 10.04 * 0.92 = 9.2368 -> 9.24
        assertEquals(11.85, order.getTargetPrice(), 0.01); // 10.04 * 1.18 = 11.8472 -> 11.85
    }
}
