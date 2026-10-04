package com.catalyst.engine.service;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class MarketDataStatusController {
    private final MarketDataService marketDataService;

    @GetMapping("/market-state")
    public Map<String, Object> marketState() {
        var snapshot = marketDataService.getMarketSnapshot();
        boolean fresh = snapshot.getCapturedAt() != null &&
                Duration.between(snapshot.getCapturedAt(), Instant.now()).toMinutes() <= 15 &&
                snapshot.getSpyPrice() > 0 && snapshot.getSpy200Sma() > 0 && snapshot.getVix() > 0;
        return Map.of("fresh", fresh, "captured_at", snapshot.getCapturedAt() == null ? "" : snapshot.getCapturedAt().toString(),
                "spy", fresh ? snapshot.getSpyPrice() : 0,
                "spy_200_sma", fresh ? snapshot.getSpy200Sma() : 0,
                "vix", fresh ? snapshot.getVix() : 0);
    }
}
