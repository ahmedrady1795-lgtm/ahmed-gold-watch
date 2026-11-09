# Al-Qannas Gold M1 STOP LADDER v1.16 — Exness DEMO

This is an upgrade of the existing MetaTrader 5 EA, NOT a new Render strategy or connection to the dashboard AI.

## The video-style entry logic

- Places **BUY STOP** above current **ASK** and **SELL STOP** below current **BID**.
- Defaults: **0.01 lot**, **3 pending levels on each side**, first level **0.30 XAU price units** above/below current executable quote, with a **0.30 price-unit step**.
- Checks `SYMBOL_TRADE_STOPS_LEVEL` and the broker's allowable order modes. If Exness requires a wider distance, adjust upward or skip; the EA does not violate the server minimum.
- Limits all positions plus pending orders to `InpMaxConcurrent=6`. If the opposite side opens, it attempts to cancel remaining opposite pending stops (`InpCancelOppositeOnFill=true`), but both sides may fill during a sharp whipsaw before cancellation is possible.
- `InpUseSignalFilter=false` avoids the older M1/M5 directional filters that caused long waits. The ladder reacts to breakouts; **it does not predict the future or guarantee winning candles**.
- Replenishes missing levels at configurable batches (minimum 2 seconds between batches), subject to spread/available slots and user permissions.
- Outstanding stops are canceled by the EA after `InpMaxPendingAgeSec=75` seconds, on an optional new-bar cancel, when paused, or when removed. Broker freeze levels can prevent their cancellation temporarily.

## User-controlled Inputs

| Input | Default | Purpose |
| --- | --- | --- |
| `InpLots` | `0.01` | Volume for each order; broker minimum/step rules |
| `InpStopLevelsPerSide` | `3` | How many BUY STOP and SELL STOP ladder levels |
| `InpFirstStopOffsetPrice` | `0.30` | First stop level's price distance |
| `InpStopStepPrice` | `0.30` | Price interval between levels |
| `InpMaxStopDistancePrice` | `1.50` | Hard cap on the distance of a proposed STOP order |
| `InpUseSignalFilter` | `false` | Optional local M1/M5 signal check |
| `InpCancelOppositeOnFill` | `true` | OCO-like cancellation attempt of opposite pending orders |
| `InpMaxConcurrent` | `6` | Pending and open combined |
| `InpMaxEntriesPerM1` | `8` | Maximum successful order placements per minute |
| `InpMinOrderSpacingSec` | `2` | Delay between placement batches |
| `InpMaxPendingAgeSec` | `75` | Cancel pending stops after they age |
| `InpTakeNetUsd` | `3.00` | Estimated TP per position; costs are modeled, not guaranteed |
| `InpMaxLossUsd` | `3.00` | Intended max loss per position via broker SL; gaps/slippage can overrun |
| `InpTrailArmUsd` | `2.00` | Peak net-profit threshold to attempt +$1.50 SL protection |
| `InpProfitLockUsd` | `1.50` | Intended protected profit, not guaranteed |
| `InpEnableDailyStop` | `false` | User may enable daily lock (default remains off per request) |
| `InpManualPause` | `false` | No new positions; tries to cancel pending while still managing open positions |

Other existing risk and execution inputs remain editable. Do **not** increase lot or number of orders to compensate for prior losses.

## Install on the current Windows VPS

1. Before replacing the current EA, review all **Trade** tab open positions and pending orders. The old version may have pending LIMIT orders; an old frozen order may remain and must be checked manually.
2. On Exness **DEMO** MT5, stop new entries and make sure existing positions have correct broker SL/TP. Do not switch EAs with unmanaged live positions.
3. Download `AlQannas_Gold_M1_Limit_Demo.mq5` from the production attachment endpoint `https://ahmed-gold-watch-free.onrender.com/download-gold`. The filename is unchanged so it can replace the old EA, but version v1.16 now sends **STOP** pending orders, not LIMIT.
4. MT5 -> File -> Open Data Folder -> `MQL5/Experts`. Replace the mq5 file; MetaEditor -> open -> **F7 Compile**. The result must report 0 errors. On the GOLD M1 chart, detach old EA and attach the newly compiled `AlQannas_Gold_M1_Limit_Demo` with its new Inputs. Keep the H1 read-only bridge in place.
5. Verify the Experts log: `STOP LADDER v1.16`, `BUY STOP`, `SELL STOP`, and actual pending order tickets. Confirm both order types, broker SL/TP, and resulting fills on Exness demo.
6. No proof of accuracy/profitability has been established; source tests and deployment success do not substitute for MetaEditor compile or a forward demo test.

## Safety and known limitations

- **DEMO-only** hard check; gold symbol and USD account only.
- The original MT5 EA remains local. The Render bridge sends data and doesn't direct real broker entries.
- The **server SL/TP** on each pending stop is intended to limit risk, but freezing, gaps, spread and slippage may produce a worse result. Activating a ladder creates exposure to multiple fills.
- `InpEnableDailyStop=false` allows accumulated losses to continue without daily automated cutoff. Consider enabling it for unattended demo tests.
- The video does not reveal the original bot's secret strategy or true performance. This reproduces its visible breakout STOP-order architecture, not its unknown accuracy or returns.
