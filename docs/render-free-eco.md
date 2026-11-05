# Render Free quota protection (viewer-aware background work)

The public Al-Qannas service `ahmed-gold-watch-free` and the separate ML and Neural services are all **Free** Render web services in one workspace. Render's included **750 Free instance-hours/month** are **shared**, not 750 for each service. Running all three continuously cannot fit that allowance. Check the exact remaining hours in Render Dashboard → Billing → Monthly Included Usage; CPU, memory, and bandwidth metrics **do not** establish that balance.

## Viewer-aware eco mode

On `RENDER_SERVICE_NAME=ahmed-gold-watch-free`, the main server starts in eco-idle after each restart. Only the real dashboard's read-only `/api/ai-snapshot` requests with the explicit `X-Qannas-Viewer: 1` header refresh a **120-second viewer lease**. A closed or hidden tab stops refreshing the lease. No automated scheduler or status ping is allowed to extend it by default.

While idle, `instrumentation.ts` skips **background** heavy analysis, auxiliary AI health warmups, 4-second paper scalp recomputation, 30-second chart observation, and 6-second BTC outcome settlement. The loops stay scheduled but do not contact providers until the dashboard is viewed again. Manual `/api/ai-analysis` calls still work and do not authorize real trading. A browser refresh resumes the observation cadence automatically.

This does **not** stop a currently running cycle, guarantee Render will spin down, turn off all outbound tick sockets, change external cron-triggered requests, or guarantee a given remaining-hour balance. Free Render services normally sleep after ~15 minutes without inbound traffic; external archive workflows or other uptime pings **can** keep the main service awake even with this guard. Paused intervals also mean that paper observations are unavailable for the paused time. Never treat gaps as profit or validated forecast outcomes.

## Controls and safety

- `QANNAS_RENDER_ECO_MODE=1`: force this behavior in another deployment.
- `QANNAS_RENDER_ECO_MODE=0`: opt out of the activity gate.
- Unset: auto-enable only on the named main Render Free service, leaving local, Railway and model service runtimes unaffected.
- ML/Neural 429 backoff, input freshness rules, SHADOW qualification, safety vetoes, MT5 configuration and live-trading switches are **unchanged**.

Test with `node tests/render-free-eco.cjs` and the existing CI build. Publish at most once after CI confirmation to conserve deployment/build minutes.
