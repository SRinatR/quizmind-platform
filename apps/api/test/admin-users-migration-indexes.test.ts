import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('admin users migration contains trigram and role lookup indexes matching query strategy', () => {
  const migrationPath = path.resolve('../../packages/database/prisma/migrations/20260426120000_admin_users_cursor_indexes/migration.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS pg_trgm;/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS/);
  assert.doesNotMatch(sql, /CREATE INDEX CONCURRENTLY IF NOT EXISTS/);
  assert.match(sql, /"User_email_trgm_idx"/);
  assert.match(sql, /"User_displayName_trgm_idx"/);
  assert.match(sql, /"User_email_lower_trgm_idx"/);
  assert.match(sql, /"User_displayName_lower_trgm_idx"/);
  assert.match(sql, /"UserSystemRole_role_userId_idx"/);
});
