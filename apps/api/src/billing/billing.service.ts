import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyStripeWebhookSignature } from '@quizmind/billing';
import { loadApiEnv } from '@quizmind/config';
import {
  type BillingAdminPlanPriceProviderMappingInput,
  type BillingAdminPlanEntitlementInput,
  type BillingAdminPlanPriceInput,
  type BillingAdminPlansPayload,
  type BillingAdminPlanUpdateRequest,
  type BillingAdminPlanUpdateResult,
  type BillingCheckoutRequest,
  type BillingCheckoutResult,
  type BillingInterval,
  type BillingInvoicePdfResult,
  type BillingInvoicesPayload,
  type BillingPlansPayload,
  type BillingProvider,
  type BillingPortalRequest,
  type BillingPortalResult,
  type BillingSubscriptionMutationRequest,
  type BillingSubscriptionMutationResult,
  type BillingWebhookIngestResult,
  type BillingWebhookJobPayload,
  type EntitlementRefreshJobPayload,
  type SubscriptionStatus,
} from '@quizmind/contracts';
import { Prisma } from '@quizmind/database';
import { resolveBillingProvider as resolveConfiguredBillingProvider } from '@quizmind/providers';
import { createQueueDispatchRequest } from '@quizmind/queue';

import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { QueueDispatchService } from '../queue/queue-dispatch.service';
import {
  canManagePlans,
  canReadWorkspaceSubscription,
  canUpdateWorkspaceSubscription,
} from '../services/access-service';
import { mapAdminPlanCatalogRecordToSnapshot, mapPlanCatalogRecordToEntry } from '../services/billing-service';
import { BillingRepository, type BillingInvoiceRecord, type BillingWorkspaceContextRecord } from './billing.repository';
import { BillingWebhookRepository } from './billing-webhook.repository';
import { mockBillingPlans } from './mock-plan-catalog';
import {
  createStripeBillingPortalSession,
  createStripeCheckoutSession,
  createStripeCustomer,
  getStripeInvoiceDocument,
  updateStripeSubscriptionCancellation,
} from './stripe-client';

interface StripeWebhookEvent {
  id: string;
  type: string;
  created?: number;
  data?: {
    object?: Record<string, unknown>;
  };
}

interface YookassaWebhookEvent {
  id: string;
  type: string;
  createdAt?: Date;
  payload: Record<string, unknown>;
}

function readRequiredString(value: string | undefined, fieldName: string): string {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new BadRequestException(`${fieldName} is required.`);
  }

  return normalizedValue;
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  return value?.trim() ? value.trim() : undefined;
}

function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);

  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function parseBillingInterval(value: BillingCheckoutRequest['interval'] | undefined): BillingInterval {
  if (value === 'monthly' || value === 'yearly') {
    return value;
  }

  throw new BadRequestException('interval must be either "monthly" or "yearly".');
}

function readNonEmptyString(value: string | undefined, fieldName: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new BadRequestException(`${fieldName} is required.`);
  }

  return normalized;
}

function normalizePlanPriceInputs(
  value: BillingAdminPlanUpdateRequest['prices'] | undefined,
  fallback: BillingAdminPlanPriceInput[],
): BillingAdminPlanPriceInput[] {
  if (value === undefined) {
    return fallback;
  }

  const seenKeys = new Set<string>();
  let defaultCount = 0;
  const normalized = value.map((price, index) => {
    const interval = parseBillingInterval(price?.interval);
    const currency = readNonEmptyString(price?.currency?.toLowerCase(), `prices[${index}].currency`);
    const amount = price?.amount;

    if (!Number.isInteger(amount) || amount < 0) {
      throw new BadRequestException(`prices[${index}].amount must be a non-negative integer.`);
    }

    if (!/^[a-z]{3}$/i.test(currency)) {
      throw new BadRequestException(`prices[${index}].currency must be a 3-letter currency code.`);
    }

    const key = `${interval}:${currency}`;

    if (seenKeys.has(key)) {
      throw new BadRequestException(`Duplicate plan price for ${interval}/${currency}.`);
    }

    seenKeys.add(key);

    if (price?.isDefault) {
      defaultCount += 1;
    }

    const providerMappings = (price?.providerMappings ?? [])
      .map((mapping, mappingIndex): BillingAdminPlanPriceProviderMappingInput => {
        const providerPriceId = readNonEmptyString(
          mapping?.providerPriceId,
          `prices[${index}].providerMappings[${mappingIndex}].providerPriceId`,
        );

        return {
          provider: mapping.provider ?? 'stripe',
          providerPriceId,
          isActive: mapping.isActive ?? true,
        };
      })
      .filter(
        (mapping, mappingIndex, items) =>
          items.findIndex(
            (candidate) =>
              candidate.provider === mapping.provider && candidate.providerPriceId === mapping.providerPriceId,
          ) === mappingIndex,
      );

    const normalizedStripePriceId = normalizeOptionalString(price?.stripePriceId);

    if (
      normalizedStripePriceId &&
      !providerMappings.some(
        (mapping) => mapping.provider === 'stripe' && mapping.providerPriceId === normalizedStripePriceId,
      )
    ) {
      providerMappings.push({
        provider: 'stripe',
        providerPriceId: normalizedStripePriceId,
        isActive: true,
      });
    }

    return {
      interval,
      currency,
      amount,
      isDefault: price?.isDefault ?? false,
      providerMappings,
      stripePriceId: normalizedStripePriceId ?? null,
    };
  });

  if (normalized.length > 0 && defaultCount !== 1) {
    throw new BadRequestException('Exactly one default plan price is required when prices are configured.');
  }

  return normalized;
}

