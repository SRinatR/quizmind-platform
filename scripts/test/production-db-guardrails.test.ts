import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const deployScript = readFileSync('scripts/deploy-server.sh', 'utf8');
const prodCompose = readFileSync('docker-compose.prod.yml', 'utf8');
const obsCompose = readFileSync('docker-compose.observability.yml', 'utf8');
const syncScript = readFileSync('scripts/sync-postgres-role-password.sh', 'utf8');
const dbAuthScript = readFileSync('scripts/check-prod-db-auth.sh', 'utf8');
const resourceScript = readFileSync('scripts/check-prod-resource-health.sh', 'utf8');
const observabilityStartScript = readFileSync('scripts/observability-start.sh', 'utf8');
const deployWorkflow = readFileSync('.github/workflows/deploy.yml', 'utf8');

const startIx = deployScript.indexOf('$DC up -d api worker web');

test('deploy uses only default + prod compose files (not observability)', () => {
  assert.ok(deployScript.includes('-f docker-compose.yml -f docker-compose.prod.yml'));
  assert.equal(deployScript.includes('docker-compose.observability.yml'), false);
});

test('deploy calls password sync before app startup', () => {
  const syncIx = deployScript.indexOf('bash scripts/sync-postgres-role-password.sh "${ENV_FILE}"');
  assert.ok(syncIx >= 0, 'sync script call missing');
  assert.ok(startIx >= 0, 'api/worker/web startup missing');
  assert.ok(syncIx < startIx, 'sync must happen before app startup');
});

test('deploy calls db auth preflight before app startup', () => {
  const preflightIx = deployScript.indexOf('bash scripts/check-prod-db-auth.sh "${ENV_FILE}"');
  assert.ok(preflightIx >= 0, 'db auth preflight call missing');
  assert.ok(startIx >= 0, 'api/worker/web startup missing');
  assert.ok(preflightIx < startIx, 'db auth preflight must happen before app startup');
});

test('deploy aborts immediately when db auth preflight fails', () => {
  const preflightIx = deployScript.indexOf('if ! bash scripts/check-prod-db-auth.sh "${ENV_FILE}"; then');
  const exitIx = deployScript.indexOf('exit 1', preflightIx);
  const appIx = deployScript.indexOf('$DC up -d api worker web');
  assert.ok(preflightIx >= 0, 'missing guarded preflight block');
  assert.ok(exitIx > preflightIx, 'missing exit on failed preflight');
  assert.ok(exitIx < appIx, 'exit must happen before app startup');
});


test('deploy stops optional observability before docker build', () => {
  const stopIx = deployScript.indexOf('bash scripts/observability-stop.sh || true');
  const buildIx = deployScript.indexOf('$DC build');
  assert.ok(stopIx >= 0, 'observability stop call missing');
  assert.ok(buildIx > stopIx, 'observability stop should happen before docker build');
});

test('postgres-exporter is not part of default app startup', () => {
  assert.equal(prodCompose.includes('postgres-exporter:'), false);
  assert.ok(obsCompose.includes('postgres-exporter:'));
});

test('sync script forbids node/tsx/require/source env and keeps ALTER ROLE', () => {
  for (const marker of ['node', 'tsx', 'require(', 'source .env']) {
    assert.equal(syncScript.includes(marker), false, `unexpected marker in sync script: ${marker}`);
  }
  assert.ok(syncScript.includes("ALTER ROLE :\"user\" WITH PASSWORD :'pass';"));
});

test('check-prod-db-auth script exists and avoids secret printing markers', () => {
  assert.ok(dbAuthScript.includes('DB OK'));
  assert.equal(dbAuthScript.includes('console.log(process.env.DATABASE_URL)'), false);
  assert.equal(dbAuthScript.includes('echo "$DATABASE_URL"'), false);
});

