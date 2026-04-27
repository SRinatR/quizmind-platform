import assert from 'node:assert/strict';
import test from 'node:test';

import { actorLabel, formatCost, shortId, targetLabel } from '../src/app/admin/[section]/logs-explorer-formatters';

test('actorLabel prefers display name then email then shortened id', () => {
  assert.equal(actorLabel({ actor: { id: 'user_1', displayName: 'Admin' } } as any), 'Admin');
  assert.equal(actorLabel({ actor: { id: 'user_1', email: 'admin@example.com' } } as any), 'admin@example.com');
  assert.equal(actorLabel({ actor: { id: 'cmnp0hiuu00002vmlstfo1ucu' } } as any), 'cmnp0hiu…fo1ucu');
});

test('targetLabel keeps values readable and compact', () => {
  assert.equal(targetLabel({ installationId: 'install_1234567890abcdef', category: 'extension' } as any), 'Installation install_…abcdef');
  assert.equal(targetLabel({ category: 'ai', targetType: 'ai_request', targetId: 'req_1234567890abcdef' } as any), 'AI request req_1234…abcdef');
  assert.equal(targetLabel({ targetType: 'user', targetId: 'cmnp0hiuu00002vmlstfo1ucu' } as any), 'User cmnp0hiu…fo1ucu');
});

test('shortId and formatCost remain safe for nulls', () => {
  assert.equal(shortId(undefined), '—');
  assert.equal(formatCost(undefined), '—');
  assert.equal(formatCost(null as unknown as number), '—');
  assert.equal(formatCost(0), '$0.0000');
  assert.equal(formatCost(0.0001), '<$0.001');
});
