# Qannas BTCUSDm — DEMO-only MARKET scalp experiment (EA v1.07)

This is **experimental Exness BTCUSDm demo trading**, not investment advice,
not a profitable strategy, and not a way to copy the video's growing lots
or unlimited leveraged positions. The new experimental HEDGING mode permits up to three simultaneous same-direction BTCUSDm DEMO positions. The existing pending-LIMIT
strategy remains available and unchanged when Market mode is disabled.

## Components and permission gates

1. `QannasReadOnlyBridge` remains on a different BTCUSDm chart and sends
   **Exness bid/ask and fully closed M1/M5/M15/H1 broker bars**. Gold reader
   stays separate. Never use Coinbase/Kraken prices as Exness order levels.
2. `GET /api/mt5/btc-demo-market-signal` authenticates with the existing
   private bridge token, requires **independent** Render feature flag
   `MT5_BTC_DEMO_MARKET_SIGNALS_ENABLED=true` (default OFF), and emits
   `QBTCM1|BUY_MARKET...`, `SELL_MARKET...`, or `WAIT`. It **never** sends
   orders to Exness. The old LIMIT signal endpoint/flag is separate.
3. EA `QannasBtcDemoTrader.mq5` v1.07 keeps the explicit
   `UseDemoMarketEntries=false` switch (LIMIT remains default), plus
   `DemoMarketConfirmation`, whose exact opt-in is
   `I_ENABLE_DEMO_MARKET_ONLY_V1`. Existing `EnableDemoOrders=true` AND
   existing `DemoConfirmation=I_ENABLE_DEMO_ONLY_V1` must also be present.
   A real account, unpinned demo account, wrong symbol or empty private token
   fails closed. **Do not share your token or account password.**

## Risk and execution

- Entry uses MT5's **fresh local broker ask (BUY) or bid (SELL)**, not the
  server's entry level. The server provides side, closed-candle identity,
  short expiry, and ATR-based protective distances.
- A market order includes **both SL and TP in the same request**, requires
  current symbol to support market orders/SL/TP, and uses broker tick-size
  rounding. No naked-position or pending-LIMIT fallback is permitted in
  Market mode. Broker rejection is logged, not retried as an unsafe order.
- A 0.10% of equity maximum **estimated stop risk per MARKET position** (the legacy LIMIT remains 0.05%), with an extra
  20% budget reserve for modeled fees and bounded price deviation; actual
  realized loss can still exceed this from slippage, commission, execution
  failures, or stop gaps. No hard guarantee.
- **USD $100 daily stop for opening new orders**, checked against both the persistent UTC-day
  starting-equity checkpoint (including other trading activity and open P/L)
  and the EA's net realized daily P/L, including commission, swap, and fees.
  The account must be USD-denominated and DEMO-only. This replaces the previous
  0.5% (~$10 on a $2,000 account) entry-blocking threshold, which cannot be
  increased from MT5 Inputs without upgrading the EA. Stops/fills may slip
  beyond $100; emergency close requests are made if equity reaches the threshold while the EA is connected, but this is not a guaranteed loss ceiling.
  MARKET: max estimated stop risk **0.10% of equity per position** and
  **0.30% combined**, with 20% reserve. Max **3 same-direction positions** on
  an Exness **DEMO HEDGING account**, <=9 entries per rolling minute,
  <=4 entries per new M1, max 1200 entries/day, and 4-second minimum reentry
  cooldown. These are ceilings, not execution guarantees.
  Reaching a daily loss stop is not an instruction to resume immediately;
  investigate negative expectancy first. (DEMO Market v1.06).
  Signal polling in Market mode can be as frequent as every 2 seconds;
  these are **capacity ceilings, not promised profitable trades**.
  Real Exness price freshness, distinct signals, spread, the one-position
  limit and stop/risk checks still prevent unqualified entries.
- **At most ONE position or pending order anywhere on this demo account**
  before any new Market entry. No martingale or growing lot multiplier.
  v1.07 checks existing demo MARKET positions on every BTC tick (and a
  one-second fallback timer) to exit when:
    - **LEGACY MODE ONLY QUICK_FLOATING_PROFIT:** mark-to-market P/L, after the spread, reaches
      35% of the 0.05%-of-equity risk budget (floor 0.15 account currency).
      This is **not a guarantee of a final net profit**, since commissions
      and close slippage can still apply.
    - **LEGACY MODE ONLY EARLY_ADVERSE_LOSS:** after a 10-second grace period, floating loss
      reaches 60% of the risk budget; don't instantly cut the entry spread.
    - **MISSING_BROKER_SL_TP:** immediate emergency close request, even
      before the 10-second grace.
    - **MARKET M1 HOLD:** With `MarketExitAtMinuteEnd=true` (default in
      v1.07), floating-profit and floating-adverse early exits are bypassed.
      The EA attempts to close every owned MARKET position as soon as the
      minute containing that position's **actual entry time** ends. It opens
      only up to second 35 of each M1 to leave at least ~25 seconds.
      Broker-side SL/TP can execute earlier; daily-loss emergencies, or missing
      SL/TP, can also close early. If disconnected, close may be delayed.
    - **MAX_HOLD_TIME:** the 30-second time limit applies only to the previous
      quick-exit mode or to legacy LIMIT positions.
  Close requests log the distinct reason, floating P/L and broker return
  code. A `PositionClose()` boolean is **not proof of execution**; verify
  actual fills in MT5 History. If the VPS disconnects, local exit logic
  cannot operate, while existing broker SL/TP should remain.
