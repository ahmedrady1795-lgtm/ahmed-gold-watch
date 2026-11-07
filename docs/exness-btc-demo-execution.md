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
6. The experiment caps volume so estimated SL loss is <=0.1% of demo equity,
   max 3 filled trades/day, max 0.5% realized daily demo loss and one BTC
   position/order at a time, with a 120s max-hold rule. Broker min lots,
   incomplete history, stale quotes, excessive spread, missing stop rules,
   or unsupported expiration stop execution.

## Important limitations

- This is an **unverified trading hypothesis**: trend alignment, closed M1
  confirmation, low spread, and passive retest order. No proved win rate.
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
