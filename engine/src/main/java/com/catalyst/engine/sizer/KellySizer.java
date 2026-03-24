package com.catalyst.engine.sizer;

import com.catalyst.engine.filter.RegimeSnapshot;
import com.catalyst.engine.filter.RegimeStatus;
import com.catalyst.engine.model.TradeOrder;
import com.catalyst.engine.model.ValidatedSignal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Computes recommended position size using the Half-Kelly Criterion.
 *
 * Kelly Formula (full):
 *   f* = (p * b - q) / b
 *   where:
 *     p = probability of win (conviction_score / 100)
 *     q = 1 - p (probability of loss)
 *     b = net reward-to-risk ratio = (target - entry) / (entry - stop)
 *
 * Half-Kelly:
 *   f = f* / 2
 *
 * This halving is not arbitrary. Kelly maximizes geometric mean return in theory,
 * but it assumes your estimated 'p' is exactly correct. In practice, Gemini's
 * conviction_score is a model output with its own uncertainty. Half-Kelly accounts
 * for that model risk — it trades ~20% of the max growth rate for a ~40% reduction
 * in drawdown volatility. Standard practice in systematic trading.
 *
 * Position size:
 *   size_usd = portfolio_value * min(half_kelly, max_fraction)
 *
 * max_fraction (default 0.25) is a hard ceiling — even a 95 conviction score
 * can't risk more than 25% of the portfolio on a single name. Prevents the Kelly
 * formula from over-concentrating in "sure things."
 *
 * PASS_BEARISH discount:
 *   When SPY is below its 200-day SMA, the market's structural trend is bearish.
 *   All individual-name setups carry incremental directional risk regardless of
 *   their catalyst. Size is halved as a second-layer risk control.
 */
@Service
@Slf4j
public class KellySizer {

    private final double portfolioValue;
    private final double maxKellyFraction;

    public KellySizer(
            @Value("${engine.portfolio-value:100000}") double portfolioValue,
            @Value("${engine.max-kelly-fraction:0.25}") double maxKellyFraction) {
        this.portfolioValue = portfolioValue;
        this.maxKellyFraction = maxKellyFraction;
    }

    /**
     * @param signal  The inbound signal (provides conviction_score → p)
     * @param order   The partially-built trade order (provides entry, stop, target → b)
     * @param regime  The current market regime (applies PASS_BEARISH size discount)
     * @return Recommended position size in USD, or 0 if the edge is negative.
     */
    public double calculate(ValidatedSignal signal, TradeOrder order, RegimeSnapshot regime) {
        double p = signal.getConvictionScore() / 100.0;
        double q = 1.0 - p;

        double risk = order.getLimitPrice() - order.getStopLoss();
        double reward = order.getTargetPrice() - order.getLimitPrice();

        // Guard against degenerate strategy configurations
        if (risk <= 0 || reward <= 0) {
            log.warn("[{}] Invalid risk/reward: risk={}, reward={}. Using floor size.",
                    signal.getTicker(), risk, reward);
            // Return 1% of portfolio as a floor rather than 0 — the strategy was still
            // selected, it just has a data issue. 1% is survivable.
            return portfolioValue * 0.01;
        }

        double b = reward / risk;
        double fullKelly = (p * b - q) / b;

        // Negative Kelly = the bet has negative expected value at this conviction level.
        // For example: conviction=45%, b=1.5 → f* = (0.45*1.5 - 0.55)/1.5 = -0.183
        // No position should be taken.
        if (fullKelly <= 0) {
            log.info("[{}] Kelly fraction negative ({}): conviction={}, b={}. No edge.",
                    signal.getTicker(), fullKelly, signal.getConvictionScore(), b);
            return 0;
        }

        double halfKelly = fullKelly / 2.0;
        double fraction = Math.min(halfKelly, maxKellyFraction);
        double sizeUsd = portfolioValue * fraction;

        // Bearish regime discount: SPY below 200 SMA = structural headwind.
        // We still trade (the catalyst is real) but at half the normal size.
        if (regime.getStatus() == RegimeStatus.PASS_BEARISH) {
            sizeUsd *= 0.5;
        }

        log.debug("[{}] Kelly: p={}, q={}, b={}, f*={}, f/2={}, capped={}, size=${}, regime={}",
                signal.getTicker(), p, q, b, fullKelly, halfKelly, fraction, sizeUsd,
                regime.getStatus());

        return sizeUsd;
    }
}
