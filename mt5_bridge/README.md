# Ahmed Gold Watch MT5 Bridge

Windows/VPS bridge for MetaTrader 5. It is fail-closed and **dry-run by default**.

## What changed in Master 3.0
- Every polling cycle publishes the latest broker tick (Bid/Ask/time) to `/api/mt5/status`.
- A fresh MT5/Exness tick becomes the website's primary live XAU/USD quote; Binance XAUUSDT is only the temporary proxy feed, with Gold-API.com/Twelve Data as fallbacks.
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

## Telegram alerts
Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the bridge `.env` to receive VPS-side status, entry, execution-blocked, execution-success and recovery alerts even when the website is closed. The Telegram Bot API does not require prepaid API credit. Keep the bot token private.

## Candle synchronization and minimum-lot safety
The bridge uploads closed M1/M5/M15/H1 candles from the broker every ~15 seconds. While that snapshot is fresh, the website computes indicators from the same MT5/Exness market used for execution; Binance remains the fallback. Position sizing never rounds a risk size upward to the broker minimum lot: if the minimum lot would exceed the configured cash-risk budget, the trade is rejected. Blocked attempts are rate-limited per signal.
