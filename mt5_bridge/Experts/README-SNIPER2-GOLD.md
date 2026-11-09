# Al-Qannas Sniper 2.0 — Gold M1 LIMIT (Exness DEMO)

**Independent EA:** `mt5_bridge/Experts/AlQannas_Sniper2_Gold_M1_Demo.mq5`. The original `AlQannas_Gold_M1_Limit_Demo.mq5` remains untouched. Dedicated `InpMagic=560179520` and independent MT5 Global Variables/CSV reports. Do NOT attach both EAs to the same GOLD symbol/account simultaneously; for comparison use separate demo accounts or sequential tests.

## Direction and liquidity model

- Uses **24 closed M1** and **12 closed M5** bars. The first valid direction forecast for each live M1 is frozen and checked after that candle closes, avoiding lookahead or repaint of stored predictions.
- Detects a **sell-side liquidity sweep** when the last *closed* M1 penetrated recent lows, reclaimed the prior range and left a meaningful lower rejection wick. The inverse identifies buy-side sweep/upper rejection. A simple breakout is not automatically considered a reversal.
- Combines closed-bar price structure (higher highs/lows), weighted M1/M5 direction, spread-side tick-flow observations, approximate tick-volume imbalance and a **16-bin tick-volume-by-price estimate** (POC). These are proxies: MT5 broker tick volume is **not genuine exchange trade volume or institutional order-flow**.
- Supports three diagnostic contexts: `LIQUIDITY_SWEEP`, `TREND_PULLBACK`, `VOLUME_RETEST`. Weighted signs decide the direction; the algorithm does not require unanimity of M1/M5/tick indicators. It waits for at most **5 seconds** for initial tick observations, then makes its best valid directional forecast.
- Finds the most relevant **nearby** demand/supply retest from recent CLOSED candle wicks, recency and approximate tick volume; it falls back to a close LIMIT when no zone lies within the user-selected distance.
- Locates the nearest opposing high/low liquidity price and can put take profit just **before** it if the possible net gain remains above `InpMinNetTakeUsd` and Exness minimum-stop distance. This is projected price structure, not a guarantee of future orders or available liquidity.

## Default execution and risk

`InpOrderStyle=AQ_LIMIT_PULLBACK` (STOP selection intentionally rejected for this separate bot), `InpLots=0.02`, `InpMaxEntriesPerM1=1`, `InpMaxConcurrent=1`, `InpTakeNetUsd=1.50`, `InpMinNetTakeUsd=1.00`, `InpMaxLossUsd=2.50`, `InpLiquidityBufferPrice=0.05`, `InpMaxZoneSnapPrice=0.50`, `InpMaxDecisionWaitSec=5`, `InpCancelOnNewBar=true`.

These are **intended net-dollar risk/profit estimates**, not guaranteed close prices. The mandatory attached broker SL/TP may not execute exactly at intended prices in a jump/freeze. Exness freeze/requote, spread and broker minimum stop distances still affect actual execution. A LIMIT may never fill if there is no pullback. If the broker's minimum stop is incompatible with the $ risk/lot settings, the EA skips that request, rather than silently widening risk.

`InpEnableDailyStop=false` remains user-selectable and means no default daily loss shutdown. Consider `true` for unattended testing; do not increase volume to recover prior demo losses. Profitability and win-rate are **unverified**. The minimum TP of $1 versus $2.50 nominal stop would require more than 71% winners to break even before unmodeled trading costs.

## Install and verify separately

1. Pause the older EA and inspect all existing GOLD **Trade** positions and pending orders. Replacing/detaching an EA does not necessarily cancel an order the broker has frozen. Keep the H1 read-only MT5 feed bridge if needed.
2. Download the independent file from `https://ahmed-gold-watch-free.onrender.com/download-sniper2` once published. Its filename **must** be `AlQannas_Sniper2_Gold_M1_Demo.mq5`.
3. Place in MetaTrader 5 `MQL5/Experts/`, open in MetaEditor and **F7 Compile**. Proceed only on **0 errors**; static GitHub tests DO NOT perform MQL5 compilation.
4. Attach **only the new EA** to Exness DEMO GOLD M1, check `Allow Algo Trading` and terminal Algo Trading green; confirm Experts starts `Al-Qannas Sniper 2.0 DEMO LIMIT`.
5. Observe `AQ2_SIGNAL`, `AQ2_M1_EVAL`, `AQ2_TRADE_DEAL`, and report files `MQL5/Files/AlQannas_Sniper2_M1_Predictions.csv` and `AlQannas_Sniper2_M1_Trades.csv`. A forecast that correctly called an up/down candle is **not** necessarily a profit for a pending LIMIT trade.
6. Before any larger lot, compare at least 30-50 executed DEMO trades with original v1.18 on separate demo accounts or sequential windows; judge net realized P/L, fills, failed orders, spread, drawdown and frozen close retcodes.

## Tests

`node tests/sniper2-mql5-contract.cjs` checks static invariants only. A real MQL5 MetaEditor compilation and forward demo run are still needed.
