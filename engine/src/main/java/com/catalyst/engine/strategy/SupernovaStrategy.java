package com.catalyst.engine.strategy;

import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Supernova: Short squeeze setup (Squeeze Hunter catalyst).
 *
 * Thesis: High short interest + insider buy or unusual volume creates a feedback loop.
 * Shorts are forced to cover, driving the price up, which triggers more covering.
 * These moves are violent and fast — the edge lives in the first wave of the squeeze.
 *
 * Entry: slight 0.5% premium above current price to ensure a fill (market-makers
 *        widen spreads on fast-moving names; a limit at the ask often misses).
 * Stop:  −7% below entry. Short squeezes reverse instantly when the narrative breaks.
 *        A 7% stop gets you out before the squeeze turns into a distribution dump.
 * Target: +20% above entry. The first squeeze wave on a heavily-shorted name
 *         typically covers 10–20% before profit-taking kicks in. 20% is conservative.
 *
 * b = 20 / 7 = 2.857 reward-to-risk ratio → feeds Kelly formula.
 *
 * Per ARCHITECTURE.md: exit signal when short interest drops by 10%.
 * This system doesn't have real-time short interest data, so the target price
 * acts as the proxy exit level for the dashboard.
 */
@Component
public class SupernovaStrategy implements Strategy {

    @Override
    public String catalystType() {
        return "SUPERNOVA";
    }

    @Override
    public TradeOrder build(ValidatedSignal signal, double currentPrice) {
        double limitPrice = round2(currentPrice * 1.005);
        double stopLoss   = round2(limitPrice * 0.93);
        double target     = round2(limitPrice * 1.20);

        String rationale = String.format(
                "SUPERNOVA: Short squeeze setup. %s | " +
                "Entry +0.5%% premium ensures fill on momentum. " +
                "Stop -7%% (hard exit if squeeze narrative fails). " +
                "Target +20%% (first squeeze wave). " +
                "Exit trigger: short interest drop ≥10%%. " +
                "Confluence: %s. Conviction: %d/100.",
                signal.getRationale(),
                signal.getConfluenceSources() != null ? signal.getConfluenceSources() : "N/A",
                signal.getConvictionScore()
        );

        return TradeOrder.builder()
                .ticker(signal.getTicker())
                .timestampUtc(Instant.now().toString())
                .action("BUY")
                .strategyUsed("Supernova")
                .limitPrice(limitPrice)
                .stopLoss(stopLoss)
                .targetPrice(target)
                .rationale(rationale)
                .recommendedSizeUsd(0.0) // filled by KellySizer
                .build();
    }
}
