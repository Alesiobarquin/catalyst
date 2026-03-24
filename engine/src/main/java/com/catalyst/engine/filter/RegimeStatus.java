package com.catalyst.engine.filter;

/**
 * The market regime at the time a signal is processed.
 *
 * Thresholds (per ARCHITECTURE.md §Layer 4):
 *   PASS          — VIX < 30 AND SPY > 200-day SMA. Full Kelly size.
 *   PASS_BEARISH  — VIX < 30 AND SPY ≤ 200-day SMA. All strategies pass but size halved.
 *   SCALPER_ONLY  — 30 ≤ VIX < 40. Only SCALPER (binary biotech events) allowed.
 *   HALT          — VIX ≥ 40. System-wide stop. Nothing passes.
 */
public enum RegimeStatus {
    PASS,
    PASS_BEARISH,
    SCALPER_ONLY,
    HALT
}
