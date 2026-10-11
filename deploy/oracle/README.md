# Oracle Cloud Always Free — Gold Watch migration kit

**Status: prepared only.** This stack has not been provisioned or deployed to Oracle.
The currently running Railway services and all three Railway volumes are untouched.

## Why these services?

Default profile:
- **web**: Next.js UI, chart data, analysis, journal and in-process caches.
- **ml**: BTC XGBoost/LightGBM prediction, using persistent `/data`.
- **worker**: triggers structural analysis every 10s, and the independent **paper-only**
  scalp heartbeat every 5s. The worker must stay on if real-time updates are desired.
- **neural**: OPTIONAL `--profile neural`, because its latest production validation
  did **not** qualify. Keep its saved models/data; never delete the Railway volume
  until a verified export has been restored.
- **caddy**: OPTIONAL `--profile public` for domain HTTPS. Port 3000 remains
  bound to Oracle localhost, not exposed directly to the Internet.

Oracle's Always Free A1 offering (as documented June 2026) includes **2 OCPUs and
12 GB RAM** across Always Free A1 VMs per month. Availability is region dependent,
and Oracle may reclaim idle instances. Verify the Always Free tag before launch.
The A1 VM is **arm64**; do not assume old x86 machine images are compatible.

## 1. Create the Oracle VM

Create your own OCI account and select the home region carefully. Create an
Always Free `VM.Standard.A1.Flex` instance with **2 OCPUs / 12 GB**, Ubuntu
24.04 ARM64 and an Always Free boot volume. Do not provision any paid shape.
Assign an IP and secure SSH with a key. OCI security list / Network Security
Group and VM firewall should allow SSH from your own IP. Only add HTTP/HTTPS
ports 80/443 after configuring a real domain and Caddy. **Do not expose 3000
or 8000 publicly.**

Install Git and Docker Engine with the Compose v2 plugin using Docker's official
Ubuntu instructions: https://docs.docker.com/engine/install/ubuntu/

## 2. Clone and configure

After the PR is merged, clone the `railway` branch (or use the prepared PR
branch `upgrade/worker-cadence-20261011` while testing):

```bash
git clone -b upgrade/worker-cadence-20261011 https://github.com/ahmedrady1795-lgtm/ahmed-gold-watch.git
cd ahmed-gold-watch/deploy/oracle
cp .env.example .env
chmod 600 .env
sudo mkdir -p /opt/gold-watch-data/{web,ml,neural}
sudo docker compose --env-file .env -f compose.yaml config --quiet
```

Put the real, existing provider tokens in **.env on the VM only**; do not commit
or paste them into chat. The Compose file sets
`MT5_AUTOTRADE_ENABLED=false` and `KILL_SWITCH_ENABLED=true` regardless of
external configuration. This package never sends real MT5 orders.

## 3. Data migration is mandatory BEFORE cutover

Railway currently owns THREE different persistent mount points, all at
`/data` *inside different containers*:
- `ahmed-gold-watch` -> **web** -> `/opt/gold-watch-data/web`
- `predator-ml` -> **ml** -> `/opt/gold-watch-data/ml`
- `predator-neural` -> **neural** -> `/opt/gold-watch-data/neural`

The web volume includes the scalp paper ledger / accumulated observation
history; ML and neural contain learned models/data. Preserve file names,
timestamps and directory structure. First produce private verified exports
of **each** Railway volume using an authorized Railway shell/file transfer
method; the Railway Backups tab is useful for rollback but is not by itself
a proven cross-cloud file download. Never add a public unauthenticated
backup download endpoint.

For a verified archive that contains the *contents* of a Railway `/data` mount,
restore to the matching Oracle directory, e.g.:

```bash
sudo tar -xzf web-data.tar.gz -C /opt/gold-watch-data/web
sudo tar -xzf ml-data.tar.gz -C /opt/gold-watch-data/ml
sudo tar -xzf neural-data.tar.gz -C /opt/gold-watch-data/neural
```

Do NOT perform these commands on untrusted tarballs; compare SHA-256 hashes and
inspect the archive paths before extracting. If the archives contain a
top-level `data/` directory rather than the mount contents, adjust extraction
accordingly. Check ownership and that model/ledger files can be read/written.
**Do not delete any Railway service or volume until a successful recovery
test and a complete data comparison.**

## 4. Start the low-cost default stack

```bash
sudo docker compose --env-file .env -f compose.yaml up -d --build ml web worker
sudo docker compose --env-file .env -f compose.yaml ps
curl -fsS http://127.0.0.1:3000/api/live
```

Check `/api/health`, `/api/scalp`, and `/api/ai-snapshot` separately:
`/api/live` proves the web process is up, **not** that ML is trained,
provider prices are fresh, or predictions are accurate. Gold closed-market
data must remain BLOCKED instead of being advertised as live. When neural is
disabled, its model readiness must remain disabled/degraded, never falsely
reported as statistically qualified.

Inspect worker cadence:

```bash
sudo docker compose --env-file .env -f compose.yaml logs --tail=80 worker
```

Expected startup settings: `intervalMs=10000` and
`scalpIntervalMs=5000`. The root `learning-worker.mjs` uses its environment
variables even though its legacy fallback is 3000ms. The Compose stack sets
both variables explicitly. All scalp records are **paper-only**.

## 5. Optional public HTTPS

Point your own DNS A record to the Oracle VM, set `SITE_DOMAIN` in
`deploy/oracle/.env`, open TCP 80 and 443 in both OCI and the host firewall,
then:

```bash
sudo docker compose --env-file .env -f compose.yaml --profile public up -d
```

Caddy will request/renew TLS certificates automatically. Do not enable the
public profile with an unset domain. Do not expose the private Python
services. Keep the domain cutover until the new service passes smoke tests.

## 6. Optional neural research only

Only after restoring neural training data and reviewing its holdout quality:
set `NEURAL_ENGINE_URL=http://neural:8000` in `.env`, then run

```bash
sudo docker compose --env-file .env -f compose.yaml --profile neural up -d --build
```

This increases memory/CPU usage and does not authorize trades. You can
revert to the default by unsetting `NEURAL_ENGINE_URL` and stopping the
neural service without deleting `/opt/gold-watch-data/neural`.

## 7. Migration verification / rollback

- Restore a copy of all three state directories and compare hashes or file
  inventories. Test read/write and model load.
- Confirm price-source freshness, independent paper scalp heartbeat,
  market-closed BLOCKED guards, news feed, ledger persistence across a reboot,
  and that MT5 live execution is disabled.
- Compare new and old forecasts for a full active market session without
  publishing new entries as if they were broker fills.
- Only after confirming the new site works, switch the domain.
- Keep Railway running and its volumes intact until data parity and stability
  are proven. Roll back DNS to the old site if the Oracle instance fails.

## Notes

The Oracle starter's default memory footprint should be noticeably lower than
Railway's four always-on processes because the neural service is disabled.
Runtime performance and free-tier eligibility still require an actual ARM VM
test. Public/real-money trading is NOT enabled.
