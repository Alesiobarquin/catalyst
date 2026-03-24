package com.catalyst.engine.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Fetches and caches market regime data (SPY, VIX) and per-signal prices.
 *
 * Two distinct caches:
 *   1. Regime cache — refreshed every 5 min by @Scheduled. Holds SPY price,
 *      SPY 200-day SMA, and VIX as a single atomic snapshot.
 *   2. Ticker price cache — TTL-based (30 seconds). Prevents hammering Yahoo
 *      Finance when the same ticker appears in burst (confluence events).
 *
 * Data source: Yahoo Finance v8 chart API (free, no API key).
 * Fallback: last known regime snapshot is preserved across failed refreshes.
 */
@Service
@Slf4j
public class MarketDataService {

    private static final String YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";
    private static final String USER_AGENT = "Mozilla/5.0 (compatible; Catalyst/1.0; +https://github.com/catalyst)";
    private static final long PRICE_CACHE_TTL_MS = 30_000;

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    @Value("${engine.regime.refresh-interval-ms:300000}")
    private long refreshIntervalMs;

    /**
     * Holds SPY + VIX data as a single atomic object.
     * Reading three separate volatile fields would create a window where a
     * partial refresh is visible (new VIX, old SPY). AtomicReference eliminates that.
     *
     * Default: benign starting values so the engine isn't in HALT mode before
     * the first successful fetch. If the first fetch fails, we operate optimistically
     * rather than blocking all signals. Appropriate for a recommendation system.
     */
    private final AtomicReference<MarketSnapshot> marketSnapshot = new AtomicReference<>(
            MarketSnapshot.builder()
                    .spyPrice(500.0)
                    .spy200Sma(450.0)
                    .vix(15.0)
                    .capturedAt(Instant.EPOCH) // forces a refresh on first getSnapshot() call
                    .build()
    );

    private final Map<String, PriceCacheEntry> priceCache = new ConcurrentHashMap<>();

    public MarketDataService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.restClient = RestClient.builder()
                .defaultHeader("User-Agent", USER_AGENT)
                .defaultHeader("Accept", "application/json")
                .build();
    }

    @PostConstruct
    public void init() {
        refreshRegimeData();
    }

    /**
     * Refreshes SPY and VIX data on a fixed schedule.
     * fixedDelay means the next refresh starts N ms after the previous one completes,
     * preventing pileup if Yahoo Finance is slow.
     */
    @Scheduled(fixedDelayString = "${engine.regime.refresh-interval-ms:300000}")
    public void refreshRegimeData() {
        try {
            double spyPrice = fetchRawPrice("SPY");
            double spy200Sma = fetchSpy200Sma();
            double vix = fetchRawPrice("%5EVIX"); // ^VIX, URL-encoded

            if (spyPrice <= 0 || vix <= 0) {
                log.warn("Regime refresh: invalid data (SPY={}, VIX={}). Keeping previous snapshot.",
                        spyPrice, vix);
                return;
            }

            marketSnapshot.set(MarketSnapshot.builder()
                    .spyPrice(spyPrice)
                    .spy200Sma(spy200Sma)
                    .vix(vix)
                    .capturedAt(Instant.now())
                    .build());

            log.info("Regime data refreshed — SPY={}, SMA200={}, VIX={}",
                    spyPrice, spy200Sma, vix);

        } catch (Exception e) {
            log.warn("Regime refresh failed — keeping previous snapshot. Error: {}", e.getMessage());
        }
    }

    /**
     * Fetches the current market price for a ticker.
     *
     * Uses a 30-second cache to reduce Yahoo Finance calls during burst scenarios
     * (e.g., confluence event where squeeze + insider both fire on the same ticker
     * within seconds). The cache entry is checked and updated without synchronization —
     * ConcurrentHashMap guarantees visibility, and a race condition that causes two
     * concurrent fetches for the same ticker is benign (both return the same price).
     */
    public double getCurrentPrice(String ticker) {
        PriceCacheEntry cached = priceCache.get(ticker);
        if (cached != null && !cached.isExpired()) {
            log.debug("[{}] Price from cache: {}", ticker, cached.price());
            return cached.price();
        }

        String encodedTicker = ticker.replace("^", "%5E");
        double price = fetchRawPrice(encodedTicker);

        if (price > 0) {
            priceCache.put(ticker, new PriceCacheEntry(price, System.currentTimeMillis()));
        }
        return price;
    }

    public MarketSnapshot getMarketSnapshot() {
        return marketSnapshot.get();
    }

    // -------------------------------------------------------------------------
    // Private fetch methods
    // -------------------------------------------------------------------------

    /**
     * Fetches the latest price for a ticker via Yahoo Finance v8 chart API.
     * Uses meta.regularMarketPrice — the most recent trade price.
     */
    private double fetchRawPrice(String encodedTicker) {
        try {
            String url = YAHOO_BASE + encodedTicker + "?range=1d&interval=1d";
            String json = restClient.get().uri(url).retrieve().body(String.class);

            JsonNode root = objectMapper.readTree(json);
            return root.path("chart")
                    .path("result").get(0)
                    .path("meta")
                    .path("regularMarketPrice")
                    .asDouble(0);
        } catch (Exception e) {
            log.warn("fetchRawPrice failed for {}: {}", encodedTicker, e.getMessage());
            return 0;
        }
    }

    /**
     * Fetches 1 year of daily SPY closes and computes the 200-day simple moving average.
     *
     * Why 1y range? 252 trading days per year > 200 needed for SMA. Even with
     * holidays and weekends stripped, 1y gives us enough data.
     *
     * Why handle nulls? Yahoo Finance occasionally returns null for the most recent
     * close if the market is mid-session (the current bar isn't closed yet). We skip
     * nulls rather than treating them as 0 (which would skew the SMA).
     */
    private double fetchSpy200Sma() throws Exception {
        String url = YAHOO_BASE + "SPY?range=1y&interval=1d";
        String json = restClient.get().uri(url).retrieve().body(String.class);

        JsonNode root = objectMapper.readTree(json);
        JsonNode closes = root.path("chart")
                .path("result").get(0)
                .path("indicators")
                .path("quote").get(0)
                .path("close");

        List<Double> prices = new ArrayList<>();
        for (JsonNode node : closes) {
            if (!node.isNull() && node.asDouble(0) > 0) {
                prices.add(node.asDouble());
            }
        }

        if (prices.size() < 200) {
            log.warn("Insufficient data for SPY 200 SMA: only {} points. Using last known price as proxy.",
                    prices.size());
            return prices.isEmpty() ? 0 : prices.get(prices.size() - 1);
        }

        List<Double> last200 = prices.subList(prices.size() - 200, prices.size());
        return last200.stream().mapToDouble(Double::doubleValue).average().orElse(0);
    }

    // -------------------------------------------------------------------------
    // Inner types
    // -------------------------------------------------------------------------

    @lombok.Value
    @lombok.Builder
    public static class MarketSnapshot {
        double spyPrice;
        double spy200Sma;
        double vix;
        Instant capturedAt;
    }

    private record PriceCacheEntry(double price, long fetchedAtMs) {
        boolean isExpired() {
            return System.currentTimeMillis() - fetchedAtMs > PRICE_CACHE_TTL_MS;
        }
    }
}
