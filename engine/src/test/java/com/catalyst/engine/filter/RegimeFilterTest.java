package com.catalyst.engine.filter;

import com.catalyst.engine.service.MarketDataService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RegimeFilterTest {

    private StubMarketDataService marketDataService;
    private RegimeFilter regimeFilter;

    static class StubMarketDataService extends MarketDataService {
        private MarketSnapshot snapshot;

        public StubMarketDataService() {
            super(new com.fasterxml.jackson.databind.ObjectMapper());
        }

        public void setSnapshot(MarketSnapshot snapshot) {
            this.snapshot = snapshot;
        }

        @Override
        public MarketSnapshot getMarketSnapshot() {
            return snapshot;
        }
    }

    @BeforeEach
    void setUp() {
        marketDataService = new StubMarketDataService();
        // Using the default thresholds
        regimeFilter = new RegimeFilter(marketDataService, 40.0, 30.0);
    }

    @Test
    void returnsHaltWhenVixAbove40() {
        MarketDataService.MarketSnapshot snapshot = MarketDataService.MarketSnapshot.builder()
                .vix(40.5)
                .spyPrice(500.0)
                .spy200Sma(450.0)
                .build();
        marketDataService.setSnapshot(snapshot);

        RegimeSnapshot result = regimeFilter.getSnapshot();
        assertEquals(RegimeStatus.HALT, result.getStatus());
    }

    @Test
    void returnsScalperOnlyWhenVixBetween30And40() {
        MarketDataService.MarketSnapshot snapshot = MarketDataService.MarketSnapshot.builder()
                .vix(35.0)
                .spyPrice(500.0)
                .spy200Sma(450.0)
                .build();
        marketDataService.setSnapshot(snapshot);

        RegimeSnapshot result = regimeFilter.getSnapshot();
        assertEquals(RegimeStatus.SCALPER_ONLY, result.getStatus());
    }

    @Test
    void returnsPassBearishWhenSpyBelowSma() {
        MarketDataService.MarketSnapshot snapshot = MarketDataService.MarketSnapshot.builder()
                .vix(25.0)
                .spyPrice(440.0)
                .spy200Sma(450.0)
                .build();
        marketDataService.setSnapshot(snapshot);

        RegimeSnapshot result = regimeFilter.getSnapshot();
        assertEquals(RegimeStatus.PASS_BEARISH, result.getStatus());
    }

    @Test
    void returnsPassWhenSpyAboveSma() {
        MarketDataService.MarketSnapshot snapshot = MarketDataService.MarketSnapshot.builder()
                .vix(25.0)
                .spyPrice(460.0)
                .spy200Sma(450.0)
                .build();
        marketDataService.setSnapshot(snapshot);

        RegimeSnapshot result = regimeFilter.getSnapshot();
        assertEquals(RegimeStatus.PASS, result.getStatus());
    }

    @Test
    void boundaryConditionVixAtExactly40() {
        MarketDataService.MarketSnapshot snapshot = MarketDataService.MarketSnapshot.builder()
                .vix(40.0)
                .spyPrice(500.0)
                .spy200Sma(450.0)
                .build();
        marketDataService.setSnapshot(snapshot);

        RegimeSnapshot result = regimeFilter.getSnapshot();
        assertEquals(RegimeStatus.HALT, result.getStatus());
    }

    @Test
    void boundaryConditionVixAt39_99() {
        MarketDataService.MarketSnapshot snapshot = MarketDataService.MarketSnapshot.builder()
                .vix(39.99)
                .spyPrice(500.0)
                .spy200Sma(450.0)
                .build();
        marketDataService.setSnapshot(snapshot);

        RegimeSnapshot result = regimeFilter.getSnapshot();
        assertEquals(RegimeStatus.SCALPER_ONLY, result.getStatus());
    }
    
    @Test
    void boundaryConditionVixAtExactly30() {
        MarketDataService.MarketSnapshot snapshot = MarketDataService.MarketSnapshot.builder()
                .vix(30.0)
                .spyPrice(500.0)
                .spy200Sma(450.0)
                .build();
        marketDataService.setSnapshot(snapshot);

        RegimeSnapshot result = regimeFilter.getSnapshot();
        assertEquals(RegimeStatus.SCALPER_ONLY, result.getStatus());
    }

    @Test
    void boundaryConditionVixAt29_99() {
        MarketDataService.MarketSnapshot snapshot = MarketDataService.MarketSnapshot.builder()
                .vix(29.99)
                .spyPrice(500.0)
                .spy200Sma(450.0)
                .build();
        marketDataService.setSnapshot(snapshot);

        RegimeSnapshot result = regimeFilter.getSnapshot();
        assertEquals(RegimeStatus.PASS, result.getStatus());
    }
}
