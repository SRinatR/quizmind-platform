#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = process.argv[2] ?? '.env.prod';
const envPath = resolve(process.cwd(), envFile);
const expectedPostgresHost = process.env.EXPECTED_POSTGRES_HOST ?? 'postgres';

const requiredKeys = [
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'EXTENSION_TOKEN_SECRET',
  'PROVIDER_CREDENTIAL_SECRET',
];

function fail(messages) {
  console.error('Production environment preflight failed:');
  for (const message of messages) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const inner = trimmed.slice(1, -1);
    return trimmed.startsWith('"')
      ? inner.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"')
      : inner;
  }

  const commentIndex = trimmed.search(/\s+#/);
  return (commentIndex >= 0 ? trimmed.slice(0, commentIndex) : trimmed).trim();
}

function parseEnvFile(path) {
  const values = {};
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      return;
    }

    if (line.startsWith('export ')) {
      line = line.slice('export '.length).trim();
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      fail([`${envFile}:${index + 1} is not a KEY=value assignment.`]);
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = unquote(line.slice(separatorIndex + 1));
    values[key] = value;
  });

  return values;
}

if (!existsSync(envPath)) {
  fail([`${envFile} was not found at ${envPath}. Production deploys must use the same .env.prod file every time.`]);
}

const env = parseEnvFile(envPath);
const issues = [];

for (const key of requiredKeys) {
  if (!env[key] || env[key].trim().length === 0) {
    issues.push(`${key} is missing or empty in ${envFile}.`);
  }
}

let databaseUrl;
if (env.DATABASE_URL) {
  try {
    databaseUrl = new URL(env.DATABASE_URL);
  } catch {
    issues.push('DATABASE_URL must be a valid absolute Postgres URL.');
  }
}

if (databaseUrl) {
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    issues.push('DATABASE_URL must use the postgres:// or postgresql:// protocol.');
  }

  if (databaseUrl.hostname !== expectedPostgresHost) {
    issues.push(`DATABASE_URL host must be "${expectedPostgresHost}" for Docker production networking.`);
  }

  const databaseUser = decodeURIComponent(databaseUrl.username);
  const databasePassword = decodeURIComponent(databaseUrl.password);
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ''));

  if (databaseUser !== env.POSTGRES_USER) {
    issues.push('DATABASE_URL username must match POSTGRES_USER.');
  }

  if (databasePassword !== env.POSTGRES_PASSWORD) {
    issues.push('DATABASE_URL password must match POSTGRES_PASSWORD.');
  }

  if (databaseName !== env.POSTGRES_DB) {
    issues.push('DATABASE_URL database name must match POSTGRES_DB.');
  }
}


const warnings = [];

let exporterUrl;
if (env.POSTGRES_EXPORTER_DSN && env.POSTGRES_EXPORTER_DSN.trim().length > 0) {
  try {
    exporterUrl = new URL(env.POSTGRES_EXPORTER_DSN);
  } catch {
    issues.push('POSTGRES_EXPORTER_DSN must be a valid absolute Postgres URL when provided.');
  }

  if (exporterUrl) {
    if (!['postgres:', 'postgresql:'].includes(exporterUrl.protocol)) {
      issues.push('POSTGRES_EXPORTER_DSN must use the postgres:// or postgresql:// protocol.');
    }

    const exporterUser = decodeURIComponent(exporterUrl.username);
    const exporterPassword = decodeURIComponent(exporterUrl.password);
    const exporterDb = decodeURIComponent(exporterUrl.pathname.replace(/^\/+/, ''));

    if (exporterUser !== env.POSTGRES_USER) {
      issues.push('POSTGRES_EXPORTER_DSN username must match POSTGRES_USER.');
    }

    if (exporterPassword !== env.POSTGRES_PASSWORD) {
      issues.push('POSTGRES_EXPORTER_DSN password must match POSTGRES_PASSWORD.');
    }

    if (exporterDb !== env.POSTGRES_DB) {
      issues.push('POSTGRES_EXPORTER_DSN database name must match POSTGRES_DB.');
    }

    if (exporterUrl.hostname !== expectedPostgresHost) {
      issues.push(`POSTGRES_EXPORTER_DSN host should be "${expectedPostgresHost}" for Docker production networking.`);
    }
  }
} else {
  warnings.push('POSTGRES_EXPORTER_DSN is not set. This is allowed for app deploys, but required when running postgres-exporter in observability stack.');
}

if (env.REDIS_URL) {
  try {
    const redisUrl = new URL(env.REDIS_URL);
    if (!['redis:', 'rediss:'].includes(redisUrl.protocol)) {
      issues.push('REDIS_URL must use the redis:// or rediss:// protocol.');
    }
  } catch {
    issues.push('REDIS_URL must be a valid absolute Redis URL.');
  }
}

if (issues.length > 0) {
  fail(issues);
}

console.log(`Production environment preflight OK: ${envFile}`);
for (const warning of warnings) {
  console.warn(`Production environment preflight warning: ${warning}`);
}
