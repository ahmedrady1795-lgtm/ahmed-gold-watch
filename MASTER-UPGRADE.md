# Ahmed Gold Watch - Master Upgrade 3.0

## Included in this single project
- Unified Market Data Hub and canonical `/api/snapshot`.
- Quote priority: fresh Exness/MT5 tick first, Binance Futures XAUUSDT proxy second, Gold-API.com/Twelve Data fallback.
- Multi-timeframe candles: M1, M5, M15, H1.
- Confluence engine using EMA 20/50/200, MACD, RSI, ADX/+DI/-DI, ATR, Bollinger Bands, Stochastic, breakout and market-regime filters.
- Server Trade Journal with D1 binding and memory/local fallback.
- Backtest Pro with multiple historical 5,000-bar chunks, spread/slippage assumptions, and Walk-Forward out-of-sample evaluation.
- `/api/health` watchdog covering hub, journal, MT5 freshness and execution state.
- `/api/execution/signal` requires a fresh MT5 tick before live execution can be allowed.
- Windows/VPS `mt5_bridge/` publishes broker Bid/Ask/tick time, reconnects automatically, deduplicates signals, logs execution quality and can send orders only when explicitly enabled.

## Execution safeguards
Live order execution requires **both** the site switch `MT5_AUTOTRADE_ENABLED=true` and local bridge switch `LIVE_TRADING=true`.

The bridge enforces risk-per-trade limits, daily/weekly loss limits, drawdown and consecutive-loss guards, margin-level guard, spread/tick/slippage checks, cooldown, maximum open positions, broker-side order check and a local KILL_SWITCH file.

## Testing interpretation
Confluence Score and Walk-Forward Stability Score are engineering/test metrics, **not** a probability of winning. Historical news replay is not yet included, so backtest results around major releases need extra caution.

Recommended rollout remains: dry run -> demo -> server journal/forward test -> review a meaningful sample -> only then consider live trading at small risk.
