import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('users GET route forwards to /admin/billing/users with query and no-store', async () => {
  const source = await readFile('src/app/bff/admin/billing/users/route.ts', 'utf8');
  assert.match(source, /\/admin\/billing\/users\$\{qs/);
  assert.match(source, /cache:\s*'no-store'/);
  assert.match(source, /authorization:\s*`Bearer \$\{accessToken\}`/);
});

test('wallet adjustments POST forwards body/auth', async () => {
  const source = await readFile('src/app/bff/admin/billing/wallet-adjustments/route.ts', 'utf8');
  assert.match(source, /\/admin\/billing\/wallet-adjustments/);
  assert.match(source, /method:\s*'POST'/);
  assert.match(source, /body:\s*JSON\.stringify/);
  assert.match(source, /authorization:\s*`Bearer \$\{accessToken\}`/);
});

test('override PATCH and DELETE forward to /admin/billing/users/:userId/override', async () => {
  const source = await readFile('src/app/bff/admin/billing/users/[userId]/override/route.ts', 'utf8');
  assert.match(source, /\/admin\/billing\/users\/\$\{encodeURIComponent\(userId\)\}\/override/);
  assert.match(source, /method:\s*'PATCH'/);
  assert.match(source, /method:\s*'DELETE'/);
});
