package com.catalyst.engine.strategy;

import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class ScalperStrategyTest {

    private final ScalperStrategy strategy = new ScalperStrategy();

    @Test
    void catalystTypeReturnsCorrectString() {
        assertEquals("SCALPER", strategy.catalystType());
    }

    @Test
    void buildsCorrectOrderCalculations() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setTicker("BMRN");
        signal.setConvictionScore(95);
        signal.setRationale("PDUFA date incoming");

        double currentPrice = 100.0;
        TradeOrder order = strategy.build(signal, currentPrice);

        assertEquals("BMRN", order.getTicker());
        assertEquals("BUY", order.getAction());
        assertEquals("Scalper", order.getStrategyUsed());
        assertEquals(100.20, order.getLimitPrice(), 0.01); 
        assertEquals(95.19, order.getStopLoss(), 0.01); 
        assertEquals(115.23, order.getTargetPrice(), 0.01); 
    }

    @Test
    void buildsCorrectOrderForLowPrice() {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setTicker("CRMD");
        signal.setConvictionScore(85);
        signal.setRationale("PDUFA date incoming");

        double currentPrice = 5.0;
        TradeOrder order = strategy.build(signal, currentPrice);

        assertEquals(5.01, order.getLimitPrice(), 0.01); 
        assertEquals(4.76, order.getStopLoss(), 0.01); 
        assertEquals(5.76, order.getTargetPrice(), 0.01); 
    }
}
