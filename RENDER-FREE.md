# Qannas — active Render Free deployment

**Existing live site:** https://ahmed-gold-watch-free.onrender.com/ — do not use the one-click Blueprint deploy to create a duplicate service.

The deployed source branch is **render-free**. All new Qannas changes must target this branch and the existing Render services, not unrelated deployment branches.

## Scope and limits

- Main Qannas site: `ahmed-gold-watch-free`, Docker, Render Free, branch `render-free`. The same workspace also contains the supporting `qannas-ml-engine` and `qannas-neural-engine` services, both on `render-free`.
- Uses the existing Dockerfile, regression checks, Next.js build, and `/api/live` health check. Next.js listens on Render's configured port 10000.
- Render Free sleeps after 15 minutes without inbound traffic. Continuous observation while asleep is unavailable; this is not a 24/7 deployment.
- The filesystem is temporary. Sniper memory can be lost on restart, sleep, or redeployment.
- ML and neural integrations depend on runtime configuration; separate Render services exist, but their actual connectivity must be checked in the running application.
- Never commit API keys or service credentials into the repository.
- Auto-deploy is off. Future releases require an explicit Render deploy.

## Verification of the existing service

Do not create another Render service. Release updates to the existing `ahmed-gold-watch-free` service only after tests. A successful build is not proof the market feeds work in the selected region. Verify:
1. `/api/live` returns HTTP 200.
2. `/api/ai-snapshot` becomes available after the initial analysis cycle.
3. `/api/sniper-audit` includes `watch.GOLD` and `watch.BTC`; storage should be `NOT_DURABLE` without a mounted volume.
4. The UI reports feed timestamps honestly and keeps stale signals blocked.
5. Inspect runtime memory and logs: the free service only has 512 MB RAM, so capacity is not yet verified.

The Render account is connected. The last confirmed live main-site deploy as of 2026-11-06 used branch `render-free`, commit `38fcddb239b85da443624674e1403ea7f4fa5580`. This statement does not replace checking each subsequent deployment.
