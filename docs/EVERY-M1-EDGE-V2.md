# Every M1 Paper LIMIT — economics v2 (2026-11-05)

**Goal:** Preserve a directional BUY/SELL hypothesis for every valid closed M1, but improve the expected payoff *after* spread/fees/slippage, and detect a closed-bar high/low liquidity sweep before blindly following delayed EMA momentum.

- Paper-only, isolated, with **no MT5 or real broker entry permission changes**. The separate strict M1/M5 trade qualification and the main chart's break levels remain unchanged.
- New `EVERY_M1_EDGE_V2` cohort starts only at deployment. Prior wins/losses remain archived as legacy and **never** establish V2 hit rate.
- One prediction per minute remains, including LOW EVIDENCE and `COST_UNVIABLE` outcomes. The latter means prices/costs make a resting LIMIT paper simulation unreasonable, **not** that the forecast did not exist. No market order fallback.
- BUY LIMIT beneath Bid; SELL LIMIT above Ask. Price can rest at a bounded retest into the last *closed* M1 body's midpoint (at most 0.65 prior M1 ATR from current quote). Keep source/timestamp freshness and no same-quote fills.
- Freeze STOP at max(0.55 prior ATR, 2 × spread, 0.14 quote units). Freeze quick gross take-profit move at **remaining fees/slippage + 0.45 × (risk + remaining fees/slippage)**. Bid/ask already includes spread, **don't subtract it twice**. 0.45 net-R with a full loss of 1R requires approximately **69%** positive trades to break even, *before variable slippage and gaps*.
- No oversized micro targets: if the gross move exceeds 1.35 times the recent minute ATR, preserve the directional hypothesis as `COST_UNVIABLE` and record no fake pending fill.
- Prior six-candle high sweep followed by *closed* bearish wick rejection triggers a SELL hypothesis, and symmetric low rejection triggers BUY. Counter-trend signals retain a `weak` caveat and are not called high confidence. This is a **hypothesis**, not measured predictive improvement.
- At a hypothetical LIMIT touch, inspect the *executable exit* quote for simultaneous STOP too. If the quote already crosses STOP, resolve `UNKNOWN` rather than crediting a safe fill.
- Exit at fresh same-source executable price, STOP, quick target or <=60s timeout. Quote gaps are UNKNOWN. No repainting with later prices.
- Measure V2 outcomes, loss rate, win rate, net R, average gains/losses, and source quality before promoting strategy. **No 90% claim** from synthetic regressions.

Validation: `node tests/scalp-every-m1.cjs` plus all GitHub checks and Docker/Render builds.
