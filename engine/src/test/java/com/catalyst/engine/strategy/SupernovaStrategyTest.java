package com.catalyst.engine.strategy;

import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SupernovaStrategyTest {

    private final SupernovaStrategy strategy = new SupernovaStrategy();

    @Test
    void catalystTypeReturnsCorrectString() {
        assertEquals("SUPERNOVA", strategy.catalystType());
    }

    @Test
    void buildsCorrectOrderCalculations() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setTicker("GME");
        signal.setConvictionScore(90);
        signal.setRationale("High short interest and insider buying");
        signal.setConfluenceSources(Arrays.asList("Twitter", "Reddit"));

        double currentPrice = 100.0;
        TradeOrder order = strategy.build(signal, currentPrice);

        assertEquals("GME", order.getTicker());
        assertEquals("BUY", order.getAction());
        assertEquals("Supernova", order.getStrategyUsed());
        assertEquals(100.50, order.getLimitPrice(), 0.001); 
        assertEquals(93.47, order.getStopLoss(), 0.01); 
        assertEquals(120.60, order.getTargetPrice(), 0.01); 
    }

    @Test
    void buildsCorrectOrderForLowPrice() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setTicker("PENNY");
        signal.setConvictionScore(80);
        signal.setRationale("Penny stock squeeze");

        double currentPrice = 1.0;
        TradeOrder order = strategy.build(signal, currentPrice);

        // floating point math: 1.0 * 1.005 * 100.0 = 100.499999 -> rounds to 100
        assertEquals(1.00, order.getLimitPrice(), 0.001); 
        assertEquals(0.93, order.getStopLoss(), 0.01); 
        assertEquals(1.20, order.getTargetPrice(), 0.01); 
    }

    @Test
    void buildsCorrectOrderForHighPrice() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setTicker("BRK.A");
        signal.setConvictionScore(75);
        signal.setRationale("Mega cap squeeze");

        double currentPrice = 500000.0;
        TradeOrder order = strategy.build(signal, currentPrice);

        assertEquals(502500.0, order.getLimitPrice(), 0.01); 
        assertEquals(467325.0, order.getStopLoss(), 0.01); 
        assertEquals(603000.0, order.getTargetPrice(), 0.01); 
    }
}
