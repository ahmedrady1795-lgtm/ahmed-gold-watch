# Al-Qannas Gold M1 v1.18 — fast single-LIMIT scalping (Exness DEMO)

The existing MQL5 Expert Advisor now defaults to **one BUY LIMIT or SELL LIMIT order per M1 candle**, with a user-selectable alternative STOP mode. The main objective is to analyze each candle promptly and attempt a close-to-price pullback entry, not wait for multiple confirming indicators. A pending LIMIT may not fill if price never revisits it; one attempted order is not a guaranteed trade or a guaranteed profit.

## What changed in v1.18

- **Early M1 prediction:** use 24 already-closed M1 bars, 12 already-closed M5 bars, current quote/live M1 and the most recent tick direction changes. On each candle the first valid forecast is frozen and then compared with the *completed* M1 candle at the next bar. No lookahead/repainting of archived predictions.
- **Liquidity traps:** detect sweeps of the previous 8 M1 swing highs/lows followed by a reclaimed close, plus rejection wicks.
- **Tick flow and volume by price:** short-term bid/ask changes and tick-volume imbalance are local **proxies**, not institutional/exchange order-flow data. The M1 tick-volume-by-price histogram estimates a high-volume node (POC). Nearest closed-candle support/resistance or POC is considered for a LIMIT, but distant levels are not forced.
- **No overstrict multi-gate:** the fast LIMIT path does not require a minimum prediction score, 8 tick confirmations, or unanimous M5/M1 agreement. Every valid candle gets a forecast and a directional LIMIT candidate, while broker volume, price, spread, SL, account and open-order risk rules still apply.
- **One per M1:** at most one successfully placed LIMIT per candle, even after it fills/closes. The last accepted bar is stored in MT5 terminal GlobalVariables across recompiles/restarts. Maximum pending plus open exposure in LIMIT mode is one, regardless of the STOP ladder slots. Unfilled pending are normally canceled on the next M1 bar, subject to Exness freeze rules.
- **Small-profit exits:** early TP, adjustable stop budget, broker-side SL/TP, early adverse tick-flow exit and optional broker-side profit protection. Brokers may freeze closing or slip through stop/TP; the $ amounts are intended thresholds, not execution guarantees.
- **Bounded online adaptation:** after a predicted M1 candle fully closes, update six local model weights by a small capped logistic adjustment. These weights are persistent across restarts. This is *online statistical adaptation of next-candle direction*, **not** a trained market-making AI feed, and it is not proven to improve profits.
- **Evidence:** forward prediction results are appended to `MQL5/Files/AlQannas_Gold_M1_Predictions.csv`; actual MT5 entry/exit deals (price, volume, net amount) are logged to `MQL5/Files/AlQannas_Gold_Trades.csv` when the broker reports them. Chart status shows forward direction hits and this-bar placed/filled orders. A prediction hit is NOT the same as a profitable filled trade.

## Defaults (all editable in Expert → Inputs)

| Input | Default | Meaning |
| --- | --- | --- |
| `InpOrderStyle` | `AQ_LIMIT_PULLBACK` | BUY LIMIT / SELL LIMIT; STOP breakout optional |
| `InpEntryStyle` | `AQ_FAST` | Legacy setting; fast LIMIT model itself uses no confidence veto |
| `InpLots` | `0.02` | Conservative test volume; higher lot magnifies loss and profit |
| `InpTakeNetUsd` | `1.50` | Target net USD for quick exit; spread already affects floating P/L |
| `InpMaxLossUsd` | `3.00` | Intended nominal worst loss/position; slippage can exceed |
| `InpTrailArmUsd` | `0.90` | Start trying to protect positive profit |
| `InpProfitLockUsd` | `0.50` | Minimum desired protected profit |
| `InpTrailStartUsd` | `1.20` | Start trailing peak profit |
| `InpTrailGivebackUsd` | `0.30` | Peak giveback during trail |
| `InpExitOnTickReversal` | `true` | Exit after major adverse tick reversal at net loss threshold |
| `InpEarlyExitLossUsd` | `1.30` | Early reversal-loss trigger |
| `InpEarlyExitMinAgeSec` | `12` | Minimum time before reversal exit |
| `InpMaxHoldSeconds` | `120` | Timer exit if no other condition triggers |
| `InpMaxConcurrent` | `1` | Maximum combined pending/open; forced to 1 in LIMIT mode |
| `InpMaxEntriesPerM1` | `1` | Successfully placed pending orders per M1 |
| `InpCancelOnNewBar` | `true` | Remove unfilled order at next candle boundary |
| `InpMaxPendingAgeSec` | `55` | Remove older pending orders |
| `InpEntryPullbackRange` | `0.010` | Fraction of recent M1 range toward a near-price limit |
| `InpMaxLimitDistancePrice` | `0.70` | Price-distance bound from executable quote |
| `InpMaxZoneSnapPrice` | `0.45` | Maximum distance to prefer a support/resistance/POC level |
| `InpEnableAdaptiveWeights` | `true` | Update model weights only after predicted candle closes |
| `InpModelLearningRate` | `0.015` | Maximum 0.10, bounded online parameter update |
| `InpEnableDailyStop` | `false` | No default daily loss shutdown (editable) |
| `InpDailyStopUsd` | `40.00` | Only activates if user enables daily stop |

The STOP ladder remains present for backward compatibility but is **not** the intended new mode. Account must be a USD-denominated MetaTrader 5 DEMO account using XAU/GOLD on **M1**. The H1 MT5 bridge continues to be read-only and does not supply EA trading signals. No market *entry* orders are sent: market Buy/Sell may appear in MT5 logs to close filled positions, which is expected.

## Install and verify

1. On the DEMO VPS pause trading and inspect existing **Trade** tab positions and old STOP/LIMIT pending orders. Frozen pending may need manual review; do not assume swapping the EA automatically eliminates them.
2. Download from the same known Firefox attachment URL: **https://ahmed-gold-watch-free.onrender.com/download-gold**. Filename remains `AlQannas_Gold_M1_Limit_Demo.mq5`.
3. Replace the old file in `MQL5/Experts`; open in MetaEditor and **F7 Compile**. Confirm **0 errors**. Re-attach to GOLD M1 (leave H1 read-only bridge running). On **F7 → Inputs**, use **Reset** if prior v1.16/1.17 settings such as large lot or STOP remain; confirm `AQ_LIMIT_PULLBACK`, `0.02`, `$1.50` TP and `$3` stop.
4. Keep **Algo Trading** green and allow EA trading on this chart. Review Experts for `v1.18 LIMIT`, `AQ_M1_FORECAST`, `AQ_M1_EVAL`, successful `BUY LIMIT`/`SELL LIMIT` placements, and actual MT5 fills; check `MQL5/Files` CSV audit logs.
5. Start with small-lot demo. Record at least dozens of *filled* trades across different conditions and evaluate actual **net realized profit, win/loss counts, fill rate and max drawdown** before raising size. A static source-contract check is not a MetaEditor compile, a broker fill test or proof of profitable scalping.

### Critical risk note

Gold M1 short-term scalping with an automated LIMIT per minute and a higher lot has potentially substantial losses. SL, $1.50 TP and profit locking are targets; order freezing, spread, gaps and broker execution may prevent exact exits. `InpEnableDailyStop=false` can allow consecutive losses beyond $40. Consider enabling the daily lock for unattended testing. There is no 100% profitable-entry guarantee.
