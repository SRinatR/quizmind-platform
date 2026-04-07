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
- `cd /opt/quizmind-platform`
- `git fetch origin && git reset --hard origin/main` — deterministic update
- `docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env.docker up -d --build`
- Prints current commit SHA and container status
- Prunes dangling images with `docker image prune -f`

---

## Manual Deployment on the VPS

```bash
ssh root@ods.uz
bash /opt/quizmind-platform/scripts/deploy-server.sh
```

Or run the compose command directly:

```bash
cd /opt/quizmind-platform
git fetch origin && git reset --hard origin/main
docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env.docker up -d --build
```

---

## Inspecting Logs After Deploy

```bash
# Container status
docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env.docker ps

# API logs
docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env.docker logs -f api

# Web logs
docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env.docker logs -f web

# Worker logs
docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env.docker logs -f worker
```

---

## Rerunning a Deploy from GitHub Actions

Go to **Actions → Deploy to Production → Run workflow** and click **Run workflow**.

---

## Rollback

To roll back to a previous commit, SSH into the server and reset manually:

```bash
ssh root@ods.uz
cd /opt/quizmind-platform
git log --oneline -10          # find the target SHA
git reset --hard <target-sha>
docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env.docker up -d --build
```
