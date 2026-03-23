FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

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
COPY packages/extension/package.json   ./packages/extension/
COPY packages/logger/package.json      ./packages/logger/
COPY packages/permissions/package.json ./packages/permissions/
COPY packages/ui/package.json          ./packages/ui/

COPY pnpm-lock.yaml ./

RUN corepack pnpm install --no-frozen-lockfile

COPY . .

CMD ["corepack", "pnpm", "dev"]