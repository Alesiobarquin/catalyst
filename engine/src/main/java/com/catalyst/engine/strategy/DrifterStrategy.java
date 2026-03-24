package com.catalyst.engine.strategy;

import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Drifter: Earnings surprise swing trade (Drifter Hunter catalyst).
 *
 * Thesis: A significant earnings beat (+10% surprise) re-rates the stock fundamentally.
 * Institutional money rotates in over 2–4 weeks as analysts upgrade and funds rebalance.
 * This "earnings drift" effect is well-documented academically (Post-Earnings
 * Announcement Drift, PEAD). The edge is systematic, not event-based.
 *
 * Entry: 0.4% premium (earnings announcements often have wide spreads at open;
 *        slightly more premium than Follower but less than Supernova).
 * Stop:  −8% (wider stop for a multi-day swing trade; normal daily noise is 2–4%).
 * Target: +18% (PEAD studies show 10–25% drift on beats > 10% surprise).
 *
 * b = 18 / 8 = 2.25 reward-to-risk ratio.
 *
 * Per ARCHITECTURE.md: exit if ADX < 25 (trend strength failing = momentum stalling).
 * Without real-time ADX, the target price is the primary exit for the dashboard.
 *
 * VIX sensitivity: Drifter is a swing trade — macro context matters. If VIX rises
 * to SCALPER_ONLY (≥30) after entry, the position should be tightened. This is
 * handled at the strategy level with the stop being tighter than Supernova (−8% vs −7%
 * is intentional — PEAD is slower but requires conviction that the trend holds).
 */
@Component
public class DrifterStrategy implements Strategy {

    @Override
    public String catalystType() {
        return "DRIFTER";
    }

    @Override
    public TradeOrder build(ValidatedSignal signal, double currentPrice) {
        double limitPrice = round2(currentPrice * 1.004);
        double stopLoss   = round2(limitPrice * 0.92);
        double target     = round2(limitPrice * 1.18);

        String rationale = String.format(
                "DRIFTER: Earnings surprise swing (PEAD). %s | " +
                "Entry +0.4%% (post-announcement spread management). " +
                "Stop -8%% (wide stop for multi-day drift). " +
                "Target +18%% (PEAD drift range on 10%%+ beat). " +
                "Exit trigger: ADX < 25 (trend momentum exhaustion). " +
                "Hold horizon: 2–14 days. Conviction: %d/100.",
                signal.getRationale(),
                signal.getConvictionScore()
        );

        return TradeOrder.builder()
                .ticker(signal.getTicker())
                .timestampUtc(Instant.now().toString())
                .action("BUY")
                .strategyUsed("Drifter")
                .limitPrice(limitPrice)
                .stopLoss(stopLoss)
                .targetPrice(target)
                .rationale(rationale)
                .recommendedSizeUsd(0.0)
                .build();
    }
}
