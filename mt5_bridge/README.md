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

Live broker trading is intentionally **disabled** in this candidate: the legacy execution route sends Market orders, contrary to the requested Limit-only behavior. The two historical live switches are not sufficient to enable it. The local `KILL_SWITCH` still stops new demo entries. Real orders require a separately validated MT5 demo pending-Limit executor.

## Candle synchronization and minimum-lot safety
The bridge uploads closed M1/M5/M15/H1 candles from the broker every ~15 seconds. While that snapshot is fresh, the website computes indicators from the same MT5/Exness market used for execution. Position sizing never rounds a risk size upward to the broker minimum lot: if the minimum lot would exceed the configured cash-risk budget, the trade is rejected. Blocked attempts are rate-limited per signal.


## Virtual M1 pending-limit scalp demo (Gold)

The scalp demo is a **virtual forward test**, NOT a broker demo order executor.
Even when connected to an Exness MT5 demo account, it submits **zero**
broker orders. Therefore its simulated trades do not count toward broker
trading-day or VPS eligibility conditions. Never treat virtual performance as
proof of achievable real-money fills.

Set SCALP_DEMO_MODE=true and LIVE_TRADING=false.
The SITE_URL in the example now points to the single Render deployment.

- Every fresh MT5 M1 candle is eligible for up to four candidate entries.
  Only an active, authorized Ambush execution signal can create a candidate.
  No trade is forced when there is no valid signal.
- SCALP_DEMO_LOT=0.05 is an **exact** virtual lot. If the MT5 symbol's
  min/max/step cannot represent 0.05, no trade is recorded.
- Place a **simulated BUY LIMIT** below ask, or **SELL LIMIT** above bid.
  Count an entry only if the later MT5 quote touches the pending limit.
  Pending orders expire at the end of the M1 candle; track expired vs filled.
- Measure estimated account-currency P/L with MT5 order_calc_profit,
  using bid to exit BUY and ask to exit SELL. This configuration requires a
  **USD-denominated** MT5 account for dollar profit/loss thresholds.
  Apply a configurable extra cost buffer to avoid over-reporting small profits.
- Take the first net profit at or above SCALP_DEMO_MIN_PROFIT_USD=0.50.
  Negative floating P/L alone and weak/opposite signals no longer force an
  early exit. However, a 7 USD loss budget / stop and a 90-second max holding
  time still apply. Volatile quotes can jump beyond a stop.
- The 40 USD daily closed-loss threshold prevents new virtual orders for
  the remainder of that UTC day. Active virtual positions are still evaluated.
  A local KILL_SWITCH stops new entries.
- Journal virtual pending, fill, cancellation and exit events, with
  filled/expired counts, net USD, USD profit factor, and win rate.

Run python -m unittest discover -s tests -p test_demo_limit_logic.py from
the repository root to test quote and exit rules. The GitHub build workflow
also checks Python syntax. These are deterministic unit tests, **not** a
profitable backtest or five-day forward-test result.

Do not enable real execution based on the simulated numbers. Test on an
actual Exness MT5 **demo account** through a separate broker order-execution
path, measure all commissions/slippage, and review drawdown before making
any decision about a live account.
