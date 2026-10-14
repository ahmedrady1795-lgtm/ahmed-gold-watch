FROM public.ecr.aws/docker/library/node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Hard-block production deployment on a regression in the target scorecard.
# This tests the scorer's stated expiry time and rejects ambiguous OHLC fills.
RUN node tests/news-alert-window.cjs && node tests/news-intelligence.cjs && node tests/indicators.cjs && node tests/home-news-singleton.cjs && node tests/professional-move.cjs && node tests/ai-model-certification.cjs && node tests/execution-readiness.cjs && node tests/mt5-bridge-safety.cjs && node tests/optional-market-evidence.cjs && node tests/gold-feed-order.cjs && node tests/btc-history-nonblocking.cjs && node tests/ai-stall-recovery.cjs && node tests/pre-move-pressure.cjs && node tests/forecast-evidence-gate.cjs && node tests/trend-confirmation.cjs && node tests/four-hour-structure.cjs && node tests/continuous-direction.cjs && node tests/sniper-stability.cjs && node tests/long-range-targets.cjs && node tests/sniper-outlook.cjs && node tests/forecast-illustration.cjs && node tests/forecast-journal.cjs
RUN node tests/sniper-archive.mjs && node tests/sniper-scorecard.cjs && node tests/forecast-motion.cjs && node tests/forecast-motion-causal.cjs && node tests/sniper-watch.cjs && node tests/liquidity-foundation.cjs && node tests/sniper-decision-guide.cjs && node tests/chart-zone-merge.cjs && node tests/sniper-strategies.cjs && node tests/gold-tick-quality.cjs && node tests/client-market-freshness.cjs && node tests/background-ai-cycle.cjs && node tests/chart-visibility.cjs && node tests/chart-history.cjs && node tests/ai-readiness.cjs
RUN npm run build

FROM public.ecr.aws/docker/library/node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app /app
EXPOSE 3000
CMD ["node","scripts/start-with-audit-archive.mjs"]
