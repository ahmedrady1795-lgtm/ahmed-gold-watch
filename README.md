# Ahmed Gold Command

Rule-based trading command dashboard for gold and Bitcoin monitoring, technical analysis, backtesting/paper trading, and optional MT5/Exness bridge integration.

## Scalp desk (October 8, 2026)
- `/api/scalp` independently updates M1 and M5 opportunities. The H4/M15 forecast is context rather than a scalp veto.
- Uses closed M1/M5 candles for breakouts, pullbacks and liquidity sweeps. New provider OHLC overrides cached unfinished candles. Complete observed Coinbase WebSocket minute bars bridge REST publication delays; the first partial minute and minutes with tick gaps are excluded. Quotes older than 15 seconds, gaps, malformed candles, futures proxies and imminent high-impact news block activation.
- Entry triggers expire after 45 seconds (M1) or 90 seconds (M5). Issued levels remain fixed until cancellation, expiry or settlement; targets do not chase the price.
- Scores describe setup strength, not calibrated success probabilities. Structural targets and projected extensions are labelled separately.
- Paper reference-price outcomes are stored on the existing `/data` volume in `scalp-paper-v1.json`, separately by asset and horizon. T1/stop/time exits include assumed round-trip costs; unknown monitoring intervals never become wins. This is not a broker fill or an execution signal.
- Optional `SCALP_GOLD_FEE_BPS`, `SCALP_BTC_FEE_BPS`, `SCALP_GOLD_SLIPPAGE_BPS`, `SCALP_BTC_SLIPPAGE_BPS` set round-trip basis-point estimates. Defaults: gold 0 fee + 1 slippage bps, BTC 12 fee + 2 slippage bps, plus observed spread. Missing spread uses 2 bps. Estimates are shown explicitly; do not interpret Coinbase reference prices as Exness fills.
- Verify with `node tests/indicators.cjs`, `node tests/scalp.cjs`, and `npm run build`. An optional replay JSON (`[{asset,c1,c5,source,spread,feeBps,slippageBps}]`) can be passed to `node tests/scalp.cjs FILE`.
- Initial short replay: 301 gold M1 bars and 350 BTC bars, fixed parameters and conservative intrabar assumptions. Gold M1: 3 simulated trades, net -0.483R; gold M5: 3 simulated trades, net +0.457R. BTC produced no armed setup after the assumed costs. This is a smoke test, not proof of profitability or a representative backtest.

## Principles
- No OpenAI API and no AI dependency.
- Closed-candle analysis on M1, M5, M15 and H1.
- EMA 20/50/200, RSI, MACD, ADX/+DI/-DI, ATR, Bollinger Bands, Stochastic, breakout and market-regime logic.
- Fail-closed when data is missing, stale, or risk controls are not satisfied.
- Signal states: NO TRADE, WATCH, READY/ENTRY, WARNING and CANCEL.
- Confluence score is not a win probability.

## Safety defaults
- Live trading OFF by default.
- Kill switch ON by default.
- Demo/paper testing before real execution.
- If broker minimum lot would exceed configured risk, the trade is rejected.

## Market data
Binance Futures XAUUSDT may be used as a temporary analytical proxy while MT5 is unavailable. It is not identical to Exness XAUUSDm. Live execution must use fresh broker data from MT5.

## Secrets
Never commit real secrets. Configure environment variables in Vercel or the MT5 VPS.


Required for MT5 bridge:
- MT5_BRIDGE_TOKEN
