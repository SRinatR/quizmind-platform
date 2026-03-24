import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  type BillingInvoiceDocumentFormat,
  billingIntervals,
  subscriptionStatuses,
  type BillingProvider,
  type BillingInterval,
  type PlanDefinition,
  type PlanEntitlement,
  type SubscriptionStatus,
  type SubscriptionSummary,
} from '@quizmind/contracts';

export const billableIntervals = billingIntervals;
export const stripeSubscriptionStatuses = [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
] as const;
export type StripeSubscriptionStatus = (typeof stripeSubscriptionStatuses)[number];

export interface SubscriptionSnapshot {
  planId: string;
  status: SubscriptionStatus;
  interval: BillingInterval;
  cancelAtPeriodEnd: boolean;
  seats: number;
  trialEndsAt?: string;
}

export interface EntitlementResolution {
  enabled: string[];
  limits: Record<string, number>;
}

export interface UsageSnapshot {
  consumed: number;
  limit?: number;
}

export interface BillingProviderReference {
  provider: BillingProvider;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  providerPriceId?: string | null;
  providerInvoiceId?: string | null;
  providerPaymentId?: string | null;
}

export interface BillingProviderCheckoutSession {
  provider: BillingProvider;
  sessionId: string;
  customerId: string;
  providerPriceId: string;
  redirectUrl: string;
}

export interface BillingProviderPortalSession {
  provider: BillingProvider;
  customerId: string;
  redirectUrl: string;
}

export interface BillingProviderInvoiceDocument {
  provider: BillingProvider;
  providerInvoiceId: string;
  redirectUrl: string;
  format: BillingInvoiceDocumentFormat;
}

export interface BillingProviderSubscriptionMutation {
  provider: BillingProvider;
  providerSubscriptionId: string;
  customerId?: string;
  providerPriceId?: string;
  cancelAtPeriodEnd: boolean;
  status?: SubscriptionStatus;
  currentPeriodEnd?: Date;
}

export interface BillingProviderWebhookVerificationResult {
  provider: BillingProvider;
  verifiedAt: string;
}

export interface BillingProviderNormalizedWebhookEvent {
  provider: BillingProvider;
  externalEventId: string;
  eventType: string;
  payloadJson: Record<string, unknown>;
  providerCreatedAt?: Date;
}

export interface BillingProviderAdapter {
  provider: BillingProvider;
  createCustomer?(input: {
    email?: string;
    name: string;
    metadata?: Record<string, string>;
  }): Promise<{ customerId: string }>;
  startCheckout?(input: {
    customerId: string;
    providerPriceId: string;
    quantity: number;
    successUrl: string;
    cancelUrl: string;
    clientReferenceId?: string;
    metadata?: Record<string, string>;
    subscriptionMetadata?: Record<string, string>;
  }): Promise<BillingProviderCheckoutSession>;
  createPortalLink?(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<BillingProviderPortalSession>;
  cancelSubscription?(input: {
    providerSubscriptionId: string;
  }): Promise<BillingProviderSubscriptionMutation>;
  resumeSubscription?(input: {
    providerSubscriptionId: string;
  }): Promise<BillingProviderSubscriptionMutation>;
  fetchInvoiceDocument?(input: {
    providerInvoiceId: string;
  }): Promise<BillingProviderInvoiceDocument>;
  verifyWebhook?(input: VerifyStripeWebhookSignatureInput): Promise<BillingProviderWebhookVerificationResult> | BillingProviderWebhookVerificationResult;
  normalizeWebhookEvent?(input: {
    rawBody: Buffer | string;
  }): BillingProviderNormalizedWebhookEvent;
}

export interface BillingProviderResolverInput {
  requestedProvider?: BillingProvider;
  currency?: string;
  manualInvoicing?: boolean;
}

export interface VerifyStripeWebhookSignatureInput {
  payload: Buffer | string;
  signatureHeader: string;
  secret: string;
  toleranceSeconds?: number;
  now?: Date;
}

function toUtf8String(value: Buffer | string): string {
  return typeof value === 'string' ? value : value.toString('utf8');
}

function normalizeDigest(value: string): Buffer {
  return Buffer.from(value, 'hex');
}

export function isActiveSubscription(status: SubscriptionStatus): boolean {
  return ['trialing', 'active', 'grace_period'].includes(status);
}

export function resolveEntitlements(plan: PlanDefinition, overrides: PlanEntitlement[] = []): EntitlementResolution {
  const merged = new Map<string, PlanEntitlement>();

  for (const entitlement of plan.entitlements) {
    merged.set(entitlement.key, entitlement);
  }

  for (const override of overrides) {
    merged.set(override.key, override);
  }

  const enabled: string[] = [];
  const limits: Record<string, number> = {};

  for (const entitlement of merged.values()) {
    if (entitlement.enabled) {
      enabled.push(entitlement.key);
    }

    if (typeof entitlement.limit === 'number') {
      limits[entitlement.key] = entitlement.limit;
    }
  }

  return { enabled: enabled.sort(), limits };
}

export function canConsumeQuota(usage: UsageSnapshot): boolean {
  if (typeof usage.limit !== 'number') {
    return true;
  }

  return usage.consumed < usage.limit;
}

export function incrementUsage(usage: UsageSnapshot, amount = 1): UsageSnapshot {
  return {
    ...usage,
    consumed: usage.consumed + amount,
  };
}

export function resolveProviderCustomerId(input: {
  providerCustomerId?: string | null;
  stripeCustomerId?: string | null;
}): string | undefined {
  return input.providerCustomerId ?? input.stripeCustomerId ?? undefined;
}

export function resolveProviderPriceId(input: {
  providerPriceId?: string | null;
  stripePriceId?: string | null;
}): string | undefined {
  return input.providerPriceId ?? input.stripePriceId ?? undefined;
}

export function resolveProviderSubscriptionId(input: {
  providerSubscriptionId?: string | null;
  stripeSubscriptionId?: string | null;
}): string | undefined {
  return input.providerSubscriptionId ?? input.stripeSubscriptionId ?? undefined;
}

export function assertSubscriptionStatus(status: string): SubscriptionStatus {
  if (subscriptionStatuses.includes(status as SubscriptionStatus)) {
    return status as SubscriptionStatus;
  }

  throw new Error(`Unsupported subscription status: ${status}`);
}

export function mapStripeSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'incomplete':
      return 'incomplete';
    case 'incomplete_expired':
      return 'incomplete_expired';
    case 'paused':
      return 'paused';
    default:
      throw new Error(`Unsupported Stripe subscription status: ${status}`);
  }
}

