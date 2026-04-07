# Use public ECR mirror to avoid Docker Hub pull-rate limits on VPS deployments.
FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

# ── Dependency layer (cached unless lockfile changes) ─────────────────────────
COPY package.json pnpm-workspace.yaml .npmrc ./

COPY apps/api/package.json        ./apps/api/
COPY apps/web/package.json        ./apps/web/
COPY apps/worker/package.json     ./apps/worker/

COPY packages/auth/package.json        ./packages/auth/
COPY packages/billing/package.json     ./packages/billing/
COPY packages/config/package.json      ./packages/config/
COPY packages/contracts/package.json   ./packages/contracts/
COPY packages/database/package.json    ./packages/database/
COPY packages/email/package.json       ./packages/email/
COPY packages/extension/package.json   ./packages/extension/
COPY packages/logger/package.json      ./packages/logger/
COPY packages/permissions/package.json ./packages/permissions/
COPY packages/providers/package.json   ./packages/providers/
COPY packages/queue/package.json       ./packages/queue/
COPY packages/secrets/package.json     ./packages/secrets/
COPY packages/testing/package.json     ./packages/testing/
COPY packages/ui/package.json          ./packages/ui/
COPY packages/usage/package.json       ./packages/usage/

COPY pnpm-lock.yaml ./

RUN corepack pnpm config set fetch-retries 5 \
    && corepack pnpm config set fetch-retry-factor 2 \
    && corepack pnpm config set fetch-retry-mintimeout 10000 \
    && corepack pnpm config set fetch-retry-maxtimeout 60000 \
    && corepack pnpm install --no-frozen-lockfile --network-concurrency=8

COPY . .

RUN corepack pnpm --filter @quizmind/database db:generate

# ── Production web build stage ────────────────────────────────────────────────
# Run as a separate stage so the web app is compiled at image build time.
# Build args allow injecting public env vars without embedding secrets.
FROM base AS web-builder

ARG NEXT_PUBLIC_APP_URL=https://ods.uz
ARG NEXT_PUBLIC_API_URL=https://ods.uz/api

ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# Suppress env validation errors during build — runtime env is injected at startup.
ENV NEXT_PHASE=phase-production-build

WORKDIR /app/apps/web

RUN corepack pnpm --filter @quizmind/web build

# ── Default dev entrypoint (dev compose uses this) ────────────────────────────
FROM base AS dev

CMD ["corepack", "pnpm", "dev"]

# ── Default image is the full base (suitable for api/worker runtime) ──────────
FROM base
CMD ["corepack", "pnpm", "dev"]
