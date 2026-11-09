# Al-Qannas Candle Chaser — video-like GOLD M1 moving STOPs (Exness DEMO)

This is a NEW Expert Advisor, not an overwrite of Al-Qannas Gold LIMIT v1.18 or Sniper 2.0. Source: `mt5_bridge/Experts/AlQannas_Candle_Chaser_Gold_M1_Demo.mq5`. It is deliberately isolated using magic number **560179530**.

## Verified video observations (37.6 second user clip, 360x640)

The MetaTrader mobile screen shows **BUY STOP** and **SELL STOP** pending order labels close to the current GOLD M1 quote, followed by **BUY** and **SELL** labels for open trades. Order levels appear at several changing levels as the candle moves. This does **NOT** prove that all entries were directly submitted as MARKET orders: triggered STOP pending orders also become market executions. The actual underlying EA source, exact order-change algorithm, net P/L and broker account history are not visible in the clip. Therefore the project reproduces this **observed style**, not the video's unknown strategy, lot-safety or profitability.

## Execution mechanism

1. Keep one `BUY STOP` above **ASK** and one `SELL STOP` below **BID**, initially 0.20 XAU price units apart from the executable quotes or further if Exness minimum stop levels require.
2. Follow current price: when desired level differs from existing order by at least 0.12 XAU price units, modify its entry and attached broker SL/TP, subject to a 3-second cooldown and broker freeze rules. Unlike the old three-level STOP ladder, it does not stack 3+ pending levels per side.
3. On a broker-confirmed fill, immediately **attempt** to cancel the other pending stop; continue cancel attempts while a position exists. Opposite fills can still both happen in a fast whipsaw or if Exness freezes an order; cancellation is **not atomic**.
4. Prefer an estimated **+$0.65 net USD** early close (after a small assumed cost reserve); use broker TP at estimated +$1.00 net and broker SL designed around **−$1.80** nominal. These are targets, not guarantees: spread, unknown actual commissions, freeze retcode 10029, and slippage may change realized P/L.
5. Limit to 2 confirmed entries per M1 by default, avoid opening a new bracket while any EA position remains, refresh pending orders on a new M1. A reconnect/restart recomputes accepted fills from broker deal history for the current bar.
6. Hard broker/account **DEMO-only check**. The independent bridge EA on H1 is not used for entries. No genuine order-flow feed or guaranteed profitable prediction.

## Starter Inputs

| Setting | Default |
| --- | --- |
| `InpLots` | 0.02 |
| `InpArmDistancePrice` | 0.20 |
| `InpRepriceStepPrice` | 0.12 |
| `InpRepriceCooldownSec` | 3 sec |
| `InpMaxSpreadPrice` | 0.85 XAU |
| `InpCloseNetProfitUsd` | $0.65 estimate |
| `InpBrokerTargetNetUsd` | $1.00 estimate |
| `InpMaxLossUsd` | $1.80 intended nominal cap |
| `InpMaxHoldSec` | 85 sec |
| `InpMaxFillsPerM1` | 2 |
| `InpCancelOnNewBar` | true |
| `InpEnableDailyStop` | false (optional; advisable in demo) |
| `InpDailyStopUsd` | 40 if enabled |

The video appears to show **0.18 lot** labels, but that size is not a recommended or tested starting size. The user's previous screenshots included very large cumulative losses. Raising lot to recover past losses can amplify drawdown.

## Install and verify

1. On Exness DEMO VPS, pause/detach the **old trading EA** on GOLD M1 and review all currently open positions/pending orders in the Trade tab. If an old pending order is frozen, it may not cancel automatically. **Never run both trading EAs together on the same symbol/account**.
2. Open `https://ahmed-gold-watch-free.onrender.com/download-candle-chaser` in Firefox to download `AlQannas_Candle_Chaser_Gold_M1_Demo.mq5` once Render deploy is live.
3. Copy file to `MQL5/Experts/`, open via MetaEditor, **F7 Compile**. Proceed only if there are **0 errors**; static checks cannot compile MQL5.
4. Attach this EA to `XAUUSDm` M1. Set Algo Trading **green**, enable EA trading in Common, and confirm Experts log `AQ_CHASER START v1.00 DEMO ONLY`, followed by `BUY STOP PLACED` and `SELL STOP PLACED`.
5. Check **Trade** tab for broker pending STOP levels tracking price; verify exactly where pending orders filled, that opposing stops were canceled or frozen, and that true net P/L is reflected in History. Executed deals are appended to `MQL5/Files/AlQannas_Candle_Chaser_Deals.csv`.
6. Measure enough executed demo trades with actual commissions, spreads, slippage and time-of-day; no profitable edge or 100% winner behavior has been established. If the broker rejects close/delete/modify with retcode 10029, do not raise lot or retry more aggressively.

Static source regression: `node tests/candle-chaser-mql5-contract.cjs`. No MT5 MetaEditor or Exness demo account is available from the GitHub/Render tools for real compilation and forward trade testing.
