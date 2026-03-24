package com.catalyst.engine.config;

import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.support.serializer.JsonDeserializer;
import org.springframework.kafka.support.serializer.JsonSerializer;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.util.backoff.FixedBackOff;

import java.util.Map;

@Configuration
public class KafkaConfig {

    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapServers;

    @Value("${engine.trade-orders-topic}")
    private String tradeOrdersTopic;

    /**
     * Auto-create the trade-orders topic on startup.
     * Idempotent — Kafka ignores the request if the topic already exists.
     * Single partition: one engine instance, no consumer-group parallelism needed.
     */
    @Bean
    public NewTopic tradeOrdersTopic() {
        return TopicBuilder.name(tradeOrdersTopic)
                .partitions(1)
                .replicas(1)
                .build();
    }

    /**
     * Consumer factory for validated-signals.
     *
     * Key design decision: explicit ConsumerFactory bean rather than relying
     * solely on application.yml auto-configuration. This lets us wire the
     * JsonDeserializer with the correct target type in code rather than through
     * opaque string properties, which are easy to get wrong.
     *
     * setRemoveTypeHeaders(false) + addTrustedPackages("*"):
     *   The Python producer never attaches Spring's __TypeId__ header.
     *   Passing ValidatedSignal.class to the constructor sets the default target type,
     *   so the deserializer ignores absent headers rather than throwing.
     */
    @Bean
    public ConsumerFactory<String, ValidatedSignal> consumerFactory() {
        JsonDeserializer<ValidatedSignal> deserializer = new JsonDeserializer<>(ValidatedSignal.class);
        deserializer.setRemoveTypeHeaders(false);
        deserializer.addTrustedPackages("*");

        Map<String, Object> props = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers,
                ConsumerConfig.GROUP_ID_CONFIG, "catalyst-engine",
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest"
        );

        return new DefaultKafkaConsumerFactory<>(props, new StringDeserializer(), deserializer);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, ValidatedSignal> kafkaListenerContainerFactory(
            ConsumerFactory<String, ValidatedSignal> consumerFactory) {

        var factory = new ConcurrentKafkaListenerContainerFactory<String, ValidatedSignal>();
        factory.setConsumerFactory(consumerFactory);
        factory.setConcurrency(1);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.RECORD);

        // Retry deserialization failures twice, then log-and-skip.
        // We never want a bad message to halt the consumer loop.
        factory.setCommonErrorHandler(new DefaultErrorHandler(new FixedBackOff(500L, 2L)));

        return factory;
    }

    /**
     * Producer factory for trade-orders.
     * Explicit setup mirrors the consumer: no magic string config.
     * add.type.headers=false keeps the JSON payload clean for downstream consumers
     * (Next.js dashboard, Alpaca integration) that don't speak Spring Kafka.
     */
    @Bean
    public ProducerFactory<String, TradeOrder> producerFactory() {
        Map<String, Object> props = Map.of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers,
                ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class,
                ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class,
                JsonSerializer.ADD_TYPE_INFO_HEADERS, false
        );
        return new DefaultKafkaProducerFactory<>(props);
    }

    @Bean
    public KafkaTemplate<String, TradeOrder> kafkaTemplate(
            ProducerFactory<String, TradeOrder> producerFactory) {
        return new KafkaTemplate<>(producerFactory);
    }
}
