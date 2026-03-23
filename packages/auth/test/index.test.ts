import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPasswordPolicy,
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  issueAccessToken,
  parseBearerToken,
  verifyAccessToken,
  verifyPassword,
} from '../src';

test('password helpers hash, verify, and reject short passwords', async () => {
  await assert.rejects(async () => {
    assertPasswordPolicy('short');
  }, /at least 8 characters/);

  assert.doesNotThrow(() => {
    assertPasswordPolicy('long-enough-password');
  });

  const passwordHash = await hashPassword('correct-horse-battery-staple');

  assert.equal(await verifyPassword('correct-horse-battery-staple', passwordHash), true);
  assert.equal(await verifyPassword('wrong-password', passwordHash), false);
});

test('opaque token helpers are deterministic per secret and parse bearer header', () => {
  const token = createOpaqueToken();

  assert.ok(token.length > 20);
  assert.equal(hashOpaqueToken(token, 'secret-1'), hashOpaqueToken(token, 'secret-1'));
  assert.notEqual(hashOpaqueToken(token, 'secret-1'), hashOpaqueToken(token, 'secret-2'));
  assert.equal(parseBearerToken(`Bearer ${token}`), token);
  assert.equal(parseBearerToken(`bearer ${token}`), token);
  assert.equal(parseBearerToken('Basic test'), null);
});

test('access token helpers issue and verify hs256 tokens', async () => {
  const issued = await issueAccessToken({
    secret: 'super-secret',
    sessionId: 'session_123',
    userId: 'user_123',
    email: 'admin@quizmind.dev',
    roles: ['platform_admin'],
  });

  const verified = await verifyAccessToken(issued.token, 'super-secret');

  assert.equal(verified.userId, 'user_123');
  assert.equal(verified.sessionId, 'session_123');
  assert.equal(verified.email, 'admin@quizmind.dev');
  assert.deepEqual(verified.roles, ['platform_admin']);
  assert.equal(verified.type, 'access');
  assert.equal(typeof issued.expiresAt, 'string');
});
