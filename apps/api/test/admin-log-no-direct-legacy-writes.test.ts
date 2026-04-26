import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(process.cwd(), 'src');
const forbidden = [
  'auditLog.create(',
  'activityLog.create(',
  'securityEvent.create(',
  'domainEvent.create(',
  'auditLog.createMany(',
  'activityLog.createMany(',
  'securityEvent.createMany(',
  'domainEvent.createMany(',
];

async function walk(dir: string, acc: string[] = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(abs, acc);
    } else if (entry.isFile() && abs.endsWith('.ts')) {
      acc.push(abs);
    }
  }
  return acc;
}

test('no direct legacy log create writes remain outside explicit write helper', async () => {
  const files = await walk(ROOT);
  const violations: string[] = [];

  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replaceAll('\\', '/');
    if (rel === 'src/logs/admin-log-write-path.ts') continue;
    const source = await readFile(file, 'utf8');
    for (const pattern of forbidden) {
      if (source.includes(pattern)) {
        violations.push(`${rel}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
