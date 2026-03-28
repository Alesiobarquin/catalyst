package com.catalyst.engine.strategy;

import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Follower: Insider accumulation (Insider Hunter catalyst).
 *
 * Thesis: C-suite insiders buy their own stock when they have asymmetric information.
 * This is the highest-quality signal in the stack — the insider has legal access to
 * material non-public information and is risking their own capital. The trade is
 * slower and more sustained than a squeeze, typically playing out over days to weeks.
 *
 * Entry: 0.3% premium (insider plays are less volatile on entry; no squeeze premium needed).
 * Stop:  Chandelier Exit approximation: −8% from entry.
 *        True Chandelier Exit = Recent High − 3×ATR. Without real-time ATR data,
 *        −8% is a reasonable proxy for a mid-cap name's weekly ATR range.
 *        If real-time OHLCV is added to the pipeline, this should become:
 *        stop = recent_high - 3 * atr_14
 * Target: +12%. Insider plays are directional but measured — not squeeze velocity.
 *         12% captures the "smart money re-rating" phase without overstaying.
 *
 * b = 12 / 8 = 1.5 reward-to-risk ratio.
 *   Note: lower b than Supernova/Scalper, but p is typically higher for insider signals
 *   (CEO buying $5M of their own stock is a strong conviction indicator). Kelly
 *   compensates — the formula's p*b term is what determines the fraction, not b alone.
 *
 * Per ARCHITECTURE.md: exit logic is a Chandelier trailing stop.
 */
@Component
public class FollowerStrategy implements Strategy {

    @Override
    public String catalystType() {
        return "FOLLOWER";
    }

    @Override
    public TradeOrder build(ValidatedSignal signal, double currentPrice) {
        double limitPrice = round2(currentPrice * 1.003);
        double stopLoss   = round2(limitPrice * 0.92);
        double target     = round2(limitPrice * 1.12);

        String rationale = String.format(
                "FOLLOWER: Insider accumulation detected. %s | " +
                "Entry +0.3%% (no squeeze premium, measured entry). " +
                "Stop -8%% (Chandelier proxy: approximates 3×ATR below recent high). " +
                "Target +12%% (smart money re-rating phase). " +
                "Exit trigger: Chandelier trailing stop (tighten as price advances). " +
                "Conviction: %d/100.",
                signal.getRationale(),
                signal.getConvictionScore()
        );

        return TradeOrder.builder()
                .ticker(signal.getTicker())
                .timestampUtc(Instant.now().toString())
                .action("BUY")
                .strategyUsed("Follower")
                .limitPrice(limitPrice)
                .stopLoss(stopLoss)
                .targetPrice(target)
                .rationale(rationale)
                .recommendedSizeUsd(0.0)
                .build();
    }
}
