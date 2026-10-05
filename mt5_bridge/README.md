# Ahmed Gold Watch MT5 Bridge

Windows/VPS bridge for MetaTrader 5. It is fail-closed and **dry-run by default**.

## What changed in Master 3.0
- Every polling cycle publishes the latest broker tick (Bid/Ask/time) to `/api/mt5/status`.
- A fresh MT5/Exness tick becomes the website's primary live XAU/USD quote; the website uses non-Binance gold providers as fallbacks.
- The site execution endpoint refuses live execution if the MT5 tick is not fresh.
- Execution attempts are written to the server Trade Journal when available.
- Account credentials remain on the Windows/VPS machine; only sanitized tick/account-health fields are sent to the site.

## Setup
1. Install MetaTrader 5 and log in to the intended Exness account.
2. Copy `.env.example` to `.env` and fill `SITE_URL`, `MT5_BRIDGE_TOKEN`, and the broker symbol (default `XAUUSDm`).
3. Install `requirements.txt`.
4. Keep `LIVE_TRADING=false` for dry-run/forward testing.
5. Run `run_bridge.bat`.

Two switches are required before a real order can be sent: `MT5_AUTOTRADE_ENABLED=true` on the site and `LIVE_TRADING=true` on the bridge. A local `KILL_SWITCH` file stops new orders immediately.

## Candle synchronization and minimum-lot safety
The bridge uploads closed M1/M5/M15/H1 candles from the broker every ~15 seconds. While that snapshot is fresh, the website computes indicators from the same MT5/Exness market used for execution. Position sizing never rounds a risk size upward to the broker minimum lot: if the minimum lot would exceed the configured cash-risk budget, the trade is rejected. Blocked attempts are rate-limited per signal.


## Fast scalp learning demo
Set `SCALP_DEMO_MODE=true` while `LIVE_TRADING=false`. The bridge polls the demo-only scalp endpoint, opens a virtual trade only after Ambush V10 approves it, and uses a quick-capture exit profile.

The quick-capture profile defaults to a short maximum hold, a take-profit sized above the live spread, a nearby stop, profit-lock after a favorable move, and immediate exits when flow weakens or flips. Entry confidence rises automatically after a losing streak. All demo results are journaled with net points, win rate, profit factor, best excursion, and worst excursion.

Recommended starting values are already included in `.env.example`: 12-second max hold, 66 minimum confidence, TP about 2.2× spread, SL about 1.6× spread, and a trailing profit-lock. These are forward-test parameters, not guaranteed-profit settings.

Keep `LIVE_TRADING=false` until a meaningful demo sample shows positive net points after spread, profit factor above 1, and controlled loss streaks.