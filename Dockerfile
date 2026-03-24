FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

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

CMD ["corepack", "pnpm", "dev"]
