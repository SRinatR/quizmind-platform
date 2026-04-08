# Deployment Guide

## Overview

Pushing to `main` triggers an automatic deployment to the VPS via GitHub Actions.
The deploy workflow SSHes into the server and runs `scripts/deploy-server.sh`.

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
4. **`.env.docker` present** at `/opt/quizmind-platform/.env.docker` with all required secrets.
5. **Deploy script executable**:
   ```bash
   chmod +x /opt/quizmind-platform/scripts/deploy-server.sh
   ```

---

## How the Deploy Script Works

`scripts/deploy-server.sh`:
- Accepts `--ref <branch>` (defaults to `main` when omitted)
- Validates and sanitizes the ref before use; exits with an error if the ref is unsafe or not found on the remote
- `cd /opt/quizmind-platform`
- `git fetch origin && git reset --hard origin/<ref>` — deploys the exact requested ref
- `docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.docker up -d --build`
- Prints current commit SHA and container status
- Prunes dangling images with `docker image prune -f`
- Writes `.deployed-sha` with `sha`, `ref`, `ci_sha`, and `deployed_at` fields

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
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.docker up -d --build
```

To verify which ref is currently deployed:
```bash
cat /opt/quizmind-platform/.deployed-sha
```

---

## Inspecting Logs After Deploy

```bash
# Container status
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.docker ps

# API logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.docker logs -f api

# Web logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.docker logs -f web

# Worker logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.docker logs -f worker
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

## Rollback

To roll back to a previous commit, SSH into the server and reset manually:

```bash
ssh root@ods.uz
cd /opt/quizmind-platform
git log --oneline -10          # find the target SHA
git reset --hard <target-sha>
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.docker up -d --build
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

### GitVerse mirror — `.env.docker` block

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

### Timeweb mirror — `.env.docker` block

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

### Launching the observability stack

After setting the image variables in `.env.docker`, start the stack:

```bash
cd /opt/quizmind-platform
docker compose -f docker-compose.observability.yml --env-file .env.docker up -d
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
