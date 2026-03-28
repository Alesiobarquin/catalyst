package com.catalyst.engine.producer;

import com.catalyst.engine.model.TradeOrder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.util.concurrent.CompletableFuture;

/**
 * Publishes trade orders to the trade-orders Kafka topic.
 *
 * Uses async send with a completion callback for two reasons:
 *   1. We don't want to block the virtual thread waiting for broker ack
 *      (the persistence call to TimescaleDB runs concurrently).
 *   2. We log failures without crashing — a failed Kafka send should not
 *      roll back the TimescaleDB write. The order is still persisted and
 *      can be re-published via a future reconciliation job.
 *
 * Key routing: message key = ticker symbol.
 * If we ever add multiple partitions to trade-orders, messages for the same
 * ticker will land on the same partition (key-based partitioning), ensuring
 * consumers see them in order per ticker.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class TradeOrderProducer {

    private final KafkaTemplate<String, TradeOrder> kafkaTemplate;

    @Value("${engine.trade-orders-topic}")
    private String topic;

    public void send(TradeOrder order) {
        CompletableFuture<SendResult<String, TradeOrder>> future =
                kafkaTemplate.send(topic, order.getTicker(), order);

        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("[{}] Failed to publish trade order to {}: {}",
                        order.getTicker(), topic, ex.getMessage());
            } else {
                log.info("[{}] Trade order published to {}@partition={}, offset={}",
                        order.getTicker(), topic,
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
            }
        });
    }
}