function normalizePlanEntitlementInputs(
  value: BillingAdminPlanUpdateRequest['entitlements'] | undefined,
  fallback: BillingAdminPlanEntitlementInput[],
): BillingAdminPlanEntitlementInput[] {
  if (value === undefined) {
    return fallback;
  }

  const seenKeys = new Set<string>();

  return value.map((entitlement, index) => {
    const key = readNonEmptyString(entitlement?.key, `entitlements[${index}].key`);
    const enabled = entitlement?.enabled ?? false;
    const limit = entitlement?.limit;

    if (seenKeys.has(key)) {
      throw new BadRequestException(`Duplicate entitlement key "${key}".`);
    }

    if (limit !== undefined && limit !== null && (!Number.isInteger(limit) || limit < 0)) {
      throw new BadRequestException(`entitlements[${index}].limit must be a non-negative integer.`);
    }

    seenKeys.add(key);

    return {
      key,
      enabled,
      ...(limit === undefined ? {} : { limit }),
    };
  });
}

function resolveAppRedirectUrl(input: {
  appUrl: string;
  requestedPath?: string;
  fallbackPath: string;
}): string {
  const baseUrl = new URL(input.appUrl);
  const candidate = input.requestedPath?.trim();

  if (!candidate) {
    return new URL(input.fallbackPath, baseUrl).toString();
  }

  if (candidate.startsWith('/')) {
    return new URL(candidate, baseUrl).toString();
  }

  try {
    const absoluteUrl = new URL(candidate);

    if (absoluteUrl.origin !== baseUrl.origin) {
      throw new BadRequestException('Redirect URLs must stay on the configured APP_URL origin.');
    }

    return absoluteUrl.toString();
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }

    throw new BadRequestException('Redirect URLs must be a relative path or an absolute URL on APP_URL.');
  }
}

function deriveInvoiceStatus(record: BillingInvoiceRecord, now = new Date()): string {
  if (record.paidAt || (record.amountDue > 0 && record.amountPaid >= record.amountDue)) {
    return 'paid';
  }

  if (record.dueAt && record.dueAt.getTime() < now.getTime()) {
    return 'past_due';
  }

  return 'open';
}

function isHostedPageBillingProvider(provider: BillingProvider): boolean {
  return provider === 'manual' || provider === 'yookassa' || provider === 'paddle';
}

function resolveProviderPriceId(input: {
  provider: BillingProvider;
  stripePriceId?: string | null;
  providerMappings?: Array<{ provider: string; providerPriceId: string; isActive: boolean }>;
  fallbackPriceId: string;
}): string {
  const activeMapping = input.providerMappings?.find(
    (mapping) => mapping.provider === input.provider && mapping.isActive,
  );

  if (activeMapping?.providerPriceId) {
    return activeMapping.providerPriceId;
  }

  if (input.provider === 'stripe' && input.stripePriceId?.trim()) {
    return input.stripePriceId;
  }

  return input.fallbackPriceId;
}

