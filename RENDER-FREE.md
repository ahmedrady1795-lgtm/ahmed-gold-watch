# Temporary Render Free deployment

[Deploy the free service](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fahmedrady1795-lgtm%2Fahmed-gold-watch%2Ftree%2Frender-free)

This branch includes the server-side sniper watch update from production source commit 0feda47a9ce01fc3aef365765e58279e00ab0b95.

## Scope and limits

- One Docker web service with explicit `plan: free`. No paid workers, disks, or databases are provisioned.
- Uses the existing Dockerfile, regression checks, Next.js build, and `/api/live` health check. Next.js listens on Render's configured port 10000.
- Render Free sleeps after 15 minutes without inbound traffic. Continuous observation while asleep is unavailable; this is not a 24/7 deployment.
- The filesystem is temporary. Existing Railway history is not copied. Sniper memory can be lost on restart, sleep, or redeployment.
- ML_ENGINE_URL and NEURAL_ENGINE_URL are intentionally not configured. The separate ML and neural services are not included; the application reports those integrations disabled.
- No API keys or Railway credentials are copied into the repository.
- The current Railway service is not changed by this configuration.
- Auto-deploy is off. Future releases require an explicit Render deploy.

## Activation and verification

Sign in to Render, review the Blueprint, confirm that the only service is Free, and deploy. Do not select an upgrade or add a payment method for this setup.

A successful build is not proof the market feeds work in the selected region. After activation, check:
1. `/api/live` returns HTTP 200.
2. `/api/ai-snapshot` becomes available after the initial analysis cycle.
3. `/api/sniper-audit` includes `watch.GOLD` and `watch.BTC`; storage should be `NOT_DURABLE` without a mounted volume.
4. The UI reports feed timestamps honestly and keeps stale signals blocked.
5. Inspect runtime memory and logs: the free service only has 512 MB RAM, so capacity is not yet verified.

Deployment and live verification remain pending until a Render account is connected.
