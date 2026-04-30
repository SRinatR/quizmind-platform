# Deployment Guide

## Overview

Pushing to `main` triggers an automatic deployment to the VPS via GitHub Actions.
The deploy workflow SSHes into the server and runs `scripts/deploy-server.sh`.

---

## Single Source of Truth: `.env.prod`

All DB credentials and runtime secrets are read exclusively from
`/opt/quizmind-platform/.env.prod` on the server. There is no fallback to
hardcoded values.

The four DB variables must be internally consistent:

```dotenv
POSTGRES_USER=...
POSTGRES_PASSWORD=...
POSTGRES_DB=...
DATABASE_URL=postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>
```

The production preflight also requires `REDIS_URL`, `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `EXTENSION_TOKEN_SECRET`, and
`PROVIDER_CREDENTIAL_SECRET` to be present and non-empty. `DATABASE_URL` must
use the Docker service host `postgres`, and its username, password, and database
name must match the `POSTGRES_*` values in the same `.env.prod`.

**Changing `POSTGRES_PASSWORD` in `.env.prod` alone does NOT update the stored
Postgres role.** The deploy script will catch the mismatch via the DB auth
preflight and abort before any migration runs. See *Database Credential
Management* below for the fix procedure.

---

## Required GitHub Secrets

| Secret | Value |
|---|---|
| `VPS_SSH_KEY` | Private SSH key that can log into the VPS as `root` |

> The host (`ods.uz`), port (`22`), and user (`root`) are hardcoded in the workflow.

---

## Server Prerequisites

1. **Docker + Docker Compose** installed on the VPS.
2. **SSH access** — the public key matching `VPS_SSH_KEY` must be in `/root/.ssh/authorized_keys`.
3. **Repo cloned** at `/opt/quizmind-platform` and tracking `origin/main`:
   ```bash
   git clone git@github.com:SRinatR/quizmind-platform.git /opt/quizmind-platform
   ```
4. **`.env.prod` present** at `/opt/quizmind-platform/.env.prod` with all required secrets.
5. **Deploy script executable**:
   ```bash
   chmod +x /opt/quizmind-platform/scripts/deploy-server.sh
   ```

---

## How the Deploy Script Works

`scripts/deploy-server.sh`:
- Accepts `--sha` / `--ref` arguments passed from CI
- **Validates `.env.prod`** exists, then runs `scripts/check-prod-env.mjs` before containers start. The preflight exits immediately if required DB, Redis, JWT, extension-token, or provider-credential secrets are missing or inconsistent
- `cd /opt/quizmind-platform`
- `git fetch origin && git reset --hard origin/main` — deploys the exact commit
- Builds images with `docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml build`
- Starts postgres and redis; waits for each to be healthy
- **Self-heal DB credentials**: runs `scripts/sync-postgres-role-password.sh .env.prod` to reconcile the persisted Postgres role password with `.env.prod` before any migration/runtime auth attempts
- **DB auth preflight**: runs a `pg.Client` probe (Node.js `require('pg')`) inside the built `api` image using `DATABASE_URL` exactly as provided in `.env.prod` — no bash URL parsing. Exits non-zero immediately if authentication fails, before migrations or service startup
- Runs Prisma migrations (exits non-zero if migrations fail). `deploy-server.sh` is the single migration owner in production
- Starts api, worker, and web (runtime containers no longer run Prisma migrations on boot)
- **Waits for api and web containers to report healthy** (up to 3 minutes each; exits non-zero on timeout)
- **Post-deploy smoke checks**: HTTP GET on `api /health`, `api /ready`, and `web :3000` from localhost — exits non-zero and marks deploy failed if any check fails. No silent broken deploys.
- Prunes dangling images with `docker image prune -f`
- Writes `.deployed-sha` with `sha`, `ref`, `ci_sha`, and `deployed_at` fields only after all checks pass

---

## Manual Deployment on the VPS

Deploy `main` (default):
```bash
ssh root@ods.uz
bash /opt/quizmind-platform/scripts/deploy-server.sh
```

Deploy a specific branch:
```bash
ssh root@ods.uz
bash /opt/quizmind-platform/scripts/deploy-server.sh --ref feature/my-branch
```

Or run the compose command directly for a given ref:
```bash
cd /opt/quizmind-platform
git fetch origin && git reset --hard origin/main
node scripts/check-prod-env.mjs .env.prod
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

To verify which ref is currently deployed:
```bash
cat /opt/quizmind-platform/.deployed-sha
```

