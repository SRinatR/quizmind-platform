import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const routePath = path.resolve(process.cwd(), 'src/app/bff/admin/settings/ai-pricing/route.ts');

test('AI pricing BFF route forwards GET with bearer token and no-store', async () => {
  const source = await readFile(routePath, 'utf8');
  assert.match(source, /fetch\(`\$\{API_URL\}\/admin\/settings\/ai-pricing`, \{/);
  assert.match(source, /method: 'GET'/);
  assert.match(source, /cache: 'no-store'/);
  assert.match(source, /headers: \{ authorization: `Bearer \$\{accessToken\}` \}/);
});

test('AI pricing BFF route forwards PATCH with JSON body and no-store', async () => {
  const source = await readFile(routePath, 'utf8');
  assert.match(source, /method: 'PATCH'/);
  assert.match(source, /'content-type': 'application\/json'/);
  assert.match(source, /body: JSON\.stringify\(body \?\? \{\}\)/);
  assert.match(source, /cache: 'no-store'/);
});