export function mapStripeBillingInterval(interval: string): BillingInterval {
  switch (interval) {
    case 'month':
      return 'monthly';
    case 'year':
      return 'yearly';
    default:
      throw new Error(`Unsupported Stripe billing interval: ${interval}`);
  }
}

export function resolveSubscriptionStatusFromStripeEvent(input: {
  currentStatus: SubscriptionStatus;
  eventType: string;
  stripeStatus?: string | null;
}): SubscriptionStatus {
  if (input.stripeStatus) {
    return mapStripeSubscriptionStatus(input.stripeStatus);
  }

  switch (input.eventType) {
    case 'customer.subscription.deleted':
      return 'canceled';
    case 'invoice.payment_failed':
      return 'past_due';
    case 'invoice.payment_succeeded':
      return input.currentStatus === 'trialing' ? 'active' : input.currentStatus;
    default:
      return input.currentStatus;
  }
}

export function signStripeWebhookPayload(payload: Buffer | string, secret: string, timestamp: number | string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${toUtf8String(payload)}`).digest('hex');
}

export function verifyStripeWebhookSignature(input: VerifyStripeWebhookSignatureInput): { timestamp: number } {
  const components = input.signatureHeader.split(',').map((part) => part.trim()).filter(Boolean);
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const component of components) {
    const [key, value] = component.split('=', 2);

    if (!key || !value) {
      continue;
    }

    if (key === 't') {
      const parsedTimestamp = Number(value);

      if (Number.isFinite(parsedTimestamp)) {
        timestamp = parsedTimestamp;
      }

      continue;
    }

    if (key === 'v1') {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    throw new Error('Invalid Stripe signature header.');
  }

  const expectedSignature = normalizeDigest(signStripeWebhookPayload(input.payload, input.secret, timestamp));
  const now = input.now ?? new Date();
  const toleranceSeconds = input.toleranceSeconds ?? 300;
  const ageSeconds = Math.abs(Math.floor(now.getTime() / 1000) - timestamp);

  if (ageSeconds > toleranceSeconds) {
    throw new Error('Stripe signature timestamp is outside the allowed tolerance.');
  }

  const matches = signatures.some((signature) => {
    const providedSignature = normalizeDigest(signature);

    return providedSignature.length === expectedSignature.length && timingSafeEqual(providedSignature, expectedSignature);
  });

  if (!matches) {
    throw new Error('Invalid Stripe signature.');
  }

  return { timestamp };
}

export function buildSubscriptionSummary(input: {
  workspaceId: string;
  plan: PlanDefinition;
  subscription: SubscriptionSnapshot;
  overrides?: PlanEntitlement[];
}): SubscriptionSummary {
  const resolved = resolveEntitlements(input.plan, input.overrides ?? []);

  return {
    workspaceId: input.workspaceId,
    planCode: input.plan.code,
    status: input.subscription.status,
    billingInterval: input.subscription.interval,
    cancelAtPeriodEnd: input.subscription.cancelAtPeriodEnd,
    seatCount: input.subscription.seats,
    currentPeriodEnd: input.subscription.trialEndsAt,
    entitlements: input.plan.entitlements
      .map((entitlement) => ({
        ...entitlement,
        enabled: resolved.enabled.includes(entitlement.key),
        limit: resolved.limits[entitlement.key] ?? entitlement.limit,
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  };
}
