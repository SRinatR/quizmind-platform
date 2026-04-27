import assert from 'node:assert/strict';
import test from 'node:test';

import { collectAdminAiRequestCandidateIds } from '../src/logs/admin-log-ai-request-candidates';

test('collectAdminAiRequestCandidateIds includes target, source and metadata aliases', () => {
  const ids = collectAdminAiRequestCandidateIds({
    targetType: 'ai_request',
    targetId: 'req_target',
    sourceRecordId: 'activity_1',
    metadata: { requestId: 'req_meta', aiRequestId: 'req_alias' },
    payload: { aiRequestEventId: 'req_payload' },
  });

  assert.deepEqual(ids, ['req_target', 'req_meta', 'req_alias', 'req_payload', 'activity_1']);
});

test('collectAdminAiRequestCandidateIds includes nested requestMetadata aliases', () => {
  const ids = collectAdminAiRequestCandidateIds({
    metadata: {
      requestMetadata: {
        requestId: 'req_nested',
        aiRequestId: 'req_nested_alias',
      },
    },
  });

  assert.deepEqual(ids, ['req_nested', 'req_nested_alias']);
});
