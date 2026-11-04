# Scalp forward-observation audit (shadow only)

This audit measures whether an observed candidate direction is followed by a meaningful **subsequent** price move. It does **not** execute trades, create MT5 orders, change risk gates, claim profitability or infer what happened between missing ticks.

## Why this exists

Render `[SCALP-DIAG]` logs on 2026-11-02 to 2026-11-04 showed many GOLD M1/M5 WATCH plans, including high technical scores, but the sampled paper ledger had **zero settled trades**. The main vetoes were no executable setup or insufficient reward after estimated costs. This does not imply those vetoes should be removed: instead, audit the *directional shadow* of rejected candidates separately from broker execution.

Independent ML/Neural services also showed HTTP 429 cooldown in `[AI-DIAG]` logs, which this change **does not fix**. A cooldown is not proof that a model is qualified; the audit does not override model-readiness or trade eligibility.

## What is recorded

- GOLD M1 and M5: first observed `WATCH` or `ARMED` directional candidate, score >=70, positive estimated cost and fresh source timestamp. A single plan ID is scored once, not once per repeated dashboard poll. At most one open candidate per horizon.
- Exness/MT5 GOLD Ambush: an `AMBUSH` action from the **existing authenticated demo endpoint**, with an actual fresh Exness/MT5 quote and positive observed spread. No broker connection means **zero Ambush samples**, not fabricated observations.
- Direction and a frozen reference quote at first evaluation, **decision timestamp** (not previous OHLC close), provider label, estimated cost, first subsequent favorable/adverse observed threshold touch, and milliseconds to favorable touch.
- Threshold is frozen at `max(2 * estimated execution cost, 0.01% of the reference price)`. This is a *directional research threshold*, **not** a TP, SL or evidence of executable net profit. No real commission, swap, slippage or fill is observed.
- Horizon: M1 60 seconds, M5 300 seconds, Ambush 30 seconds. Repeated or pre-decision quotes are ignored. Quote gaps over 15 seconds, source changes, or an unobserved end-of-horizon produce `UNKNOWN`, never a win/loss. A fully observed but threshold-free horizon is `NO_THRESHOLD`, excluded from first-touch directional rate.
- No overlapping samples within one lane and no historical repainting; only live future quotes are used. This is **not** a continuous market collector: when no client polls `/api/scalp` or the MT5 bridge doesn't poll the demo route, data may be unobservable and will become unknown on the next evaluation.
- Each lane stores the most recent 500 closed outcomes in `/data/scalp-lead-audit-v1.json`. `persisted=false` signals that the file could not be persisted. This path must be a persistent disk; in-memory globals alone will be lost on restart.

## Reading the results

The existing `GET /api/scalp` response adds:
- `gold.leadAudit.m1`
- `gold.leadAudit.m5`

The existing **authenticated** `GET /api/mt5/scalp-demo` response adds `leadAudit` when the MT5 demo engine is ready. It is **demo-only**, never authorization for trading.

The existing `[SCALP-DIAG]` log adds `gold.leadAudit`. Useful metrics:

- `favorableFirst`, `adverseFirst`: *observed* first directional threshold, not trades or calibrated success probability.
- `noThreshold`: full observation horizon without a threshold touch.
- `unknown`: quote gaps/changes/outages; **must not** be silently excluded when evaluating data coverage.
- `observedFavorablePct`: favorable / (favorable + adverse) from observed first touches; it excludes neutral and unknown. Not a win rate.
- `meanTimeToFavorableMs`: elapsed time between candidate computation and later observed price crossing.
- `bySource`: prove whether results are based on external reference quotes or actual MT5 quotes.
- `verdict: COLLECTING`: fewer than 50 resolved first touches. Even after 50, the verdict is only `OBSERVED_SAMPLE_ONLY` until independently validated.

Avoid comparing Biquote GOLD values directly with Exness fills or assuming a high `score` equals a percentage chance of winning.

## Verification before any Render deployment

Run:

```bash
npm ci
node tests/scalp-lead-audit.cjs
node tests/scalp.cjs
npm run build
```

Regression tests cover pre-signal timestamps, stale quotes, duplicate plans, unknown outcomes from missing data, provider changes, positive estimated-cost thresholds and non-Exness reference safeguards. CI includes the new audit test. No trading permissions, risk thresholds, live flags or Render credentials are changed.
