package com.catalyst.engine.persistence;

import com.catalyst.engine.filter.RegimeSnapshot;
import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * JPA entity for the trade_orders TimescaleDB hypertable.
 *
 * Design note on BigDecimal vs double:
 *   Price fields use BigDecimal to avoid IEEE 754 floating-point representation
 *   issues (e.g., 0.1 + 0.2 ≠ 0.3 in double). Stop loss and target price are
 *   stored as exact decimals because small rounding errors look sloppy in the
 *   dashboard and break equality checks in tests.
 *
 * Design note on primary key:
 *   TimescaleDB 2.x does not require the partition column (timestamp_utc) in the PK.
 *   Simple BIGSERIAL @Id maps cleanly to Hibernate IDENTITY generation.
 *   timestamp_utc is the hypertable partition key in the migration, not the JPA PK.
 */
@Entity
@Table(name = "trade_orders")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TradeOrderEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "timestamp_utc", nullable = false)
    private Instant timestampUtc;

    @Column(name = "ticker", nullable = false, length = 20)
    private String ticker;

    @Column(name = "action", length = 10)
    private String action;

    @Column(name = "strategy_used", length = 50)
    private String strategyUsed;

    @Column(name = "recommended_size_usd", precision = 12, scale = 2)
    private BigDecimal recommendedSizeUsd;

    @Column(name = "limit_price", precision = 12, scale = 4)
    private BigDecimal limitPrice;

    @Column(name = "stop_loss", precision = 12, scale = 4)
    private BigDecimal stopLoss;

    @Column(name = "target_price", precision = 12, scale = 4)
    private BigDecimal targetPrice;

    @Column(name = "rationale", columnDefinition = "TEXT")
    private String rationale;

    @Column(name = "conviction_score")
    private Short convictionScore;

    @Column(name = "catalyst_type", length = 50)
    private String catalystType;

    @Column(name = "regime_vix", precision = 8, scale = 2)
    private BigDecimal regimeVix;

    @Column(name = "spy_above_200sma")
    private Boolean spyAbove200Sma;

    /**
     * Factory method: assembles an entity from the three objects that exist
     * at the moment of persistence. Keeps consumer code free of field-mapping details.
     */
    public static TradeOrderEntity from(TradeOrder order, ValidatedSignal signal, RegimeSnapshot regime) {
        return TradeOrderEntity.builder()
                .timestampUtc(Instant.parse(order.getTimestampUtc()))
                .ticker(order.getTicker())
                .action(order.getAction())
                .strategyUsed(order.getStrategyUsed())
                .recommendedSizeUsd(BigDecimal.valueOf(order.getRecommendedSizeUsd()))
                .limitPrice(BigDecimal.valueOf(order.getLimitPrice()))
                .stopLoss(BigDecimal.valueOf(order.getStopLoss()))
                .targetPrice(BigDecimal.valueOf(order.getTargetPrice()))
                .rationale(order.getRationale())
                .convictionScore((short) signal.getConvictionScore())
                .catalystType(signal.getCatalystType())
                .regimeVix(BigDecimal.valueOf(regime.getVix()))
                .spyAbove200Sma(regime.isSpyAbove200Sma())
                .build();
    }
}
