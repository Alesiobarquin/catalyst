"""
Fetch price, volume, and relative_volume for a ticker via yfinance.
Used by Insider and Biotech hunters to satisfy Gatekeeper liquidity requirements.
"""

import yfinance as yf


def fetch_liquidity_metrics(ticker: str) -> dict | None:
    """
    Fetch price, volume, and relative_volume for a ticker.
    Returns None if data unavailable (OTC, delisted, invalid ticker).
    """
    if not ticker or not str(ticker).strip():
        return None
    symbol = str(ticker).strip().upper()
    try:
        t = yf.Ticker(symbol)
        hist = t.history(period="5d")
        if hist.empty or len(hist) < 1:
            return None
        latest = hist.iloc[-1]
        price = float(latest["Close"])
        volume = int(latest["Volume"])
        avg_vol = hist["Volume"].mean()
        relative_volume = float(volume / avg_vol) if avg_vol and avg_vol > 0 else 0.0
        return {
            "price": price,
            "volume": volume,
            "relative_volume": round(relative_volume, 4),
        }
    except Exception:
        return None
