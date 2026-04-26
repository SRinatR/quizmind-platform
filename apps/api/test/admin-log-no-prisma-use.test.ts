import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('api prisma service does not use removed prisma $use middleware', async () => {
  const file = await readFile(new URL('../src/database/prisma.service.ts', import.meta.url), 'utf8');
  assert.equal(file.includes('$use('), false);
});
