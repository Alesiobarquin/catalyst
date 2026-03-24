package com.catalyst.engine.strategy;

import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Scalper: Binary biotech event (PDUFA or Phase 3 data readout).
 *
 * Thesis: Binary events have binary outcomes — the stock moves decisively on the
 * announcement. If Gemini rates this with high conviction (the setup is favorable),
 * the expected move on approval is 15–30%. A 15% target is the conservative take.
 *
 * The key distinction from Supernova: this is time-bounded. PDUFA dates are
 * announced in advance. We enter close to the event and exit within 60 minutes of
 * the announcement — long enough to capture the initial move, short enough to avoid
 * the post-announcement sell-the-news reversal.
 *
 * Entry: very tight 0.2% premium (PDUFA stocks are often halted then gap; we want
 *        to be in before the halt, not chasing after the gap).
 * Stop:  −5% (binary event: if it goes against you, it goes immediately and hard).
 * Target: +15% (FDA approval pops; conservative relative to historical 25–40% pops
 *          but accounts for the fact that approvals are often partially priced in).
 *
 * b = 15 / 5 = 3.0 reward-to-risk ratio.
 *
 * Per ARCHITECTURE.md: exit when Bollinger Bands tighten (momentum exhaustion).
 * Time limit: 60 minutes absolute maximum.
 *
 * This strategy is also the ONLY one that passes in SCALPER_ONLY regime (VIX 30–40).
 * Binary events are uncorrelated with macro volatility — a PDUFA date is a PDUFA date.
 */
@Component
public class ScalperStrategy implements Strategy {

    @Override
    public String catalystType() {
        return "SCALPER";
    }

    @Override
    public TradeOrder build(ValidatedSignal signal, double currentPrice) {
        double limitPrice = round2(currentPrice * 1.002);
        double stopLoss   = round2(limitPrice * 0.95);
        double target     = round2(limitPrice * 1.15);

        String rationale = String.format(
                "SCALPER: Biotech binary event (PDUFA/Phase 3). %s | " +
                "Tight entry +0.2%% (pre-halt positioning). " +
                "Stop -5%% (binary: decisive exit if adverse). " +
                "Target +15%% (conservative FDA approval pop). " +
                "Exit triggers: Bollinger Band tightening OR 60-min time limit. " +
                "Conviction: %d/100.",
                signal.getRationale(),
                signal.getConvictionScore()
        );

        return TradeOrder.builder()
                .ticker(signal.getTicker())
                .timestampUtc(Instant.now().toString())
                .action("BUY")
                .strategyUsed("Scalper")
                .limitPrice(limitPrice)
                .stopLoss(stopLoss)
                .targetPrice(target)
                .rationale(rationale)
                .recommendedSizeUsd(0.0)
                .build();
    }
}
