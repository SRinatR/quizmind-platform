import { type AccessContext } from '@quizmind/contracts';

export function createAccessContext(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    userId: 'user_test',
    systemRoles: [],
    entitlements: [],
    featureFlags: [],
    attributes: {},
    ...overrides,
  };
}

export function createHandshake(overrides: Partial<{ extensionVersion: string; schemaVersion: string; capabilities: string[] }> = {}) {
  return {
    extensionVersion: '1.5.0',
    schemaVersion: '2',
    capabilities: ['quiz-capture', 'history-sync'],
    browser: 'chrome' as const,
    ...overrides,
  };
}
