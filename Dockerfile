FROM public.ecr.aws/docker/library/node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN node tests/web-source-resilience.cjs && node tests/scalp-learning.cjs && node tests/scalp.cjs
# Hard-block production deployment on a regression in the target scorecard.
# This tests the scorer's stated expiry time and rejects ambiguous OHLC fills.
RUN node tests/direction.cjs && node tests/sniper-decision-engine.cjs && node tests/institutional-price-action.cjs && node tests/liquidity-sweep-confirmation.cjs && node tests/sniper-ui-dedup.cjs && node tests/sniper-command-layout.cjs && node tests/scalp-forward-reach.cjs && node tests/chart-first-news-ticker.cjs && node tests/predator-fusion-causal.cjs && node tests/ml-data-quality.cjs && node tests/market-tool-quality.cjs && node tests/news-alert-window.cjs && node tests/news-intelligence.cjs && node tests/indicators.cjs && node tests/home-news-singleton.cjs && node tests/professional-move.cjs && node tests/ai-model-certification.cjs && node tests/execution-readiness.cjs && node tests/mt5-bridge-safety.cjs && node tests/optional-market-evidence.cjs && node tests/gold-feed-order.cjs && node tests/btc-history-nonblocking.cjs && node tests/ai-stall-recovery.cjs && node tests/pre-move-pressure.cjs && node tests/forecast-evidence-gate.cjs && node tests/trend-confirmation.cjs && node tests/four-hour-structure.cjs && node tests/continuous-direction.cjs && node tests/sniper-stability.cjs && node tests/long-range-targets.cjs && node tests/sniper-outlook.cjs && node tests/forecast-illustration.cjs && node tests/forecast-journal.cjs
RUN node tests/sniper-archive.mjs && node tests/sniper-scorecard.cjs && node tests/ghost-forecast.cjs && node tests/visual-forecast-candles.cjs && node tests/first-candle-audit.cjs && node tests/conditional-target-candles.cjs && node tests/btc-chart-source-guard.cjs && node tests/gold-market-session.cjs && node tests/gold-trained-shadow.cjs && node tests/forecast-motion.cjs && node tests/forecast-motion-causal.cjs && node tests/sniper-watch.cjs && node tests/liquidity-foundation.cjs && node tests/sniper-decision-guide.cjs && node tests/move-reach-confidence.cjs && node tests/chart-professional-cockpit.cjs && node tests/chart-premium-layout.cjs && node tests/chart-zone-merge.cjs && node tests/chart-observation-radar.cjs && node tests/btc-orderflow.cjs && node tests/chart-live-breakout-display.cjs && node tests/btc-structural-scenario.cjs && node tests/btc-feed-time-integrity.cjs && node tests/btc-forward-observation.cjs && node tests/sniper-chart-playbook.cjs && node tests/sniper-strategies.cjs && node tests/gold-tick-quality.cjs && node tests/client-market-freshness.cjs && node tests/background-ai-cycle.cjs && node tests/chart-visibility.cjs && node tests/chart-history.cjs && node tests/ai-readiness.cjs
RUN npm run build

FROM public.ecr.aws/docker/library/node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app /app
EXPOSE 3000
CMD ["node","scripts/start-with-audit-archive.mjs"]
