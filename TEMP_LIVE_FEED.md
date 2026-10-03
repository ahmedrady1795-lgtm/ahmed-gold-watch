# Temporary live feed mode

- OpenAI/AI assistant removed from the product. The strategy is rules/indicators/news/risk/MT5 only.
- Temporary live source: Binance Futures `XAUUSDT` public market data (no API key).
- Browser quote path: Binance public WebSocket `xauusdt@bookTicker`, with server REST fallback.
- Indicator candles: Binance public REST klines for M1/M5/M15/H1.
- Backtest history: Binance public M5 klines.
- `XAUUSDT` is a USDT-settled perpetual-futures proxy that tracks gold; it is **not** the same instrument or executable price as Exness `XAUUSDm`.
- Fresh MT5/Exness ticks always take priority for the displayed/execution quote once the bridge is connected.
- Real execution remains fail-closed unless a fresh MT5 tick is available and all risk gates pass.
- TradingView remains embedded for visual charting only.
