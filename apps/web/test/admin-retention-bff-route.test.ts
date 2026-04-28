import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const routePath = path.resolve(process.cwd(), 'src/app/bff/admin/settings/retention/route.ts');

test('Retention BFF route forwards bearer token and no-store on GET', async () => {
  const source = await readFile(routePath, 'utf8');
  assert.match(source, /headers: \{ authorization: `Bearer \$\{accessToken\}` \}/);
  assert.match(source, /method: 'GET'/);
  assert.match(source, /cache: 'no-store'/);
});

test('Retention BFF route forwards PATCH JSON body and no-store', async () => {
  const source = await readFile(routePath, 'utf8');
  assert.match(source, /method: 'PATCH'/);
  assert.match(source, /'content-type': 'application\/json'/);
  assert.match(source, /body: JSON\.stringify\(body \?\? \{\}\)/);
  assert.match(source, /cache: 'no-store'/);
});
