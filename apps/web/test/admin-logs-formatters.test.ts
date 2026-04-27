import assert from 'node:assert/strict';
import test from 'node:test';

import { actorLabel, formatCost, shortId, targetLabel } from '../src/app/admin/[section]/logs-explorer-formatters';

test('actorLabel prefers display name then email then shortened id', () => {
  assert.equal(actorLabel({ actor: { id: 'user_1', displayName: 'Admin' } } as any), 'Admin');
  assert.equal(actorLabel({ actor: { id: 'user_1', email: 'admin@example.com' } } as any), 'admin@example.com');
  assert.equal(actorLabel({ actor: { id: 'cmnp0hiuu00002vmlstfo1ucu' } } as any), 'cmnp0hiu…fo1ucu');
});

test('targetLabel hides technical ids in table labels', () => {
  assert.equal(targetLabel({ category: 'ai', targetType: 'ai_request', targetId: 'req_1234567890abcdef' } as any), 'AI request');
  assert.equal(targetLabel({ installationId: 'install_1234567890abcdef', category: 'extension' } as any), 'Installation');
  assert.equal(targetLabel({ targetType: 'user', targetId: 'cmnp0hiuu00002vmlstfo1ucu' } as any), 'User');
  assert.equal(targetLabel({ targetType: 'http_request', targetId: 'req_1' } as any), 'HTTP request');
  assert.equal(targetLabel({} as any), '—');
});

test('formatCost respects selected balance display currency and nulls', () => {
  assert.equal(shortId(undefined), '—');
  assert.equal(formatCost(undefined), '—');
  assert.equal(formatCost(null as unknown as number), '—');
  assert.match(formatCost(1.25, 'USD', { USD: 100, EUR: 110 }), /\$/);
  assert.match(formatCost(1.25, 'RUB', { USD: 100, EUR: 110 }), /₽/);
  assert.match(formatCost(1.25, 'EUR', { USD: 100, EUR: 110 }), /€/);
});