@Injectable()
export class BillingService {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(BillingWebhookRepository)
    private readonly billingWebhookRepository: BillingWebhookRepository,
    @Inject(BillingRepository)
    private readonly billingRepository: BillingRepository,
    @Inject(QueueDispatchService)
    private readonly queueDispatchService: QueueDispatchService,
  ) {}

  async listPlans(): Promise<BillingPlansPayload> {
    if (this.env.runtimeMode !== 'connected') {
      return mockBillingPlans;
    }

    const plans = await this.billingRepository.listActivePlans();

    return {
      plans: plans.map(mapPlanCatalogRecordToEntry),
    };
  }

  async listAdminPlans(session: CurrentSessionSnapshot): Promise<BillingAdminPlansPayload> {
    const accessDecision = canManagePlans(session.principal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const plans = await this.billingRepository.listAllPlans();

    return {
      manageDecision: accessDecision,
      plans: plans.map(mapAdminPlanCatalogRecordToSnapshot),
    };
  }

  async updatePlanCatalogEntry(
    session: CurrentSessionSnapshot,
    request?: Partial<BillingAdminPlanUpdateRequest>,
  ): Promise<BillingAdminPlanUpdateResult> {
    const accessDecision = canManagePlans(session.principal);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const planCode = readRequiredString(request?.planCode, 'planCode').toLowerCase();
    const existing = await this.billingRepository.findPlanByCode(planCode);

    if (!existing) {
      throw new NotFoundException(`Plan "${planCode}" was not found.`);
    }

    const normalizedName = request?.name === undefined ? existing.name : readNonEmptyString(request.name, 'name');
    const normalizedDescription =
      request?.description === undefined
        ? existing.description
        : readNonEmptyString(request.description, 'description');
    const normalizedPrices = normalizePlanPriceInputs(
      request?.prices,
      existing.prices.map((price) => ({
        interval: price.intervalCode === 'yearly' ? 'yearly' : 'monthly',
        currency: price.currency,
        amount: price.amount,
        isDefault: price.isDefault,
        providerMappings: (price.providerMappings ?? []).map((mapping) => ({
          provider: mapping.provider as BillingProvider,
          providerPriceId: mapping.providerPriceId,
          isActive: mapping.isActive,
        })),
        stripePriceId: price.stripePriceId,
      })),
    );
    const normalizedEntitlements = normalizePlanEntitlementInputs(
      request?.entitlements,
      existing.entitlements.map((entitlement) => ({
        key: entitlement.key,
        enabled: entitlement.enabled,
        ...(entitlement.limitValue === null ? {} : { limit: entitlement.limitValue }),
      })),
    );
    let updatedRecord;

    try {
      updatedRecord = await this.billingRepository.replacePlanCatalogEntry({
        planCode,
        name: normalizedName,
        description: normalizedDescription,
        isActive: request?.isActive ?? existing.isActive,
        entitlements: normalizedEntitlements.map((entitlement) => ({
          key: entitlement.key,
          enabled: entitlement.enabled,
          limitValue: entitlement.limit ?? null,
        })),
        prices: normalizedPrices.map((price) => ({
          intervalCode: price.interval,
          currency: price.currency,
          amount: price.amount,
          isDefault: price.isDefault,
          providerMappings: price.providerMappings?.map((mapping) => ({
            provider: mapping.provider,
            providerPriceId: mapping.providerPriceId,
            isActive: mapping.isActive ?? true,
          })),
          stripePriceId: price.stripePriceId ?? null,
        })),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('A plan price row conflicts with an existing unique Stripe price mapping.');
      }

      throw error;
    }

    if (!updatedRecord) {
      throw new NotFoundException(`Plan "${planCode}" was not found.`);
    }

    return {
      plan: mapAdminPlanCatalogRecordToSnapshot(updatedRecord),
      updatedAt: updatedRecord.updatedAt.toISOString(),
    };
  }

  async listInvoices(
    session: CurrentSessionSnapshot,
    workspaceId?: string,
  ): Promise<BillingInvoicesPayload> {
    const workspace = await this.loadWorkspaceForSubscriptionRead(session, workspaceId);
    const invoices = await this.billingRepository.listInvoicesByWorkspaceId(workspace.id);

    return {
      workspaceId: workspace.id,
      items: invoices.map((invoice) => ({
        id: invoice.id,
        provider: (invoice.provider as BillingProvider | null) ?? undefined,
        providerInvoiceId: invoice.providerInvoiceId,
        externalId: invoice.externalId,
        subscriptionId: invoice.subscriptionId,
        amountDue: invoice.amountDue,
        amountPaid: invoice.amountPaid,
        currency: invoice.currency,
        status: deriveInvoiceStatus(invoice),
        issuedAt: invoice.issuedAt.toISOString(),
        dueAt: invoice.dueAt?.toISOString() ?? null,
        paidAt: invoice.paidAt?.toISOString() ?? null,
      })),
    };
  }

  async getInvoicePdf(
    session: CurrentSessionSnapshot,
    invoiceId?: string,
  ): Promise<BillingInvoicePdfResult> {
    const resolvedInvoiceId = readRequiredString(invoiceId, 'invoiceId');
    const invoice = await this.billingRepository.findInvoiceExportContext(resolvedInvoiceId);

    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }

    await this.loadWorkspaceForSubscriptionRead(session, invoice.workspaceId);

    const provider = (invoice.provider as BillingProvider | null) ?? 'stripe';

    if (isHostedPageBillingProvider(provider)) {
      const providerInvoiceId = invoice.providerInvoiceId ?? invoice.externalId ?? invoice.id;

      return {
        invoiceId: invoice.id,
        workspaceId: invoice.workspaceId,
        provider,
        providerInvoiceId,
        externalId: invoice.externalId ?? providerInvoiceId,
        redirectUrl: resolveAppRedirectUrl({
          appUrl: this.env.appUrl,
          fallbackPath: `/app/billing?workspaceId=${invoice.workspaceId}&invoiceId=${invoice.id}&provider=${provider}`,
        }),
        format: 'hosted_page',
      };
    }

    this.assertStripeInvoiceExportReady();

    if (!invoice.externalId?.trim()) {
      throw new ServiceUnavailableException('Invoice is not linked to a Stripe invoice yet.');
    }

    const stripeInvoice = await getStripeInvoiceDocument({
      secretKey: this.env.stripeSecretKey!,
      stripeInvoiceId: invoice.externalId,
    });

    return {
      invoiceId: invoice.id,
      workspaceId: invoice.workspaceId,
      provider: 'stripe',
      providerInvoiceId: stripeInvoice.externalId,
      externalId: stripeInvoice.externalId,
      redirectUrl: stripeInvoice.redirectUrl,
      format: stripeInvoice.format,
    };
  }

  async createCheckoutSession(
    session: CurrentSessionSnapshot,
    request?: Partial<BillingCheckoutRequest>,
  ): Promise<BillingCheckoutResult> {
    const workspaceId = readRequiredString(request?.workspaceId, 'workspaceId');
    const planCode = readRequiredString(request?.planCode, 'planCode').toLowerCase();
    const interval = parseBillingInterval(request?.interval);
    const provider = this.resolveRequestedBillingProvider(request?.provider);
    const workspace = await this.loadWorkspaceForSubscriptionMutation(session, workspaceId);

    if (planCode === 'free') {
      throw new BadRequestException('The free plan does not require a checkout session.');
    }

    const plan = await this.billingRepository.findActivePlanByCode(planCode);

    if (!plan) {
      throw new NotFoundException(`Plan "${planCode}" was not found.`);
    }

    const price = plan.prices.find(
      (candidate) => candidate.intervalCode === interval && candidate.currency.toLowerCase() === 'usd',
    );

    if (!price) {
      throw new ServiceUnavailableException(`Plan "${planCode}" is missing a price row for the ${interval} interval.`);
    }

    const providerPriceId = resolveProviderPriceId({
      provider,
      stripePriceId: price.stripePriceId,
      providerMappings: price.providerMappings,
      fallbackPriceId: `${plan.code}:${interval}:${price.currency}`,
    });

    if (isHostedPageBillingProvider(provider)) {
      const providerCustomerId =
        (workspace.billingProvider === provider ? workspace.providerCustomerId : null) ?? `${provider}:${workspace.id}`;

      await this.billingRepository.updateWorkspaceProviderCustomerId({
        workspaceId: workspace.id,
        provider,
        providerCustomerId,
      });

      return {
        workspaceId: workspace.id,
        planCode: plan.code,
        interval,
        provider,
        providerCustomerId,
        providerPriceId,
        customerId: providerCustomerId,
        stripePriceId: price.stripePriceId ?? providerPriceId,
        sessionId: `${provider}:${workspace.id}:${Date.now()}`,
        redirectUrl: resolveAppRedirectUrl({
          appUrl: this.env.appUrl,
          requestedPath: request?.successPath,
          fallbackPath:
            provider === 'manual'
              ? `/app/billing?workspaceId=${workspace.id}&provider=manual&checkout=contact_sales`
              : `/app/billing?workspaceId=${workspace.id}&provider=${provider}&checkout=created`,
        }),
      };
    }

    this.assertStripeClientReady();

    const customerId = await this.resolveWorkspaceStripeCustomerId(workspace, session.user.email);
    const currentSubscription = workspace.subscriptions[0] ?? null;
    const checkoutSession = await createStripeCheckoutSession({
      secretKey: this.env.stripeSecretKey!,
      customerId,
      stripePriceId: providerPriceId,
      quantity: Math.max(1, currentSubscription?.seatCount ?? 1),
      successUrl: resolveAppRedirectUrl({
        appUrl: this.env.appUrl,
        requestedPath: request?.successPath,
        fallbackPath: `/app/billing?workspaceId=${workspace.id}&checkout=success`,
      }),
      cancelUrl: resolveAppRedirectUrl({
        appUrl: this.env.appUrl,
        requestedPath: request?.cancelPath,
        fallbackPath: `/app/billing?workspaceId=${workspace.id}&checkout=canceled`,
      }),
      clientReferenceId: workspace.id,
      metadata: {
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
        planCode: plan.code,
        interval,
        stripePriceId: providerPriceId,
      },
      subscriptionMetadata: {
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
        planCode: plan.code,
        interval,
        stripePriceId: providerPriceId,
      },
    });

    if (checkoutSession.customerId !== customerId) {
      await this.billingRepository.updateWorkspaceStripeCustomerId(workspace.id, checkoutSession.customerId);
    }

    return {
      workspaceId: workspace.id,
      planCode: plan.code,
      interval,
      provider,
      providerCustomerId: checkoutSession.customerId,
      providerPriceId,
      customerId: checkoutSession.customerId,
      stripePriceId: providerPriceId,
      sessionId: checkoutSession.sessionId,
      redirectUrl: checkoutSession.redirectUrl,
    };
  }

  async createPortalSession(
    session: CurrentSessionSnapshot,
    request?: Partial<BillingPortalRequest>,
  ): Promise<BillingPortalResult> {
    const workspaceId = readRequiredString(request?.workspaceId, 'workspaceId');
    const provider = this.resolveRequestedBillingProvider(request?.provider);
    const workspace = await this.loadWorkspaceForSubscriptionMutation(session, workspaceId);
    const providerCustomerId =
      normalizeOptionalString(workspace.providerCustomerId) ??
      normalizeOptionalString(workspace.subscriptions[0]?.providerCustomerId);

    if (isHostedPageBillingProvider(provider)) {
      const hostedCustomerId =
        (workspace.billingProvider === provider ? providerCustomerId : undefined) ?? `${provider}:${workspace.id}`;

      await this.billingRepository.updateWorkspaceProviderCustomerId({
        workspaceId: workspace.id,
        provider,
        providerCustomerId: hostedCustomerId,
      });

      return {
        workspaceId: workspace.id,
        provider,
        providerCustomerId: hostedCustomerId,
        customerId: hostedCustomerId,
        redirectUrl: resolveAppRedirectUrl({
          appUrl: this.env.appUrl,
          requestedPath: request?.returnPath,
          fallbackPath: `/app/billing?workspaceId=${workspace.id}&provider=${provider}`,
        }),
      };
    }

    this.assertStripeClientReady();

    const customerId =
      normalizeOptionalString(workspace.stripeCustomerId) ??
      normalizeOptionalString(workspace.subscriptions[0]?.stripeCustomerId);

    if (!customerId) {
      throw new ServiceUnavailableException('Workspace is not linked to a Stripe customer yet.');
    }

    if (!workspace.stripeCustomerId) {
      await this.billingRepository.updateWorkspaceStripeCustomerId(workspace.id, customerId);
    }

    const portalSession = await createStripeBillingPortalSession({
      secretKey: this.env.stripeSecretKey!,
      customerId,
      returnUrl: resolveAppRedirectUrl({
        appUrl: this.env.appUrl,
        requestedPath: request?.returnPath,
        fallbackPath: `/app/billing?workspaceId=${workspace.id}`,
      }),
    });

    return {
      workspaceId: workspace.id,
      provider,
      providerCustomerId: customerId,
      customerId,
      redirectUrl: portalSession.redirectUrl,
    };
  }

  async cancelSubscription(
    session: CurrentSessionSnapshot,
    request?: Partial<BillingSubscriptionMutationRequest>,
  ): Promise<BillingSubscriptionMutationResult> {
    const workspaceId = readRequiredString(request?.workspaceId, 'workspaceId');
    const workspace = await this.loadWorkspaceForSubscriptionMutation(session, workspaceId);
    const currentSubscription = this.getCurrentWorkspaceSubscription(workspace);
    const provider = (currentSubscription.provider as BillingProvider | undefined) ?? this.resolveRequestedBillingProvider();

    if (currentSubscription.cancelAtPeriodEnd) {
      return {
        workspaceId: workspace.id,
        subscriptionId: currentSubscription.id,
        provider,
        providerSubscriptionId:
          currentSubscription.providerSubscriptionId ?? currentSubscription.stripeSubscriptionId ?? currentSubscription.id,
        stripeSubscriptionId:
          currentSubscription.stripeSubscriptionId ??
          currentSubscription.providerSubscriptionId ??
          currentSubscription.id,
        status: currentSubscription.status as SubscriptionStatus,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: currentSubscription.currentPeriodEnd?.toISOString(),
      };
    }

    if (provider !== 'stripe') {
      await this.billingRepository.updateSubscriptionLifecycle(currentSubscription.id, {
        provider,
        cancelAtPeriodEnd: true,
        status: currentSubscription.status,
        ...(currentSubscription.providerCustomerId ? { providerCustomerId: currentSubscription.providerCustomerId } : {}),
        ...(currentSubscription.providerPriceId ? { providerPriceId: currentSubscription.providerPriceId } : {}),
      });
      await this.enqueueEntitlementRefresh({
        workspaceId: workspace.id,
        subscriptionId: currentSubscription.id,
        previousStatus: currentSubscription.status as SubscriptionStatus,
        nextStatus: currentSubscription.status as SubscriptionStatus,
        reason: 'subscription_canceled',
        requestedByUserId: session.user.id,
      });

      return {
        workspaceId: workspace.id,
        subscriptionId: currentSubscription.id,
        provider,
        providerSubscriptionId:
          currentSubscription.providerSubscriptionId ?? currentSubscription.stripeSubscriptionId ?? currentSubscription.id,
        stripeSubscriptionId:
          currentSubscription.stripeSubscriptionId ??
          currentSubscription.providerSubscriptionId ??
          currentSubscription.id,
        status: currentSubscription.status as SubscriptionStatus,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: currentSubscription.currentPeriodEnd?.toISOString(),
      };
    }

    this.assertStripeClientReady();

    if (!currentSubscription.stripeSubscriptionId?.trim()) {
      throw new ServiceUnavailableException('Current workspace subscription is not linked to Stripe yet.');
    }

    const stripeSubscription = await updateStripeSubscriptionCancellation({
      secretKey: this.env.stripeSecretKey!,
      stripeSubscriptionId: currentSubscription.stripeSubscriptionId,
      cancelAtPeriodEnd: true,
    });
    const nextStatus = stripeSubscription.status
      ? this.normalizeStripeSubscriptionStatus(stripeSubscription.status, currentSubscription.status)
      : (currentSubscription.status as SubscriptionStatus);

    await this.billingRepository.updateSubscriptionLifecycle(currentSubscription.id, {
      provider,
      cancelAtPeriodEnd: true,
      status: nextStatus,
      ...(stripeSubscription.currentPeriodEnd !== undefined
        ? { currentPeriodEnd: stripeSubscription.currentPeriodEnd }
        : {}),
      ...(stripeSubscription.customerId ? { providerCustomerId: stripeSubscription.customerId } : {}),
      ...(stripeSubscription.stripePriceId ? { providerPriceId: stripeSubscription.stripePriceId } : {}),
      ...(stripeSubscription.customerId ? { stripeCustomerId: stripeSubscription.customerId } : {}),
      ...(stripeSubscription.stripePriceId ? { stripePriceId: stripeSubscription.stripePriceId } : {}),
    });

    if (stripeSubscription.customerId && workspace.stripeCustomerId !== stripeSubscription.customerId) {
      await this.billingRepository.updateWorkspaceStripeCustomerId(workspace.id, stripeSubscription.customerId);
    }
    await this.enqueueEntitlementRefresh({
      workspaceId: workspace.id,
      subscriptionId: currentSubscription.id,
      previousStatus: currentSubscription.status as SubscriptionStatus,
      nextStatus,
      reason: 'subscription_canceled',
      requestedByUserId: session.user.id,
    });

    return {
      workspaceId: workspace.id,
      subscriptionId: currentSubscription.id,
      provider,
      providerSubscriptionId: stripeSubscription.stripeSubscriptionId,
      stripeSubscriptionId: stripeSubscription.stripeSubscriptionId,
      status: nextStatus,
      cancelAtPeriodEnd: true,
      currentPeriodEnd:
        stripeSubscription.currentPeriodEnd?.toISOString() ?? currentSubscription.currentPeriodEnd?.toISOString(),
    };
  }

  async resumeSubscription(
    session: CurrentSessionSnapshot,
    request?: Partial<BillingSubscriptionMutationRequest>,
  ): Promise<BillingSubscriptionMutationResult> {
    const workspaceId = readRequiredString(request?.workspaceId, 'workspaceId');
    const workspace = await this.loadWorkspaceForSubscriptionMutation(session, workspaceId);
    const currentSubscription = this.getCurrentWorkspaceSubscription(workspace);
    const provider = (currentSubscription.provider as BillingProvider | undefined) ?? this.resolveRequestedBillingProvider();

    if (!currentSubscription.cancelAtPeriodEnd) {
      return {
        workspaceId: workspace.id,
        subscriptionId: currentSubscription.id,
        provider,
        providerSubscriptionId:
          currentSubscription.providerSubscriptionId ?? currentSubscription.stripeSubscriptionId ?? currentSubscription.id,
        stripeSubscriptionId:
          currentSubscription.stripeSubscriptionId ??
          currentSubscription.providerSubscriptionId ??
          currentSubscription.id,
        status: currentSubscription.status as SubscriptionStatus,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: currentSubscription.currentPeriodEnd?.toISOString(),
      };
    }

    if (provider !== 'stripe') {
      await this.billingRepository.updateSubscriptionLifecycle(currentSubscription.id, {
        provider,
        cancelAtPeriodEnd: false,
        status: currentSubscription.status,
        ...(currentSubscription.providerCustomerId ? { providerCustomerId: currentSubscription.providerCustomerId } : {}),
        ...(currentSubscription.providerPriceId ? { providerPriceId: currentSubscription.providerPriceId } : {}),
      });
      await this.enqueueEntitlementRefresh({
        workspaceId: workspace.id,
        subscriptionId: currentSubscription.id,
        previousStatus: currentSubscription.status as SubscriptionStatus,
        nextStatus: currentSubscription.status as SubscriptionStatus,
        reason: 'subscription_resumed',
        requestedByUserId: session.user.id,
      });

      return {
        workspaceId: workspace.id,
        subscriptionId: currentSubscription.id,
        provider,
        providerSubscriptionId:
          currentSubscription.providerSubscriptionId ?? currentSubscription.stripeSubscriptionId ?? currentSubscription.id,
        stripeSubscriptionId:
          currentSubscription.stripeSubscriptionId ??
          currentSubscription.providerSubscriptionId ??
          currentSubscription.id,
        status: currentSubscription.status as SubscriptionStatus,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: currentSubscription.currentPeriodEnd?.toISOString(),
      };
    }

    this.assertStripeClientReady();

    if (!currentSubscription.stripeSubscriptionId?.trim()) {
      throw new ServiceUnavailableException('Current workspace subscription is not linked to Stripe yet.');
    }

    const stripeSubscription = await updateStripeSubscriptionCancellation({
      secretKey: this.env.stripeSecretKey!,
      stripeSubscriptionId: currentSubscription.stripeSubscriptionId,
      cancelAtPeriodEnd: false,
    });
    const nextStatus = stripeSubscription.status
      ? this.normalizeStripeSubscriptionStatus(stripeSubscription.status, currentSubscription.status)
      : (currentSubscription.status as SubscriptionStatus);

    await this.billingRepository.updateSubscriptionLifecycle(currentSubscription.id, {
      provider,
      cancelAtPeriodEnd: false,
      status: nextStatus,
      ...(stripeSubscription.currentPeriodEnd !== undefined
        ? { currentPeriodEnd: stripeSubscription.currentPeriodEnd }
        : {}),
      ...(stripeSubscription.customerId ? { providerCustomerId: stripeSubscription.customerId } : {}),
      ...(stripeSubscription.stripePriceId ? { providerPriceId: stripeSubscription.stripePriceId } : {}),
      ...(stripeSubscription.customerId ? { stripeCustomerId: stripeSubscription.customerId } : {}),
      ...(stripeSubscription.stripePriceId ? { stripePriceId: stripeSubscription.stripePriceId } : {}),
    });

    if (stripeSubscription.customerId && workspace.stripeCustomerId !== stripeSubscription.customerId) {
      await this.billingRepository.updateWorkspaceStripeCustomerId(workspace.id, stripeSubscription.customerId);
    }
    await this.enqueueEntitlementRefresh({
      workspaceId: workspace.id,
      subscriptionId: currentSubscription.id,
      previousStatus: currentSubscription.status as SubscriptionStatus,
      nextStatus,
      reason: 'subscription_resumed',
      requestedByUserId: session.user.id,
    });

    return {
      workspaceId: workspace.id,
      subscriptionId: currentSubscription.id,
      provider,
      providerSubscriptionId: stripeSubscription.stripeSubscriptionId,
      stripeSubscriptionId: stripeSubscription.stripeSubscriptionId,
      status: nextStatus,
      cancelAtPeriodEnd: false,
      currentPeriodEnd:
        stripeSubscription.currentPeriodEnd?.toISOString() ?? currentSubscription.currentPeriodEnd?.toISOString(),
    };
  }

  async ingestStripeWebhook(
    signatureHeader?: string,
    rawBody?: Buffer | null,
  ): Promise<BillingWebhookIngestResult> {
    this.assertStripeWebhookReady();

    if (!signatureHeader?.trim()) {
      throw new BadRequestException('Missing Stripe signature header.');
    }

    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Missing raw Stripe webhook payload.');
    }

    try {
      verifyStripeWebhookSignature({
        payload: rawBody,
        signatureHeader,
        secret: this.env.stripeWebhookSecret!,
      });
    } catch (error) {
      throw new UnauthorizedException(error instanceof Error ? error.message : 'Invalid Stripe signature.');
    }

    const event = this.parseStripeWebhookEvent(rawBody);
    const providerCreatedAt =
      typeof event.created === 'number' && Number.isFinite(event.created)
        ? new Date(event.created * 1000)
        : undefined;
    const persistedEvent = await this.billingWebhookRepository.recordReceivedEvent({
      provider: 'stripe',
      externalEventId: event.id,
      eventType: event.type,
      payloadJson: event as unknown as Prisma.InputJsonValue,
      providerCreatedAt,
    });

    if (persistedEvent.duplicate) {
      return {
        accepted: true,
        duplicate: true,
        provider: 'stripe',
        eventId: event.id,
        eventType: event.type,
        receivedAt: persistedEvent.record.receivedAt.toISOString(),
      };
    }

    const job = await this.queueDispatchService.dispatch<BillingWebhookJobPayload>(
      createQueueDispatchRequest({
        queue: 'billing-webhooks',
        payload: {
          provider: 'stripe',
          webhookEventId: persistedEvent.record.id,
          externalEventId: event.id,
          eventType: event.type,
          receivedAt: persistedEvent.record.receivedAt.toISOString(),
        },
      }),
    );

    return {
      accepted: true,
      duplicate: false,
      provider: 'stripe',
      eventId: event.id,
      eventType: event.type,
      receivedAt: persistedEvent.record.receivedAt.toISOString(),
      queue: job.queue,
      jobId: job.id,
    };
  }

  async ingestYookassaWebhook(rawBody?: Buffer | null): Promise<BillingWebhookIngestResult> {
    this.assertYookassaWebhookReady();

    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Missing raw YooKassa webhook payload.');
    }

    const event = this.parseYookassaWebhookEvent(rawBody);
    const persistedEvent = await this.billingWebhookRepository.recordReceivedEvent({
      provider: 'yookassa',
      externalEventId: event.id,
      eventType: event.type,
      payloadJson: event.payload as Prisma.InputJsonValue,
      providerCreatedAt: event.createdAt,
    });

    if (persistedEvent.duplicate) {
      return {
        accepted: true,
        duplicate: true,
        provider: 'yookassa',
        eventId: event.id,
        eventType: event.type,
        receivedAt: persistedEvent.record.receivedAt.toISOString(),
      };
    }

    const job = await this.queueDispatchService.dispatch<BillingWebhookJobPayload>(
      createQueueDispatchRequest({
        queue: 'billing-webhooks',
        payload: {
          provider: 'yookassa',
          webhookEventId: persistedEvent.record.id,
          externalEventId: event.id,
          eventType: event.type,
          receivedAt: persistedEvent.record.receivedAt.toISOString(),
        },
      }),
    );

    return {
      accepted: true,
      duplicate: false,
      provider: 'yookassa',
      eventId: event.id,
      eventType: event.type,
      receivedAt: persistedEvent.record.receivedAt.toISOString(),
      queue: job.queue,
      jobId: job.id,
    };
  }

  private async enqueueEntitlementRefresh(input: {
    workspaceId: string;
    subscriptionId: string;
    previousStatus: SubscriptionStatus;
    nextStatus: SubscriptionStatus;
    reason: EntitlementRefreshJobPayload['reason'];
    requestedByUserId?: string;
  }): Promise<void> {
    await this.queueDispatchService.dispatch(
      createQueueDispatchRequest({
        queue: 'entitlement-refresh',
        payload: {
          workspaceId: input.workspaceId,
          subscriptionId: input.subscriptionId,
          previousStatus: input.previousStatus,
          nextStatus: input.nextStatus,
          reason: input.reason,
          requestedAt: new Date().toISOString(),
          ...(input.requestedByUserId ? { requestedByUserId: input.requestedByUserId } : {}),
        },
      }),
    );
  }

  private async loadWorkspaceForSubscriptionRead(
    session: CurrentSessionSnapshot,
    workspaceId?: string,
  ): Promise<BillingWorkspaceContextRecord> {
    const resolvedWorkspaceId = workspaceId?.trim() || session.workspaces[0]?.id;

    if (!resolvedWorkspaceId) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    const requestedWorkspace = session.workspaces.find((workspace) => workspace.id === resolvedWorkspaceId) ?? null;

    if (!requestedWorkspace) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    const accessDecision = canReadWorkspaceSubscription(session.principal, resolvedWorkspaceId);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const workspace = await this.billingRepository.findWorkspaceBillingContext(resolvedWorkspaceId);

    if (!workspace) {
      throw new NotFoundException('Workspace not found.');
    }

    return workspace;
  }

  private async loadWorkspaceForSubscriptionMutation(
    session: CurrentSessionSnapshot,
    workspaceId: string,
  ): Promise<BillingWorkspaceContextRecord> {
    const requestedWorkspace = session.workspaces.find((workspace) => workspace.id === workspaceId) ?? null;

    if (!requestedWorkspace) {
      throw new NotFoundException('Workspace not found or not accessible.');
    }

    const accessDecision = canUpdateWorkspaceSubscription(session.principal, workspaceId);

    if (!accessDecision.allowed) {
      throw new ForbiddenException(accessDecision.reasons.join('; '));
    }

    const workspace = await this.billingRepository.findWorkspaceBillingContext(workspaceId);

    if (!workspace) {
      throw new NotFoundException('Workspace not found.');
    }

    return workspace;
  }

  private getCurrentWorkspaceSubscription(workspace: BillingWorkspaceContextRecord): {
    id: string;
    provider: string | null;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
    providerCustomerId: string | null;
    providerPriceId: string | null;
    providerSubscriptionId: string | null;
    stripeSubscriptionId: string | null;
  } {
    const currentSubscription = workspace.subscriptions[0] ?? null;

    if (!currentSubscription) {
      throw new NotFoundException('Subscription not found for workspace.');
    }

    return {
      id: currentSubscription.id,
      provider: currentSubscription.provider,
      status: currentSubscription.status,
      cancelAtPeriodEnd: currentSubscription.cancelAtPeriodEnd,
      currentPeriodEnd: currentSubscription.currentPeriodEnd,
      providerCustomerId: currentSubscription.providerCustomerId,
      providerPriceId: currentSubscription.providerPriceId,
      providerSubscriptionId: currentSubscription.providerSubscriptionId,
      stripeSubscriptionId: currentSubscription.stripeSubscriptionId,
    };
  }

  private async resolveWorkspaceStripeCustomerId(
    workspace: BillingWorkspaceContextRecord,
    fallbackEmail?: string | null,
  ): Promise<string> {
    const existingCustomerId =
      normalizeOptionalString(workspace.providerCustomerId) ??
      normalizeOptionalString(workspace.subscriptions[0]?.providerCustomerId) ??
      normalizeOptionalString(workspace.stripeCustomerId) ??
      normalizeOptionalString(workspace.subscriptions[0]?.stripeCustomerId);

    if (existingCustomerId) {
      if (!workspace.stripeCustomerId) {
        await this.billingRepository.updateWorkspaceStripeCustomerId(workspace.id, existingCustomerId);
      }

      return existingCustomerId;
    }

    const createdCustomer = await createStripeCustomer({
      secretKey: this.env.stripeSecretKey!,
      name: workspace.name,
      email: normalizeOptionalString(workspace.billingEmail) ?? normalizeOptionalString(fallbackEmail ?? undefined),
      metadata: {
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
      },
    });

    await this.billingRepository.updateWorkspaceStripeCustomerId(workspace.id, createdCustomer.customerId);

    return createdCustomer.customerId;
  }

  private normalizeStripeSubscriptionStatus(
    stripeStatus: string,
    fallbackStatus: string,
  ): SubscriptionStatus {
    switch (stripeStatus) {
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
        return fallbackStatus as SubscriptionStatus;
    }
  }

  private resolveRequestedBillingProvider(requestedProvider?: BillingProvider): BillingProvider {
    return resolveConfiguredBillingProvider({
      requestedProvider: requestedProvider ?? this.env.billingProvider,
    });
  }

  private assertStripeClientReady(): void {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('Stripe billing mutations require QUIZMIND_RUNTIME_MODE=connected.');
    }

    if (!this.env.stripeSecretKey?.trim()) {
      throw new ServiceUnavailableException('Stripe billing mutations require STRIPE_SECRET_KEY.');
    }
  }

  private assertStripeInvoiceExportReady(): void {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('Billing invoice exports require QUIZMIND_RUNTIME_MODE=connected.');
    }

    if (!this.env.stripeSecretKey?.trim()) {
      throw new ServiceUnavailableException('Billing invoice exports require STRIPE_SECRET_KEY.');
    }
  }

  private assertStripeWebhookReady(): void {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('Stripe webhooks require QUIZMIND_RUNTIME_MODE=connected.');
    }

    if (!this.env.stripeWebhookSecret?.trim()) {
      throw new ServiceUnavailableException('Stripe webhooks require STRIPE_WEBHOOK_SECRET.');
    }
  }

  private assertYookassaWebhookReady(): void {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('YooKassa webhooks require QUIZMIND_RUNTIME_MODE=connected.');
    }
  }

  private parseStripeWebhookEvent(rawBody: Buffer): StripeWebhookEvent {
    let payload: unknown;

    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Stripe webhook payload must be valid JSON.');
    }

    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Stripe webhook payload must be an object.');
    }

    const event = payload as Partial<StripeWebhookEvent>;

    if (!event.id || !event.type) {
      throw new BadRequestException('Stripe webhook payload is missing required event fields.');
    }

    return {
      id: event.id,
      type: event.type,
      ...(typeof event.created === 'number' ? { created: event.created } : {}),
      ...(event.data && typeof event.data === 'object' ? { data: event.data } : {}),
    };
  }

  private parseYookassaWebhookEvent(rawBody: Buffer): YookassaWebhookEvent {
    let payload: unknown;

    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('YooKassa webhook payload must be valid JSON.');
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('YooKassa webhook payload must be an object.');
    }

    const envelope = payload as Record<string, unknown>;
    const type = typeof envelope.event === 'string' ? envelope.event.trim() : '';
    const objectValue =
      envelope.object && typeof envelope.object === 'object' && !Array.isArray(envelope.object)
        ? (envelope.object as Record<string, unknown>)
        : undefined;
    const objectId = typeof objectValue?.id === 'string' ? objectValue.id.trim() : '';
    const envelopeId = typeof envelope.id === 'string' ? envelope.id.trim() : '';
    const id = objectId || envelopeId;
    const createdAt = parseIsoDate(
      typeof objectValue?.created_at === 'string'
        ? objectValue.created_at
        : typeof envelope.created_at === 'string'
          ? envelope.created_at
          : undefined,
    );

    if (!type) {
      throw new BadRequestException('YooKassa webhook payload is missing event type.');
    }

    if (!id) {
      throw new BadRequestException('YooKassa webhook payload is missing event id.');
    }

    return {
      id,
      type,
      ...(createdAt ? { createdAt } : {}),
      payload: envelope,
    };
  }
}
