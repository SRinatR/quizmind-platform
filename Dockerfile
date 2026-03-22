FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN corepack enable

COPY . .

RUN corepack pnpm install --frozen-lockfile

CMD ["corepack", "pnpm", "dev"]
