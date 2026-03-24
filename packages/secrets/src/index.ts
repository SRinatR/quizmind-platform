import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { type AiProvider, type CredentialOwnerType } from '@quizmind/contracts';

export interface EncryptedSecretEnvelope {
  algorithm: 'aes-256-gcm';
  keyVersion: 'v1';
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface SecretMetadata {
  provider: AiProvider;
  ownerType: CredentialOwnerType;
  ownerId: string;
  scopes: string[];
  createdAt: string;
}

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(input: { plaintext: string; secret: string }): EncryptedSecretEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(input.secret), iv);
  const ciphertext = Buffer.concat([cipher.update(input.plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm: 'aes-256-gcm',
    keyVersion: 'v1',
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptSecret(input: { envelope: EncryptedSecretEnvelope; secret: string }): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(input.secret),
    Buffer.from(input.envelope.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(input.envelope.authTag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

export function rotateEncryptedSecret(input: {
  envelope: EncryptedSecretEnvelope;
  currentSecret: string;
  nextSecret: string;
}): EncryptedSecretEnvelope {
  return encryptSecret({
    plaintext: decryptSecret({
      envelope: input.envelope,
      secret: input.currentSecret,
    }),
    secret: input.nextSecret,
  });
}

export function buildSecretMetadata(input: {
  provider: AiProvider;
  ownerType: CredentialOwnerType;
  ownerId: string;
  scopes?: string[];
  createdAt?: string;
}): SecretMetadata {
  return {
    provider: input.provider,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    scopes: [...(input.scopes ?? [])].sort(),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function redactSecretValue(value?: string | null): string {
  if (!value) {
    return '***redacted***';
  }

  const visible = value.slice(-4);
  return `${'*'.repeat(Math.max(value.length - 4, 4))}${visible}`;
}
