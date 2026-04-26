import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaPath = new URL('../../../packages/database/prisma/schema.prisma', import.meta.url);
const readModelMigrationPath = new URL('../../../packages/database/prisma/migrations/20260426203000_admin_log_events_read_model/migration.sql', import.meta.url);
const legacyIndexMigrationPath = new URL('../../../packages/database/prisma/migrations/20260426190000_admin_logs_scaling_indexes/migration.sql', import.meta.url);

test('AdminLogEvent model and migrations include required indexes and avoid legacy json trgm indexes', async () => {
  const schema = await readFile(schemaPath, 'utf8');
  const migration = await readFile(readModelMigrationPath, 'utf8');
  const legacyMigration = await readFile(legacyIndexMigrationPath, 'utf8');

  assert.match(schema, /model AdminLogEvent/);
  assert.match(schema, /@@unique\(\[stream, sourceRecordId\]\)/);

  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_trgm;/);
  assert.match(migration, /AdminLogEvent_stream_sourceRecordId_key/);
  assert.match(migration, /AdminLogEvent_occurredAt_id_idx/);
  assert.match(migration, /AdminLogEvent_stream_occurredAt_id_idx/);
  assert.match(migration, /AdminLogEvent_category_occurredAt_id_idx/);
  assert.match(migration, /AdminLogEvent_source_occurredAt_id_idx/);
  assert.match(migration, /AdminLogEvent_status_occurredAt_id_idx/);
  assert.match(migration, /AdminLogEvent_severity_occurredAt_id_idx/);
  assert.match(migration, /AdminLogEvent_actorId_occurredAt_id_idx/);
  assert.match(migration, /AdminLogEvent_eventType_occurredAt_id_idx/);
  assert.match(migration, /AdminLogEvent_searchText_trgm_idx/);
  assert.match(migration, /"searchText" gin_trgm_ops/);

  assert.equal(legacyMigration.includes('metadataJson_trgm_idx'), false);
  assert.equal(legacyMigration.includes('payloadJson_trgm_idx'), false);
});
