import { type BillingPlansPayload } from '@quizmind/contracts';

export const mockBillingPlans: BillingPlansPayload = {
  plans: [
    {
      plan: {
        id: 'plan_free',
        code: 'free',
        name: 'Free',
        description: 'Starter tier for onboarding and low-volume usage.',
        entitlements: [
          { key: 'feature.text_answering', enabled: true },
          { key: 'limit.requests_per_day', enabled: true, limit: 25 },
          { key: 'limit.seats', enabled: true, limit: 1 },
          { key: 'limit.history_retention_days', enabled: true, limit: 7 },
        ],
      },
      prices: [
        {
          interval: 'monthly',
          currency: 'usd',
          amount: 0,
          isDefault: true,
          stripePriceId: null,
        },
      ],
    },
    {
      plan: {
        id: 'plan_pro',
        code: 'pro',
        name: 'Pro',
        description: 'Expanded limits, screenshots, and workspace billing controls.',
        entitlements: [
          { key: 'feature.text_answering', enabled: true },
          { key: 'feature.screenshot_answering', enabled: true },
          { key: 'feature.remote_sync', enabled: true },
          { key: 'limit.requests_per_day', enabled: true, limit: 500 },
          { key: 'limit.screenshots_per_day', enabled: true, limit: 50 },
          { key: 'limit.seats', enabled: true, limit: 1 },
          { key: 'limit.history_retention_days', enabled: true, limit: 90 },
        ],
      },
      prices: [
        {
          interval: 'monthly',
          currency: 'usd',
          amount: 900,
          isDefault: true,
          stripePriceId: 'price_pro_monthly',
        },
        {
          interval: 'yearly',
          currency: 'usd',
          amount: 9000,
          isDefault: false,
          stripePriceId: 'price_pro_yearly',
        },
      ],
    },
    {
      plan: {
        id: 'plan_business',
        code: 'business',
        name: 'Business',
        description: 'Higher quotas, multi-seat access, and priority support for teams.',
        entitlements: [
          { key: 'feature.text_answering', enabled: true },
          { key: 'feature.screenshot_answering', enabled: true },
          { key: 'feature.remote_sync', enabled: true },
          { key: 'feature.priority_support', enabled: true },
          { key: 'limit.screenshots_per_day', enabled: true, limit: 200 },
          { key: 'limit.seats', enabled: true, limit: 5 },
          { key: 'limit.history_retention_days', enabled: true, limit: 365 },
        ],
      },
      prices: [
        {
          interval: 'monthly',
          currency: 'usd',
          amount: 2900,
          isDefault: true,
          stripePriceId: 'price_biz_monthly',
        },
        {
          interval: 'yearly',
          currency: 'usd',
          amount: 29000,
          isDefault: false,
          stripePriceId: 'price_biz_yearly',
        },
      ],
    },
  ],
};
