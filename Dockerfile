FROM public.ecr.aws/docker/library/node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Hard-block production deployment on a regression in the target scorecard.
RUN node tests/sniper-scorecard.cjs && node tests/long-range-targets.cjs && node tests/sniper-outlook.cjs && node tests/forecast-illustration.cjs && node tests/forecast-journal.cjs
RUN npm run build

FROM public.ecr.aws/docker/library/node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app /app
EXPOSE 3000
CMD ["npm","start"]
