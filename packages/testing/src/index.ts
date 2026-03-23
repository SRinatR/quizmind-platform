import { type AccessContext, type PlanDefinition } from '@quizmind/contracts';

export function createAccessContext(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    userId: 'user_test',
    systemRoles: [],
    workspaceMemberships: [],
    entitlements: [],
    featureFlags: [],
    attributes: {},
    ...overrides,
  };
}

export function createPlan(overrides: Partial<PlanDefinition> = {}): PlanDefinition {
  return {
    id: 'plan_pro',
    code: 'pro',
    name: 'Pro',
    description: 'Default plan for tests.',
    entitlements: [
      { key: 'feature.text_answering', enabled: true },
      { key: 'limit.requests_per_day', enabled: true, limit: 100 },
    ],
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
