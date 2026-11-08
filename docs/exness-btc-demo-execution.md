# Qannas BTCUSDm demo-only pending-limit execution (review candidate)

This implements **the first experimental broker demo execution loop**. It does
**not** establish profitability or promise a high win rate. The execution
candidate is computed only from fresh, completed Exness BTCUSDm M1/M5 candles
plus Exness bid/ask. Existing Coinbase/Kraken paper results are NOT brokerage
execution signals.

## Components

- `QannasReadOnlyBridge.mq5` remains attached to the existing BTCUSDm H1
  chart and continues sending authentic broker quotes/candles to
  `POST /api/mt5/btc-status`. Do not replace or remove this reader.
- `GET /api/mt5/btc-demo-signal` authenticates with the existing private
  `MT5_BRIDGE_TOKEN` and emits a short-lived passive `BUY_LIMIT` or
  `SELL_LIMIT` candidate, or `WAIT`. It **never places an order**.
  The endpoint only emits candidates if Render environment
  `MT5_BTC_DEMO_SIGNALS_ENABLED=true` (default OFF). No global live-trading
  flag is used.
- `QannasBtcDemoTrader.mq5` belongs on a **second BTCUSDm chart** (ideally
  M1). MT5 permits only one EA per chart. The existing H1 read-only EA should
  stay on its own chart.
- There is **no market entry fallback**. Only broker-expiring pending LIMIT
  orders with SL and TP attached to the order request are permitted.
- The demo BTC M1 ATR precheck uses a 1.5x ATR/quoted-spread floor instead
  of a blanket 3x requirement, since the latter incorrectly hid potentially
  viable short retests behind `VOLATILITY_TOO_LOW`. **This is not a signal
  frequency target.** New unique broker ticks, aligned M1/M5 trend,
  a passive limit entry, broker SL/TP geometry, a profit target of at least
  2.4x quoted spread and all local demo risk caps remain mandatory.
  When spread dominates the available motion, the correct answer remains WAIT.

## Before starting

1. Run GitHub tests and inspect the PR; compile the EA in MetaEditor and
   verify **0 errors, 0 warnings**. GitHub Node builds do NOT compile MQL5.
2. Never connect the executor to a real Exness account. It rechecks
   `ACCOUNT_TRADE_MODE_DEMO` and an exact local `ExpectedDemoLogin` every
   polling cycle; an unavailable/unexpected account fails closed.
3. The token previously disclosed in chat is not secret. **Rotate it before
   any live or longer-term deployment**; for this isolated demo experiment,
   never share broker passwords, token, or login credentials.
4. Server candidate emission remains off by default, and the EA defaults to
   `EnableDemoOrders=false`. Keep them off through first read-only diagnosis.
5. Open a new `BTCUSDm` chart (not the existing H1 reader chart), preferably M1.
   Install the `.mq5` file in `MT5 → File → Open Data Folder → MQL5 → Experts`,
   refresh Navigator, drag EA onto new chart, and set private token and exact
   demo login. The EA should log that orders are OFF.

## Opt-in sequence (demo account ONLY; after independent MQL5 compile)

1. Add `https://ahmed-gold-watch-free.onrender.com` under
   `Tools → Options → Expert Advisors → Allow WebRequest` (already done for
   the reader). Leave `Allow DLL Imports` OFF.
2. In Render set `MT5_BTC_DEMO_SIGNALS_ENABLED=true` only after the demo
   EA and account gates have been verified. The read-only monitoring receiver
   continues to operate with this flag off.
3. Set EA input `ExpectedDemoLogin` to the **exact broker DEMO** account
   you can see in MT5 and confirm account is indeed Demo. Set
   `EnableDemoOrders=true`, `DemoConfirmation=I_ENABLE_DEMO_ONLY_V1`.
   Only then may **Algo Trading** be enabled on a verified *demo* session.
4. Review `Experts`, `Journal`, `Toolbox → Trade`, `History` and broker
   reports. Verify that an active pending order has an SL, TP, and expiration.
   Do not assume a pending order was filled. Record fills, costs, and net PnL.
5. To stop, disable EA demo execution input and remove the EA after confirming
   there are no pending orders. A pending order expires after <=15 seconds
   even if the EA goes offline. Already-filled positions retain broker SL/TP;
   avoid forcibly terminating MT5 before checking them.
6. Fast demo profile (v1.01): risk budget <=0.05% of demo equity
   at the stop per fill, <=4 broker-filled entries in a rolling 60-second
   window, max 360/day (failsafe, NOT a target), and max 0.5% daily loss.
   A single BTC position or pending order may exist at a time, with a 30s
   max-hold exit; separate setups may occur within the same M1 bar ONLY if
   three different, recent Exness broker tick observations show a real new
   pullback reversal. Broker minimum lot, stale quotes, spread, stop-level,
   missing candle history, and unsupported expiry all veto an order. No fixed
   120-second artificial cooldown: minimum gap between submitted limit
   attempts is 10 seconds. This is capacity, not a guaranteed trade rate.

## Important limitations

- This is an **unverified trading hypothesis**: trend alignment, closed M1
  confirmation, new Exness tick reversal, low spread, and passive retest
  order. No proved win rate. At high frequency, spread, commissions and
  slippage can dominate; a 0.05% estimated stop loss is NOT a guaranteed
  maximum realized loss.
- Exness BTCUSDm is a CFD and is not identical to BTC spot; commission,
  slippage, liquidity, financing costs and broker fill rules can vary.
- There is no reliable full executed order flow/true consolidated DOM from
  this tick-only bridge. Avoid treating tick volume as traded exchange volume.
- No live trading or $2,000 deposit is needed. Exness VPS continuation
  requirements should never dictate opening unnecessary trades.
- The server uses ephemeral in-memory feed state on Render Free; if the
  service restarts, signals remain WAIT until genuine fresh broker data
  streams again. The EA always verifies the broker's current state locally.
- If Compile fails, **do not enable demo Algo Trading**: capture only
  MetaEditor's error lines for review without exposing account secrets.
