package com.catalyst.engine.consumer;

import com.catalyst.engine.filter.RegimeFilter;
import com.catalyst.engine.filter.RegimeSnapshot;
import com.catalyst.engine.filter.RegimeStatus;
import com.catalyst.engine.model.ValidatedSignal;
import com.catalyst.engine.persistence.TradeOrderRepository;
import com.catalyst.engine.producer.TradeOrderProducer;
import com.catalyst.engine.service.MarketDataService;
import com.catalyst.engine.sizer.KellySizer;
import com.catalyst.engine.strategy.DrifterStrategy;
import com.catalyst.engine.strategy.FollowerStrategy;
import com.catalyst.engine.strategy.ScalperStrategy;
import com.catalyst.engine.strategy.StrategyRouter;
import com.catalyst.engine.strategy.SupernovaStrategy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ValidatedSignalConsumerTest {

    private TradeOrderProducer producer;
    private TradeOrderRepository repository;
    private ValidatedSignalConsumer consumer;

    @BeforeEach
    void setUp() {
        RegimeFilter regimeFilter = mock(RegimeFilter.class);
        when(regimeFilter.getSnapshot()).thenReturn(RegimeSnapshot.builder()
                .status(RegimeStatus.PASS).vix(15).spyPrice(500).spy200Sma(450)
                .spyAbove200Sma(true).capturedAt(Instant.now()).build());
        MarketDataService marketData = mock(MarketDataService.class);
        when(marketData.getCurrentPrice(any())).thenReturn(100.0);
        KellySizer sizer = mock(KellySizer.class);
        when(sizer.calculate(any(), any(), any())).thenReturn(5_000.0);
        StrategyRouter router = new StrategyRouter(List.of(
                new SupernovaStrategy(), new ScalperStrategy(),
                new FollowerStrategy(), new DrifterStrategy()));
        producer = mock(TradeOrderProducer.class);
        repository = mock(TradeOrderRepository.class);
        consumer = new ValidatedSignalConsumer(
                regimeFilter, marketData, router, sizer, producer, repository);
    }

    private static ValidatedSignal signal(String catalyst, String sentiment) {
        ValidatedSignal signal = new ValidatedSignal();
        signal.setTicker("NVDA");
        signal.setCatalystType(catalyst);
        signal.setConvictionScore(80);
        signal.setNewsSentiment(sentiment);
        return signal;
    }

    @Test
    void bullishSignalIsSavedThenPublished() {
        consumer.consume(signal("FOLLOWER", "bullish"));
        verify(repository).save(any());
        verify(producer).send(any());
    }

    @Test
    void bearishSignalProducesNoOrder() {
        consumer.consume(signal("FOLLOWER", "bearish"));
        verify(repository, never()).save(any());
        verify(producer, never()).send(any());
    }

    @Test
    void unknownCatalystProducesNoOrder() {
        consumer.consume(signal("UNKNOWN", "bullish"));
        verify(repository, never()).save(any());
        verify(producer, never()).send(any());
    }

    @Test
    void failedSaveIsRetriedOnRedeliveryAndNeverPublished() {
        when(repository.save(any())).thenThrow(new IllegalStateException("db down")).thenReturn(null);

        assertThrows(IllegalStateException.class, () -> consumer.consume(signal("FOLLOWER", "bullish")));
        verify(producer, never()).send(any());

        consumer.consume(signal("FOLLOWER", "bullish"));
        verify(repository, times(2)).save(any());
        verify(producer, times(1)).send(any());
    }
}
