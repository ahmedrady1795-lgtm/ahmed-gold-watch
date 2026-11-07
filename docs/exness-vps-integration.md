# Exness VPS → Qannas (Render) integration: demo-first checklist

**Target:** The existing Qannas deployment at `https://ahmed-gold-watch-free.onrender.com`, sourced from the **`render-free`** branch. Do not create another site, use Railway, or enable live trading during setup.

## Existing components

- `mt5_bridge/bridge.py` synchronizes real MT5 XAUUSD broker quotes and closed M1/M5/M15/H1 candles through authenticated `POST /api/mt5/status`.
- `GET /api/mt5/scalp-demo` is **paper-only** and does not submit broker orders.
- `GET /api/execution/signal` is a separate, guarded **future live-capable** strategy route. It is disabled unless the production server is explicitly enabled and all other readiness checks pass.
- The Python bridge can submit **pending LIMIT orders only**, never a market DEAL, when separately authorized on both server and bridge. It now attempts to **remove only its own** still-pending LIMITs if the site revokes its signal, the local kill file exists, the quote goes stale, the spread expands or communications fail. Broker connectivity is needed for removal; this is not a guarantee of a successful cancellation.
- The bridge's MT5 integration requires Windows + MT5 + Python packages. Exness explicitly documents support for personal MQL5 Expert Advisors, but the permission and ability to install/run Python and third-party packages **on a specific Exness VPS must be confirmed**. If restricted, use a supported Windows VPS or build a native MQL5 adapter; don't assume this script can run there.

## Safe setup: no real-money execution

1. **Do not deposit just for integration testing.** Obtain and access a suitable Windows VPS, and check its third-party software policies. MT5 must be installed and logged in to the intended **demo** trading account.
2. Copy this repository's `mt5_bridge` folder to the Windows machine. Install Python x64 if permitted; from its folder, run `python -m pip install -r requirements.txt`.
3. Copy `mt5_bridge/.env.example` to `mt5_bridge/.env` locally. Choose `MT5_SYMBOL` from the exact symbol shown by MT5 Market Watch (e.g., the suffix may differ from `XAUUSDm`). Never commit `.env` to GitHub.
4. Generate a long random `MT5_BRIDGE_TOKEN` locally and configure the **same token** as a secret on the existing Render service. Keep `LIVE_TRADING=false`, `SCALP_DEMO_MODE=true`, `MT5_LIVE_ACK=`, and `MT5_EXPECTED_LOGIN=` in the VPS `.env`.
5. On Render keep `MT5_AUTOTRADE_ENABLED=false` and `KILL_SWITCH_ENABLED=true`. Do not set live acknowledgement/login values there during demo.
6. In the VPS folder, run `run_bridge.bat` (or `python bridge.py` after installing requirements). This **does not execute broker trades** in demo mode: it sends market status and uses simulated pending LIMIT fills for the independent Ambush demo.
7. Check `/api/mt5/status` for `connected`, `fresh`, `candlesFresh`, and correct `symbol` and `tickTimeMs`. Treat missing/degraded data or site `401/503` as a **setup failure**, not permission to trade.
8. Test local shutdown using an empty `mt5_bridge/KILL_SWITCH` file. Remove it only for supervised *demo* testing. Run `python tests/mt5-pending-guard.py` from repo root (pure policy assertions; no broker connection).
9. Verify stable connectivity, actual Exness tick timestamps, bid/ask/spread, candle count, logs, and at least several days of paper outcomes including modeled costs. Test VPS restart and Render cold starts. Demo results are not evidence of profitable live trading.

## Important limits

- The **`render.yaml` auto-deploy trigger is off**. Merging this code is not the same as deploying it; verify the running Render revision separately.
- If Render goes offline, signal retrieval fails closed, but **existing broker orders may still be active**. The bridge attempts to revoke its own unfilled pending orders; cancellation is not guaranteed when MT5 or the broker is unreachable. Watch open positions and risk yourself.
- Exness VPS access can be withdrawn for inactivity/volume requirements and the remote machine may be wiped. Store a backup **without secrets** and do not place trades just to keep a free VPS.
- A `TRADE_RETCODE_PLACED` is only a **pending order accepted**, not a filled/winning trade.
- Never switch on real orders without separately confirming account identity, symbol, server-side and VPS-side risk limits, broker minimum lot, order-cancellation behavior, logging, and the user's explicit approval.