test('sync script is bash syntax-valid', () => {
  const result = spawnSync('bash', ['-n', 'scripts/sync-postgres-role-password.sh'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('db auth and observability scripts are bash syntax-valid', () => {
  for (const file of [
    'scripts/check-prod-db-auth.sh',
    'scripts/observability-stop.sh',
    'scripts/observability-start.sh',
    'scripts/observability-status.sh',
  ]) {
    const result = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
  }
});


test('deploy workflow updates repo before running deploy script', () => {
  const cdIx = deployWorkflow.indexOf('cd "$DEPLOY_DIR"');
  const fetchIx = deployWorkflow.indexOf('git fetch origin');
  const resetIx = deployWorkflow.indexOf('git reset --hard origin/main');
  const runIx = deployWorkflow.indexOf('bash scripts/deploy-server.sh');

  assert.ok(cdIx >= 0, 'deploy workflow must cd into deploy dir');
  assert.ok(fetchIx > cdIx, 'git fetch must run after cd');
  assert.ok(resetIx > fetchIx, 'git reset must run after fetch');
  assert.ok(runIx > resetIx, 'deploy script must run after fetch/reset');
});

test('deploy workflow does not call absolute deploy script path as entrypoint', () => {
  assert.equal(deployWorkflow.includes("bash ${{ vars.DEPLOY_DIR || '/opt/quizmind-platform' }}/scripts/deploy-server.sh"), false);
});

test('deploy workflow does not reference observability compose in normal deploy', () => {
  const deploySshStepIx = deployWorkflow.indexOf('name: Deploy via SSH');
  const smokeStepIx = deployWorkflow.indexOf('name: Smoke check — API health');
  const deploySection = deployWorkflow.slice(deploySshStepIx, smokeStepIx);
  assert.equal(deploySection.includes('docker-compose.observability.yml'), false);
});


test('prod compose sets conservative memory limits for core services', () => {
  for (const [service, limit] of [['postgres','768m'],['redis','256m'],['api','768m'],['worker','768m'],['web','512m']] as const) {
    assert.ok(prodCompose.includes(`${service}:`), `missing service ${service}`);
    assert.ok(prodCompose.includes(`mem_limit: ${limit}`), `missing mem_limit for ${service}`);
  }
  for (const reservation of ['mem_reservation: 256m', 'mem_reservation: 64m', 'mem_reservation: 192m']) {
    assert.ok(prodCompose.includes(reservation));
  }
});


test('resource diagnostic script exists, is bash-valid, and avoids obvious secret printing', () => {
  const syntax = spawnSync('bash', ['-n', 'scripts/check-prod-resource-health.sh'], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);

  for (const marker of ['echo "$DATABASE_URL"', 'printenv', 'cat .env.prod']) {
    assert.equal(resourceScript.includes(marker), false, `unexpected marker: ${marker}`);
  }
  assert.equal(/(^|\n)\s*env(\s|$)/.test(resourceScript), false, 'unexpected raw env command');
});


test('resource diagnostic script resolves API_HOST_PORT from env or env file with fallback', () => {
  assert.ok(resourceScript.includes('ENV_FILE="${1:-.env.prod}"'));
  assert.ok(resourceScript.includes('resolve_api_host_port'));
  assert.ok(resourceScript.includes('API_HOST_PORT'));
  assert.ok(resourceScript.includes('awk -F='));
  assert.ok(resourceScript.includes("printf '4000"));
});

test('observability start validates DSN connectivity and avoids printing DSN', () => {
  assert.ok(observabilityStartScript.includes('quizmind-postgres is not running'));
  assert.ok(observabilityStartScript.includes('docker run --rm --network container:quizmind-postgres'));
  assert.ok(observabilityStartScript.includes('psql'));
  assert.equal(observabilityStartScript.includes('echo "$DSN"'), false);
});


test('prod compose runtime commands for api/worker do not invoke tsx/ts-node/src main', () => {
  const lowered = prodCompose.toLowerCase();
  assert.ok(lowered.includes('@quizmind/api start:prod'));
  assert.ok(lowered.includes('@quizmind/worker start:prod'));
  for (const forbidden of ['tsx', 'ts-node', 'src/main.ts']) {
    assert.equal(lowered.includes(forbidden), false, `prod compose contains forbidden runtime token: ${forbidden}`);
  }
});

test('dockerfile builds api and worker before runtime', () => {
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  assert.ok(dockerfile.includes('corepack pnpm --filter @quizmind/api build'));
  assert.ok(dockerfile.includes('corepack pnpm --filter @quizmind/worker build'));
});

test('api and worker package scripts keep dev tsx but provide compiled production start', () => {
  const apiPkg = readFileSync('apps/api/package.json', 'utf8');
  const workerPkg = readFileSync('apps/worker/package.json', 'utf8');

  for (const pkg of [apiPkg, workerPkg]) {
    assert.ok(pkg.includes('"dev": "tsx watch src/main.ts"'));
    assert.ok(pkg.includes('"start": "tsx src/main.ts"'));
    assert.ok(pkg.includes('"start:prod": "node dist/main.js"'));
    assert.ok(pkg.includes('"build": "tsc -p tsconfig.build.json"'));
  }
});