- Automatic MARKET lot sizing stays **under** the 0.10% estimated risk-per-position
  cap, with a further 20% buffer for modeled slippage.
  **No volume increase after a losing deal and no automatic recovery/martingale.**
  More trade opportunities mean more spread and slippage exposure. A future
  increase in lot sizing needs a demonstrated profitable net execution sample
  and explicit separate risk-budget consent; it is not part of v1.05. In the already
  unprofitable demo sample, unconditionally raising lots would magnify
  losses, not manufacture instant profit. Actual losses can exceed the
  estimated stop budget because of spread, slippage or broker execution.
- Each candidate requires an authentic recently closed BTCUSDm M1 bar,
  fresh actual broker quote, enough measured motion to cover >=2.4 spreads
  in target distance, an observed directional body or credible EMA,
  reasonable price proximity to last close, and usable observed tick volume.
  It can still return WAIT; it is NOT supposed to force-fill every candle.

## Installation (no remote access to user VPS from this chat)

1. **Turn Algo Trading OFF** on the Exness VPS. Open MT5 Trade tab and confirm
   no open BTCUSDm position or unexpired pending LIMIT order before switching.
   Keep the current BTCUSDm read-only bridge on its own chart.
2. Replace the existing BTCUSDm `QannasBtcDemoTrader.mq5` with **v1.06**
   from the `render-free` branch, run MetaEditor **Compile**, and verify
   **0 errors / 0 warnings**. GitHub CI does **not** compile MQL5; it only
   checks source/tests.
3. Keep `UseDemoMarketEntries=false` and `EnableDemoOrders=false`
   through the first installed-code inspection; send a screenshot of
   Inputs (hide token) and Experts to check the correct version and account.
4. Only after the EA is compiled and the authorized DEMO account and risk
   settings are verified, explicitly opt in locally with
   `EnableDemoOrders=true`,
   `DemoConfirmation=I_ENABLE_DEMO_ONLY_V1`,
   `UseDemoMarketEntries=true`,
   `DemoMarketConfirmation=I_ENABLE_DEMO_MARKET_ONLY_V1`.
   The Render market flag must separately be enabled, then Algo Trading
   enabled only on the confirmed DEMO account.
5. Verify the **actual** broker Results in Experts, Journal, Trade, History;
   `CANDIDATE_READY` in the status API means only an eligible signal,
   NOT a submitted/filled/profitable trade. Check server
   `/api/mt5/btc-status` under `demoMarketDiagnostics` for WAIT reasons.

## Kill switch

Turn `EnableDemoOrders=false` or disable Algo Trading. Confirm no
open positions or orders remain in Trade. Already-open trades retain
broker-side SL/TP and are NOT automatically closed just by toggling
Algo Trading; manage them explicitly on the DEMO terminal.

No real-account orders, no market lot doubling, no high-leverage imitation
of a social-media video. Earlier Market EA versions executed actual **demo** trades with net losses.
The $100 setting is a *higher loss tolerance*, not an improvement in signal accuracy.
In the 2026-11-08 DEMO screenshot, cumulative net P/L was about -$9.90,
with 0.06-0.09 BTCUSDm lots and numerous small stopped-out trades. The current
server MARKET planner primarily follows the most recently closed M1 candle
body (or EMA bias for small bodies), so it is not a calibrated pre-candle
prediction or a validated order-flow strategy. The EA also takes quick floating
profit at 35% of its per-trade risk budget but may wait until a 60% budget loss
after a 10-second grace (or broker stop), so ignoring other costs the simplistic
payoff ratio requires >63% wins to break even. Recent observed Exness spread
was ~$6.40 in BTC quote units against ~$10.47 M1 ATR: for a 0.06-lot BTC
position that can imply ~$0.38 in immediate spread cost, depending on
broker contract specifications. Analyze complete broker deals (spread,
opening/closing quote, time held, cause of exit) before raising trade count.
The v1.07 daily-stop, three-position stacking, M1-entry-minute exit and broker-deal audit have NOT been compiled or
validated against Exness broker fills on the user's VPS. Only change the
single EA while Algo Trading is disabled and the Trade tab shows no existing
orders or positions. Confirm v1.05 in MetaEditor, test 0 errors/warnings,
then inspect deal-level net results rather than only number of entries.
The new MT5 Inputs field is `MaxDailyLossUSD=100.00` instead of the old
`MaxDailyLossPct=0.50`. The changes are **source-only** until manually
compiled and installed on the demo terminal; updating GitHub or Render
does not replace an attached EX5.

Broker-deal telemetry in v1.06 prints `Qannas BTC DEMO BROKER DEAL` with exit reason, gross profit, commission, swap, fee and per-deal net. Include *opening and closing* deals for complete position P/L; the deal-level number alone is not the full round-trip result.

## M1-frequency request (Nov 8)
Each confirmed fresh Exness M1 bar is assessed for the **next** entry minute, combining latest closed-bar body, EMA bias and real broker quote changes. Server data must be fresh and cost/SL/TP requirements remain: no software can safely promise a fill on every candle. A missing feed, extreme spread, broker refusal, insufficient volatility or lack of valid direction still causes WAIT. **Higher frequency and lot size do not improve directional edge by themselves.** The Exness demo history previously showed negative net results; running this setting may hit the new USD $100 stop faster than before. Never activate this uncompiled code on live trading; maintain a demo-only installation.
