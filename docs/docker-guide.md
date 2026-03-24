# Docker Guide

This repository can be started fully through Docker Compose.

## Services

- `postgres` - PostgreSQL 16 with persistent volume.
- `redis` - Redis 7 with append-only persistence.
- `api` - NestJS API on port `4000`.
- `web` - Next.js app on port `3000`.
- `worker` - BullMQ-ready worker connected to Redis.

## First start

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up --build
```

If you do not need custom host ports, you can skip the env file and run:

```bash
docker compose up --build
```

## Background mode

```bash
docker compose --env-file .env.docker up --build -d
```

## Stop

```bash
docker compose down
```

To also remove PostgreSQL and Redis data volumes:

```bash
docker compose down -v
```

## Logs

```bash
docker compose logs -f
docker compose logs -f api
docker compose logs -f web
docker compose logs -f worker
```

## URLs

- Web: `http://localhost:3000`
- API health: `http://localhost:4000/health`
- API foundation payload: `http://localhost:4000/foundation`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

If you changed host ports in `.env.docker`, use those values instead.

## Notes

- The web container talks to the API internally through `http://api:4000`.
- The browser still uses `localhost` URLs on your laptop.
- PostgreSQL and Redis are available to the host machine for local inspection.
- Current API runtime is foundation-oriented: infrastructure is configured and reachable through Docker, while business data is still demo-seeded in memory.
- `docker-compose.yml` now forces `pull_policy: always` for `postgres` and `redis`, so the first `docker compose up --build` refreshes infra images automatically.
- Custom host ports are controlled through `API_HOST_PORT`, `WEB_HOST_PORT`, `POSTGRES_HOST_PORT`, and `REDIS_HOST_PORT` in `.env.docker`.
