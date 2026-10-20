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
## Historical GOLD model (offline, read-only, never executes orders)

This pipeline is separate from the live MT5 bridge and does not need the
website token. Run on a Windows laptop/VPS with MetaTrader 5 open and logged in:

```powershell
cd mt5_bridge
python -m pip install MetaTrader5
cd ..
python mt5_bridge/export_gold_history.py --symbol XAUUSDm --years 5
python mt5_bridge/train_gold_shape.py --input local-data/gold-history --activate
```

The exporter requests genuine **closed broker M1, M5, M15, and H1 bars** in
UTC month-sized windows, rejects broken OHLC, writes gzip CSV and a SHA-256
manifest. It never uploads credentials, raw candles or orders. Check each
month's count: MT5 **Max bars in chart** and the broker's retention can mean
less than the requested years are available; an export is not evidence that
five years were actually obtained.

The trainer uses the M1 archive, chronological 70/30 train/out-of-sample
split with a purged boundary and non-overlapping three-minute outcomes.
Conditional OHLC shapes are activated only for buckets with enough independent
time-period coverage and evidence over a paired momentum baseline. An ordinary
output is **SHADOW** and `--activate` refuses to publish it. The training
output is local-data/gold-shape-result.json; the **only** intentionally
publishable aggregate parameter file is public/models/gold-shape-model.json.
Raw history must never be committed to GitHub.

Even an independently qualified model will draw only when the **current live
MT5/Exness broker symbol is identical** to the model's symbol and the M1
history is fresh and contiguous. The public Biquote or COMEX proxy feed is
never treated as broker-identical. This only changes **illustrative ghost
candles**, not trade entries, live MT5 authorization or model-certified
profitability. No archive or real trained model is shipped in this repository.
The Render Free service has no persistent disk/DB, so keep the raw archive on
the laptop/external storage. After creating qualified parameters, commit
**only** that small JSON parameter file and explicitly deploy to Render.

## Real broker DOM for the gold radar (read-only)

The website now separates three different sources: genuine broker MarketBookGet
depth for the **same XAUUSD broker symbol**, closed M1/M15 spot OHLC evidence,
and any separate COMEX futures references. It never substitutes COMEX or
historical candle volume for live broker limit orders.

- On your **Windows MT5 machine or VPS**, update `mt5_bridge/bridge.py` to
  the latest `render-free` revision. Run MT5, log in, and keep the bridge
  running with `LIVE_TRADING=false`. Do not send credentials or the
  `MT5_BRIDGE_TOKEN` to anyone.
- The Python bridge calls `market_book_add` and `market_book_get` for the
  selected `MT5_SYMBOL`, and sends only bounded bid/ask levels, broker symbol,
  and the **captured-at timestamp** to the authenticated site status endpoint.
  Bid/ask levels are the liquidity displayed by that **broker only**.
- Open the gold chart, tap **رادار الذهب**, and read the MT5 depth status.
  It only reports a live book after at least **three fresh two-sided samples
  spanning eight seconds**; otherwise the reason is shown (unsupported,
  absent, invalid, or stale). Check
  `/api/mt5/status` for `brokerDepth` without exposing account credentials.
- Many XAUUSD OTC accounts/symbols have **no MarketBookGet book**, or
  only partial synthetic broker depth. In that case the UI will correctly show
  **not available**. The existing closed-candle gold radar remains independent,
  and **no depth-only Market Lead signal is activated**.
- Falling displayed book depth can be canceled orders, execution or a change
  of quote, and can never prove spoofing or the identity of institutions.
  Broker volume units are not guaranteed to equal exchange-traded volume.
- MT5 broker DOM and futures exchange COMEX GC are different venues/instruments.
  A true licensed CME MDP Market-by-Order/Market-by-Price feed requires a
  supported data agreement, provider credentials and symbol mapping. We have
  **not** connected such a feed, and cannot label the spot radar as CME order
  flow or claim its performance from this bridge.

This integration does **not** enable order execution or change the existing
paper-trade qualification, scenario freeze, TP/SL or ML-certification logic.
