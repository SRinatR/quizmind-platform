import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const deployScript = readFileSync('scripts/deploy-server.sh', 'utf8');
const prodCompose = readFileSync('docker-compose.prod.yml', 'utf8');
const obsCompose = readFileSync('docker-compose.observability.yml', 'utf8');
const syncScript = readFileSync('scripts/sync-postgres-role-password.sh', 'utf8');

function runCheckProdEnv(envBody: string) {
  const dir = mkdtempSync(join(tmpdir(), 'check-prod-env-'));
  const envFile = join(dir, '.env.prod');
  writeFileSync(envFile, envBody);
  const result = spawnSync('node', ['scripts/check-prod-env.mjs', envFile], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

const baseEnv = `POSTGRES_DB=quizmind\nPOSTGRES_USER=postgres\nPOSTGRES_PASSWORD=secret123\nDATABASE_URL=postgresql://postgres:secret123@postgres:5432/quizmind\nREDIS_URL=redis://redis:6379\nJWT_SECRET=a\nJWT_REFRESH_SECRET=b\nEXTENSION_TOKEN_SECRET=c\nPROVIDER_CREDENTIAL_SECRET=d\n`;

test('deploy calls password sync before DB auth preflight', () => {
  const syncIx = deployScript.indexOf('bash scripts/sync-postgres-role-password.sh "${ENV_FILE}"');
  const preflightIx = deployScript.indexOf('Preflight: verifying DB credentials against running Postgres');
  assert.ok(syncIx >= 0, 'sync script call missing');
  assert.ok(preflightIx >= 0, 'preflight marker missing');
  assert.ok(syncIx < preflightIx, 'sync must happen before DB auth preflight');
});

test('prod api/worker commands no longer run db:migrate:deploy', () => {
  assert.equal(prodCompose.includes('db:migrate:deploy && corepack pnpm --filter @quizmind/api start'), false);
  assert.equal(prodCompose.includes('db:migrate:deploy && corepack pnpm --filter @quizmind/worker start'), false);
});

test('observability compose requires POSTGRES_EXPORTER_DSN', () => {
  assert.ok(obsCompose.includes('${POSTGRES_EXPORTER_DSN:?POSTGRES_EXPORTER_DSN is required for postgres-exporter}'));
});

test('check-prod-env allows missing POSTGRES_EXPORTER_DSN with warning', () => {
  const result = runCheckProdEnv(baseEnv);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout + result.stderr, /POSTGRES_EXPORTER_DSN is not set/);
});

test('check-prod-env rejects POSTGRES_EXPORTER_DSN password mismatch', () => {
  const result = runCheckProdEnv(baseEnv + 'POSTGRES_EXPORTER_DSN=postgresql://postgres:wrong@postgres:5432/quizmind\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /POSTGRES_EXPORTER_DSN password must match POSTGRES_PASSWORD/);
});

test('check-prod-env rejects POSTGRES_EXPORTER_DSN username or db mismatch', () => {
  const result = runCheckProdEnv(baseEnv + 'POSTGRES_EXPORTER_DSN=postgresql://other:secret123@postgres:5432/otherdb\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /POSTGRES_EXPORTER_DSN username must match POSTGRES_USER/);
  assert.match(result.stderr, /POSTGRES_EXPORTER_DSN database name must match POSTGRES_DB/);
});

test('sync script does not echo POSTGRES_PASSWORD variable name or raw password', () => {
  assert.equal(syncScript.includes('echo "${DB_PASS}"'), false);
  assert.equal(syncScript.includes('POSTGRES_PASSWORD='), false);
});