---

## Inspecting Logs After Deploy

```bash
# Container status
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml ps

# API logs
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml logs -f api

# Web logs
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml logs -f web

# Worker logs
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml logs -f worker
```

---

## Triggering a Deploy from GitHub Actions

**Push to `main`** — deploys `main` automatically.

**Manual deploy of any branch:**
1. Go to **Actions → Deploy to Production → Run workflow**
2. Fill in the **"Branch or ref to deploy"** input (e.g. `feature/my-branch`). Defaults to `main`.
3. Click **Run workflow**

The workflow resolves the ref from the explicit input (for `workflow_dispatch`) or from `github.ref_name` (for push triggers), then passes it as `--ref` to the server-side script.

---

## Database Credential Management

Production DB credentials are sourced exclusively from `.env.prod` on the server.
The four variables that must be consistent with each other are:

```
POSTGRES_USER=...
POSTGRES_PASSWORD=...
POSTGRES_DB=...
DATABASE_URL=postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>
```

**Important:** `POSTGRES_PASSWORD` in `docker-compose.yml` / `.env.prod` is only used
by Postgres during **initial volume initialisation**. If the data volume already exists,
changing this variable does **not** update the stored role password — the deploy will
fail the auth preflight check.

### Credential drift behavior and automatic repair

Root cause of recurring `28P01` storms: `POSTGRES_PASSWORD` is only consumed during first volume initialization. Updating `.env.prod` later does not rewrite the persisted Postgres role password. If `.env.prod` and stored role password drift, every service using `DATABASE_URL` will continuously fail authentication.

Deploy now auto-heals this drift before preflight/migrations/startup:

```bash
bash scripts/sync-postgres-role-password.sh .env.prod
```

The script connects as OS `postgres` user inside `quizmind-postgres`, verifies the role exists, and runs `ALTER ROLE` with the password from `.env.prod` without printing secrets. It is idempotent and safe on every deploy.

---

## Quick Verification After Deploy

Run these from the server to confirm a healthy state:

```bash
# Container health status
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml ps

# API liveness / readiness
curl -sf http://127.0.0.1:4000/health && echo " OK /health"
curl -sf http://127.0.0.1:4000/ready  && echo " OK /ready"

# Web root (nginx/Next.js)
curl -sf http://127.0.0.1:3000 -o /dev/null -w "%{http_code}\n"

# Confirm which SHA is deployed
cat /opt/quizmind-platform/.deployed-sha
```

---

## Rollback

To roll back to a previous commit, SSH into the server and reset manually:

```bash
ssh root@ods.uz
cd /opt/quizmind-platform
git log --oneline -10          # find the target SHA
bash /opt/quizmind-platform/scripts/rollback-server.sh --sha <target-sha>
```

---

## Observability Stack — Docker Hub Mirror Support

The observability stack (`docker-compose.observability.yml`) uses env-configurable image variables so the VPS can pull through a Docker Hub mirror instead of Docker Hub directly.

### Which images can be mirrored

All images except cAdvisor originate from Docker Hub and can be overridden:

| Variable | Default (upstream) |
|---|---|
| `PROMETHEUS_IMAGE` | `prom/prometheus:v2.53.3` |
| `GRAFANA_IMAGE` | `grafana/grafana:11.2.2` |
| `LOKI_IMAGE` | `grafana/loki:3.1.1` |
| `ALLOY_IMAGE` | `grafana/alloy:v1.4.3` |
| `ALERTMANAGER_IMAGE` | `prom/alertmanager:v0.27.0` |
| `NODE_EXPORTER_IMAGE` | `prom/node-exporter:v1.8.2` |
| `POSTGRES_EXPORTER_IMAGE` | `prometheuscommunity/postgres-exporter:v0.15.0` |
| `REDIS_EXPORTER_IMAGE` | `oliver006/redis_exporter:v1.63.0` |
| `BLACKBOX_EXPORTER_IMAGE` | `prom/blackbox-exporter:v0.25.0` |

**cAdvisor is kept separately** on `gcr.io/cadvisor/cadvisor:v0.49.1` (variable `CADVISOR_IMAGE`).
Docker Hub mirrors only proxy Docker Hub — they cannot resolve `gcr.io` images.
Do not set `CADVISOR_IMAGE` to a Docker Hub mirror path.

### GitVerse mirror — `.env.prod` block

