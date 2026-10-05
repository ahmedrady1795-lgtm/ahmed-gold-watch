# Ahmed Gold Command

Rule-based trading command dashboard for gold and Bitcoin monitoring, technical analysis, backtesting/paper trading, and optional MT5/Exness bridge integration.

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
