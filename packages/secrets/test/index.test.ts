import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSecretMetadata,
  decryptSecret,
  encryptSecret,
  redactSecretValue,
  rotateEncryptedSecret,
} from '../src/index';

test('secret helpers encrypt, decrypt, and rotate envelopes', () => {
  const envelope = encryptSecret({
    plaintext: 'sk-live-example',
    secret: 'control-plane-secret',
  });

  assert.equal(decryptSecret({ envelope, secret: 'control-plane-secret' }), 'sk-live-example');

  const rotated = rotateEncryptedSecret({
    envelope,
    currentSecret: 'control-plane-secret',
    nextSecret: 'control-plane-secret-v2',
  });

  assert.equal(decryptSecret({ envelope: rotated, secret: 'control-plane-secret-v2' }), 'sk-live-example');
});

test('secret metadata and redaction helpers stay stable', () => {
  const metadata = buildSecretMetadata({
    provider: 'openrouter',
    ownerType: 'workspace',
    ownerId: 'ws_1',
    scopes: ['vision', 'text'],
    createdAt: '2026-03-24T12:00:00.000Z',
  });

  assert.deepEqual(metadata.scopes, ['text', 'vision']);
  assert.match(redactSecretValue('sk-example-secret'), /\*+cret$/);
});
