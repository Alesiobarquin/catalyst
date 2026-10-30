package com.catalyst.engine.config;

import com.catalyst.engine.model.ValidatedSignal;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.support.serializer.SerializationUtils;
import org.springframework.test.util.ReflectionTestUtils;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class KafkaConfigTest {
    @Test
    @SuppressWarnings("unchecked")
    void listenerExecutorActuallyRunsVirtualThreads() throws Exception {
        ConsumerFactory<String, ValidatedSignal> consumerFactory = mock(ConsumerFactory.class);
        var factory = new KafkaConfig().kafkaListenerContainerFactory(consumerFactory);
        var executor = factory.getContainerProperties().getListenerTaskExecutor();
        var done = new CountDownLatch(1);
        var virtual = new AtomicBoolean();
        executor.execute(() -> { virtual.set(Thread.currentThread().isVirtual()); done.countDown(); });
        assertTrue(done.await(5, TimeUnit.SECONDS));
        assertTrue(virtual.get());
    }

    @Test
    void undecodableRecordIsHandedToErrorHandlerInsteadOfThrowing() {
        var config = new KafkaConfig();
        ReflectionTestUtils.setField(config, "bootstrapServers", "localhost:9092");
        var factory = (DefaultKafkaConsumerFactory<String, ValidatedSignal>) config.consumerFactory();
        var deserializer = factory.getValueDeserializer();
        var headers = new RecordHeaders();

        var nan = "{\"ticker\":\"NVDA\",\"conviction_score\":NaN}".getBytes(StandardCharsets.UTF_8);
        assertNull(deserializer.deserialize("validated-signals", headers, nan));
        assertNotNull(headers.lastHeader(SerializationUtils.VALUE_DESERIALIZER_EXCEPTION_HEADER));

        var valid = "{\"ticker\":\"NVDA\",\"news_sentiment\":\"bearish\"}".getBytes(StandardCharsets.UTF_8);
        var signal = deserializer.deserialize("validated-signals", new RecordHeaders(), valid);
        assertEquals("bearish", signal.getNewsSentiment());
    }
}
