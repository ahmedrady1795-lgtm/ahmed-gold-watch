# GOLD quick-profit scalp: paper reference only

The user wants to **take small net-positive moves quickly** and recycle attention, not wait for long-range targets. This change affects only **new, independently qualified GOLD paper-reference scalp entries**; it does not lower setup entry checks and does not authorize MT5/Exness orders.

## Rule
- Once an existing M1-close / retest / liquidity / news / cost gate qualifies an exact paper entry, freeze its filled reference price, existing stop and existing T1. Do **not** fabricate a small-profit entry when all plans remain WATCH.
- Also freeze a smaller price threshold in the favorable direction. Gross movement must cover the conservative **estimated** round-trip cost plus the greater of **0.30R net** or **25% of estimated cost** (as a separate cushion). The risk denominator is `abs(fill - stop) + cost`; use 2-decimal directional rounding *away* from entry. Do not set quick target beyond existing T1; no quick exit otherwise.
- For newly activated GOLD paper entries, first observed fresh same-source quote reaching that threshold closes as `QUICK_TP`. The stop or genuine full T1 takes priority, especially if an OHLC bar touched both at uncertain sequence. Do not use historical later candles to backfill a micro-profit.
- Cap new quick-mode reference holdings to **M1 60 sec** or **M5 120 sec**. If a fresh price is not available at expiration, use only a documented <=5-second prior quote for a time exit; else UNKNOWN. A bad/gapped source is never credited as a win.
- BTC and old open positions remain unchanged, and the risk/return gate for entry is still strategy-specific (1.25R, 1.5R for RETEST, 3R for OB_FVG). The quick exit is an **earlier optional paper close** after an otherwise qualified entry, not proof that a 0.30R trading model is profitable.
- New `quickProof` ledger cohort contains all documented outcomes (QUICK_TP, TP1, STOP, TIME_EXIT). Never count quick wins alone or infer broker profit. A positive-only frequent-take strategy may have negative overall expectancy because losses are bigger than wins.
- Risk reference quote, spread, slippage and account lot size are **not verified Exness fills**; a small estimated gain can be worse or negative at actual broker quotes. No new live execution permissions and no Render ML/Neural changes.

## Validation
`node tests/scalp-quick-exit.cjs`, `node tests/scalp.cjs`, `node tests/scalp-presentation.cjs` and full GitHub Build Check. M1/M5 proof requires a meaningful future sample; **no fabricated prior quick wins**.