```dotenv
# Observability images via dh-mirror.gitverse.ru
PROMETHEUS_IMAGE=dh-mirror.gitverse.ru/prom/prometheus:v2.53.3
GRAFANA_IMAGE=dh-mirror.gitverse.ru/grafana/grafana:11.2.2
LOKI_IMAGE=dh-mirror.gitverse.ru/grafana/loki:3.1.1
ALLOY_IMAGE=dh-mirror.gitverse.ru/grafana/alloy:v1.4.3
ALERTMANAGER_IMAGE=dh-mirror.gitverse.ru/prom/alertmanager:v0.27.0
NODE_EXPORTER_IMAGE=dh-mirror.gitverse.ru/prom/node-exporter:v1.8.2
POSTGRES_EXPORTER_IMAGE=dh-mirror.gitverse.ru/prometheuscommunity/postgres-exporter:v0.15.0
REDIS_EXPORTER_IMAGE=dh-mirror.gitverse.ru/oliver006/redis_exporter:v1.63.0
BLACKBOX_EXPORTER_IMAGE=dh-mirror.gitverse.ru/prom/blackbox-exporter:v0.25.0
# cAdvisor stays on gcr.io — not routable through Docker Hub mirrors
CADVISOR_IMAGE=gcr.io/cadvisor/cadvisor:v0.49.1
```

### Timeweb mirror — `.env.prod` block

```dotenv
# Observability images via dockerhub.timeweb.cloud
PROMETHEUS_IMAGE=dockerhub.timeweb.cloud/prom/prometheus:v2.53.3
GRAFANA_IMAGE=dockerhub.timeweb.cloud/grafana/grafana:11.2.2
LOKI_IMAGE=dockerhub.timeweb.cloud/grafana/loki:3.1.1
ALLOY_IMAGE=dockerhub.timeweb.cloud/grafana/alloy:v1.4.3
ALERTMANAGER_IMAGE=dockerhub.timeweb.cloud/prom/alertmanager:v0.27.0
NODE_EXPORTER_IMAGE=dockerhub.timeweb.cloud/prom/node-exporter:v1.8.2
POSTGRES_EXPORTER_IMAGE=dockerhub.timeweb.cloud/prometheuscommunity/postgres-exporter:v0.15.0
REDIS_EXPORTER_IMAGE=dockerhub.timeweb.cloud/oliver006/redis_exporter:v1.63.0
BLACKBOX_EXPORTER_IMAGE=dockerhub.timeweb.cloud/prom/blackbox-exporter:v0.25.0
# cAdvisor stays on gcr.io — not routable through Docker Hub mirrors
CADVISOR_IMAGE=gcr.io/cadvisor/cadvisor:v0.49.1
```

### Required: `POSTGRES_EXPORTER_DSN`

`docker-compose.observability.yml` requires `POSTGRES_EXPORTER_DSN` to be set
in `.env.prod` — there is no hardcoded fallback. Example:

```dotenv
POSTGRES_EXPORTER_DSN=postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>?sslmode=disable
```

### Launching the observability stack

After setting the image variables (and `POSTGRES_EXPORTER_DSN`) in `.env.prod`, start the stack:

```bash
cd /opt/quizmind-platform
docker compose --env-file .env.prod -f docker-compose.observability.yml up -d
```

No manual `docker pull` or `docker tag` steps are required. Compose resolves the image names at startup.

### Optional: Docker daemon `registry-mirrors`

You can also configure `/etc/docker/daemon.json` on the VPS to use a registry mirror globally:

```json
{
  "registry-mirrors": ["https://dh-mirror.gitverse.ru"]
}
```

Then restart Docker: `systemctl restart docker`

**Important:** daemon-level `registry-mirrors` only redirect Docker Hub pulls (`docker.io`).
They do **not** affect `gcr.io` images such as cAdvisor.
Explicit image variables (above) are the recommended approach as they are more predictable and don't require daemon changes.


## Observability DSN requirements

If you run `docker-compose.observability.yml`, set `POSTGRES_EXPORTER_DSN` so it matches `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` (and host `postgres`). `scripts/check-prod-env.mjs` validates this when the DSN is present, and warns (without failing app deploy) when it is missing.

`postgres-exporter` now fails fast when DSN is absent:

```yaml
DATA_SOURCE_NAME: "${POSTGRES_EXPORTER_DSN:?POSTGRES_EXPORTER_DSN is required for postgres-exporter}"
```

After changing exporter DSN, recreate exporter:

```bash
docker compose --env-file .env.prod -f docker-compose.observability.yml up -d --force-recreate postgres-exporter
```
