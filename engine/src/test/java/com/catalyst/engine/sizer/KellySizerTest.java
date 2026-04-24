package com.catalyst.engine.sizer;

import com.catalyst.engine.filter.RegimeSnapshot;
import com.catalyst.engine.filter.RegimeStatus;
import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KellySizerTest {

    @Test
    void returnsPositiveSizeForHighConvictionSignal() {
        KellySizer sizer = new KellySizer(100_000, 0.25);

        ValidatedSignal signal = new ValidatedSignal();
        signal.setTicker("NVDA");
        signal.setConvictionScore(85);

        TradeOrder order = TradeOrder.builder()
                .ticker("NVDA")
                .limitPrice(100.0)
                .stopLoss(95.0)
                .targetPrice(112.0)
                .build();

        RegimeSnapshot regime = RegimeSnapshot.builder()
                .status(RegimeStatus.PASS)
                .vix(18.0)
                .spyPrice(500.0)
                .spy200Sma(470.0)
                .spyAbove200Sma(true)
                .capturedAt(Instant.now())
                .build();

        double result = sizer.calculate(signal, order, regime);
        assertTrue(result > 0);
        assertTrue(result <= 25_000);
    }

    @Test
    void halvesSizeInPassBearishRegime() {
        KellySizer sizer = new KellySizer(100_000, 0.25);

        ValidatedSignal signal = new ValidatedSignal();
        signal.setTicker("AAPL");
        signal.setConvictionScore(80);

        TradeOrder order = TradeOrder.builder()
                .ticker("AAPL")
                .limitPrice(100.0)
                .stopLoss(95.0)
                .targetPrice(110.0)
                .build();

        RegimeSnapshot bullRegime = RegimeSnapshot.builder()
                .status(RegimeStatus.PASS)
                .vix(20.0)
                .spyPrice(500.0)
                .spy200Sma(470.0)
                .spyAbove200Sma(true)
                .capturedAt(Instant.now())
                .build();
        RegimeSnapshot bearishRegime = RegimeSnapshot.builder()
                .status(RegimeStatus.PASS_BEARISH)
                .vix(20.0)
                .spyPrice(450.0)
                .spy200Sma(470.0)
                .spyAbove200Sma(false)
                .capturedAt(Instant.now())
                .build();

        double bullSize = sizer.calculate(signal, order, bullRegime);
        double bearishSize = sizer.calculate(signal, order, bearishRegime);
        assertEquals(bullSize * 0.5, bearishSize, 0.0001);
    }
}
