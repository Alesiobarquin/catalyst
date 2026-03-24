package com.catalyst.engine.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;


import java.time.Instant;
import java.util.List;

/**
 * Spring Data JPA repository for trade_orders (TimescaleDB hypertable).
 *
 * The core save() is inherited from JpaRepository. The custom queries here
 * are written to align with the hypertable's time-series partitioning:
 *   - All WHERE clauses on timestamp_utc allow Timescale's chunk exclusion
 *     to skip irrelevant time chunks (critical for query performance at scale).
 *   - Queries without a time bound would scan all chunks — avoid in production.
 *
 * These methods will be consumed by the Phase 2.2 FastAPI layer (via a separate
 * read service or direct query) and the Phase 2.3 Next.js dashboard.
 */
@Repository
public interface TradeOrderRepository extends JpaRepository<TradeOrderEntity, Long> {

    /**
     * Fetch all orders for a specific ticker, most recent first.
     * Dashboard use case: "show me the trade history for NVDA."
     */
    List<TradeOrderEntity> findByTickerOrderByTimestampUtcDesc(String ticker);

    /**
     * Fetch orders in a time window, most recent first.
     * Dashboard use case: "show last 30 days of recommendations."
     * Time bounds allow TimescaleDB chunk exclusion — only scans relevant chunks.
     */
    @Query("SELECT t FROM TradeOrderEntity t " +
           "WHERE t.timestampUtc >= :from AND t.timestampUtc <= :to " +
           "ORDER BY t.timestampUtc DESC")
    List<TradeOrderEntity> findByTimeRange(
            @Param("from") Instant from,
            @Param("to") Instant to);

    /**
     * Fetch orders by strategy type in a time window.
     * Analytics use case: "how did Supernova signals perform last quarter?"
     */
    @Query("SELECT t FROM TradeOrderEntity t " +
           "WHERE t.strategyUsed = :strategy " +
           "AND t.timestampUtc >= :from AND t.timestampUtc <= :to " +
           "ORDER BY t.timestampUtc DESC")
    List<TradeOrderEntity> findByStrategyAndTimeRange(
            @Param("strategy") String strategy,
            @Param("from") Instant from,
            @Param("to") Instant to);
}
