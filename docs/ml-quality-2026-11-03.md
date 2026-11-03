# ML quality repair — 3 November 2026

## Confirmed defects repaired

The embedded order-book MLP scored a chronological model, then refitted a different model on all data (including the holdout) before serving it with the old metrics. It also split overlapping sequences without purging their feature/target intervals and defined the prediction horizon by poll count. Variable request latency therefore changed the time horizon.

The v2 implementation serves exactly the evaluated estimator, purges entire feature/target windows, labels by elapsed time (30 seconds by default), rejects gaps/non-finite or stale observations, maps missing classes explicitly, and requires improvement over a training-derived majority baseline on the same selected samples. Legacy v1 model artifacts are rejected. No quality threshold was lowered. Nine regression tests include a real estimator fit/save/reload; five existing HTTP cooldown tests also pass.

## Fixed-window history comparison

Collected 32,000 public Binance Vision BTCUSDT M1 klines. Compared the unchanged M1/M5 model recipes with 8,000 vs 30,000 input rows. Same validation and holdout boundaries for both runs, with horizon purging. Validation starts 2026-11-01 07:46 UTC; holdout starts 2026-11-02 10:26 UTC; last candle opens 2026-11-03 06:26 UTC. The script excludes forming candles. Run `python scripts/audit-ml-history.py /path/to/binance-klines.json` to repeat with a saved kline response array.

| Metric | 8,000 rows | 30,000 rows |
|---|---:|---:|
| M1 holdout directional accuracy | 52.96% | 52.25% |
| M1 selected-signal accuracy | 54.63% | 56.02% |
| M1 selected-signal coverage | 40.14% | 16.89% |
| M1 log loss | 0.6951 | 0.6928 |
| M1 train/holdout accuracy gap | 20.87 points | 8.74 points |
| M5 overall accuracy | 40.30% | 43.06% |
| M5 selected-signal accuracy | 41.74% | 46.62% |
| M5 selected-signal coverage | 40.47% | 35.87% |
| M5 log loss | 1.0786 | 1.0649 |

M1 uses 1,131 holdout rows and M5 uses 1,196, because targets without a complete future horizon are excluded. This fixed comparison window is deliberately identical across runs; it is not the normal proportional production split and is below M5's 1,200-row qualification minimum. Neither experiment qualifies as READY, and selected-signal accuracy compares different subsets of the same period. This is one historical diagnostic, not a forward trading result or evidence of profitability.

## Production configuration

Set `ML_TRAINING_CANDLES=30000` on the existing Render ML service. This is already the source-code default; the previous live run used approximately 8,000 rows. The repository's render.yaml defines only the frontend service, so the ML service's Render environment remains its configuration source. Preserve all other environment variables and the existing qualification gates.

Remaining work: assess multiple fresh forward periods, improve features/calibration only on development data, and inspect the separate neural service. Do not present SHADOW predictions as qualified signals.
