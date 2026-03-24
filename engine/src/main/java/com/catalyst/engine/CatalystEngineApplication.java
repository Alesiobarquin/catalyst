package com.catalyst.engine;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling  // Required for @Scheduled in MarketDataService
public class CatalystEngineApplication {

    public static void main(String[] args) {
        SpringApplication.run(CatalystEngineApplication.class, args);
    }
}
