package com.catalyst.engine.config;

import com.catalyst.engine.model.ValidatedSignal;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.ConsumerFactory;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
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
}
