# Al-Qannas Gold v1.17 — LIMIT or STOP from Expert → Inputs

**Default: `InpOrderStyle = AQ_LIMIT_PULLBACK`.** The user reported immediate losses on the v1.16 two-sided STOP ladder due to breakout entries, whipsaw and spread. v1.17 restores BUY LIMIT/SELL LIMIT pullback orders driven by the current M1/M5 local-direction signal, as before v1.16. This is not a guarantee that each entry wins or starts in positive P/L: BID/ASK spread applies at execution.

To try the video-style breakout ladder again without replacing the EA, select `InpOrderStyle = AQ_STOP_BREAKOUT` from MT5 → F7 → Inputs. On switching the mode, the EA tries to delete its pending orders of the *other* type before placing new orders. Broker-frozen orders may delay the switch; check the Trade tab and ensure no old pending orders remain. Open positions continue to be managed.

`InpLots=0.01` default, `InpMaxLossUsd=3.00` intended per-position nominal cap and `InpTakeNetUsd=3.00` default. The user controls the settings; but `InpEnableDailyStop=false` means no daily portfolio cutoff. The 2026-11-09 demo screenshots displayed substantial losses and high lots; do not raise exposure in response to that. Check the broker stop-level and spread. There is **no proven win rate**, backtest or MT5 MetaEditor compile certification from the GitHub static checks alone.

**Direct attachment download** (same Firefox bookmark): https://ahmed-gold-watch-free.onrender.com/download-gold

Steps: on MT5 DEMO, stop new trading, inspect pending orders and broker SL/TP, download the new `.mq5`, replace it in MQL5/Experts, compile in MetaEditor with F7 (requires 0 errors), attach to XAUUSDm M1, verify Experts log contains `v1.17 LIMIT`, and test a handful of trades before extended running. The H1 read-only bridge stays unchanged.

---

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
