export const MARKET_INSTRUMENTS = [
  { ticker: "^GSPC", label: "S&P 500", name: "S&P 500 index", kind: "index" },
  { ticker: "^IXIC", label: "NASDAQ", name: "Nasdaq Composite", kind: "index" },
  { ticker: "^DJI", label: "DOW", name: "Dow Jones Industrial Average", kind: "index" },
  { ticker: "^RUT", label: "RUSSELL", name: "Russell 2000 index", kind: "index" },
  { ticker: "^VIX", label: "VIX", name: "Cboe volatility index", kind: "index" },
  { ticker: "SPY", label: "SPY", name: "S&P 500 ETF", kind: "etf" },
  { ticker: "QQQ", label: "QQQ", name: "Nasdaq 100 ETF", kind: "etf" },
  { ticker: "DIA", label: "DIA", name: "Dow 30 ETF", kind: "etf" },
  { ticker: "IWM", label: "IWM", name: "Russell 2000 ETF", kind: "etf" },
  { ticker: "VOO", label: "VOO", name: "Vanguard S&P 500", kind: "etf" },
  { ticker: "VTI", label: "VTI", name: "Total US stock market", kind: "etf" },
  { ticker: "VEA", label: "VEA", name: "Developed markets", kind: "etf" },
  { ticker: "VWO", label: "VWO", name: "Emerging markets", kind: "etf" },
  { ticker: "TLT", label: "TLT", name: "20+ year Treasury bonds", kind: "etf" },
  { ticker: "HYG", label: "HYG", name: "High-yield corporate bonds", kind: "etf" },
  { ticker: "GLD", label: "GLD", name: "Gold", kind: "etf" },
  { ticker: "XLK", label: "XLK", name: "Technology sector", kind: "etf" },
  { ticker: "XLF", label: "XLF", name: "Financial sector", kind: "etf" },
  { ticker: "XLE", label: "XLE", name: "Energy sector", kind: "etf" },
] as const;

export const MARKET_TAPE_SYMBOLS: string[] = MARKET_INSTRUMENTS.map(({ ticker }) => ticker);
export const CORE_BENCHMARK_SYMBOLS: string[] = ["SPY", "QQQ", "DIA", "IWM"];

export function marketInstrument(ticker: string) {
  return MARKET_INSTRUMENTS.find((instrument) => instrument.ticker === ticker.toUpperCase());
}
