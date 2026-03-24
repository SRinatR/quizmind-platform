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
  type BillingCheckoutRequest,
  type BillingCheckoutResult,
  type BillingInterval,
  type BillingInvoicePdfResult,
  type BillingInvoicesPayload,
  type BillingPlansPayload,
  type BillingPortalRequest,
  type BillingPortalResult,
  type BillingSubscriptionMutationRequest,
  type BillingSubscriptionMutationResult,
  type BillingWebhookIngestResult,
  type BillingWebhookJobPayload,
  type SubscriptionStatus,
} from '@quizmind/contracts';
import { Prisma } from '@quizmind/database';

import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { QueueDispatchService } from '../queue/queue-dispatch.service';
import { canReadWorkspaceSubscription, canUpdateWorkspaceSubscription } from '../services/access-service';
import { mapPlanCatalogRecordToEntry } from '../services/billing-service';
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

function parseBillingInterval(value: BillingCheckoutRequest['interval'] | undefined): BillingInterval {
  if (value === 'monthly' || value === 'yearly') {
    return value;
  }

  throw new BadRequestException('interval must be either "monthly" or "yearly".');
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
    this.assertStripeInvoiceExportReady();

    const resolvedInvoiceId = readRequiredString(invoiceId, 'invoiceId');
    const invoice = await this.billingRepository.findInvoiceExportContext(resolvedInvoiceId);

    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }

    await this.loadWorkspaceForSubscriptionRead(session, invoice.workspaceId);

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
      externalId: stripeInvoice.externalId,
      redirectUrl: stripeInvoice.redirectUrl,
      format: stripeInvoice.format,
    };
  }

  async createCheckoutSession(
    session: CurrentSessionSnapshot,
    request?: Partial<BillingCheckoutRequest>,
  ): Promise<BillingCheckoutResult> {
    this.assertStripeClientReady();

    const workspaceId = readRequiredString(request?.workspaceId, 'workspaceId');
    const planCode = readRequiredString(request?.planCode, 'planCode').toLowerCase();
    const interval = parseBillingInterval(request?.interval);
    const workspace = await this.loadWorkspaceForSubscriptionMutation(session, workspaceId);

    if (planCode === 'free') {
      throw new BadRequestException('The free plan does not require a Stripe checkout session.');
    }

    const plan = await this.billingRepository.findActivePlanByCode(planCode);

    if (!plan) {
      throw new NotFoundException(`Plan "${planCode}" was not found.`);
    }

    const price = plan.prices.find(
      (candidate) => candidate.intervalCode === interval && candidate.currency.toLowerCase() === 'usd',
    );

    if (!price?.stripePriceId?.trim()) {
      throw new ServiceUnavailableException(
        `Plan "${planCode}" is missing a Stripe price mapping for the ${interval} interval.`,
      );
    }

    const customerId = await this.resolveWorkspaceStripeCustomerId(workspace, session.user.email);
    const currentSubscription = workspace.subscriptions[0] ?? null;
    const checkoutSession = await createStripeCheckoutSession({
      secretKey: this.env.stripeSecretKey!,
      customerId,
      stripePriceId: price.stripePriceId,
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
        stripePriceId: price.stripePriceId,
      },
      subscriptionMetadata: {
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
        planCode: plan.code,
        interval,
        stripePriceId: price.stripePriceId,
      },
    });

    if (checkoutSession.customerId !== customerId) {
      await this.billingRepository.updateWorkspaceStripeCustomerId(workspace.id, checkoutSession.customerId);
    }

    return {
      workspaceId: workspace.id,
      planCode: plan.code,
      interval,
      customerId: checkoutSession.customerId,
      stripePriceId: price.stripePriceId,
      sessionId: checkoutSession.sessionId,
      redirectUrl: checkoutSession.redirectUrl,
    };
  }

  async createPortalSession(
    session: CurrentSessionSnapshot,
    request?: Partial<BillingPortalRequest>,
  ): Promise<BillingPortalResult> {
    this.assertStripeClientReady();

    const workspaceId = readRequiredString(request?.workspaceId, 'workspaceId');
    const workspace = await this.loadWorkspaceForSubscriptionMutation(session, workspaceId);
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
      customerId,
      redirectUrl: portalSession.redirectUrl,
    };
  }

  async cancelSubscription(
    session: CurrentSessionSnapshot,
    request?: Partial<BillingSubscriptionMutationRequest>,
  ): Promise<BillingSubscriptionMutationResult> {
    this.assertStripeClientReady();

    const workspaceId = readRequiredString(request?.workspaceId, 'workspaceId');
    const workspace = await this.loadWorkspaceForSubscriptionMutation(session, workspaceId);
    const currentSubscription = this.getCurrentWorkspaceSubscription(workspace);

    if (currentSubscription.cancelAtPeriodEnd) {
      return {
        workspaceId: workspace.id,
        subscriptionId: currentSubscription.id,
        stripeSubscriptionId: currentSubscription.stripeSubscriptionId,
        status: currentSubscription.status as SubscriptionStatus,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: currentSubscription.currentPeriodEnd?.toISOString(),
      };
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
      cancelAtPeriodEnd: true,
      status: nextStatus,
      ...(stripeSubscription.currentPeriodEnd !== undefined
        ? { currentPeriodEnd: stripeSubscription.currentPeriodEnd }
        : {}),
      ...(stripeSubscription.customerId ? { stripeCustomerId: stripeSubscription.customerId } : {}),
      ...(stripeSubscription.stripePriceId ? { stripePriceId: stripeSubscription.stripePriceId } : {}),
    });

    if (stripeSubscription.customerId && workspace.stripeCustomerId !== stripeSubscription.customerId) {
      await this.billingRepository.updateWorkspaceStripeCustomerId(workspace.id, stripeSubscription.customerId);
    }

    return {
      workspaceId: workspace.id,
      subscriptionId: currentSubscription.id,
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
    this.assertStripeClientReady();

    const workspaceId = readRequiredString(request?.workspaceId, 'workspaceId');
    const workspace = await this.loadWorkspaceForSubscriptionMutation(session, workspaceId);
    const currentSubscription = this.getCurrentWorkspaceSubscription(workspace);

    if (!currentSubscription.cancelAtPeriodEnd) {
      return {
        workspaceId: workspace.id,
        subscriptionId: currentSubscription.id,
        stripeSubscriptionId: currentSubscription.stripeSubscriptionId,
        status: currentSubscription.status as SubscriptionStatus,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: currentSubscription.currentPeriodEnd?.toISOString(),
      };
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
      cancelAtPeriodEnd: false,
      status: nextStatus,
      ...(stripeSubscription.currentPeriodEnd !== undefined
        ? { currentPeriodEnd: stripeSubscription.currentPeriodEnd }
        : {}),
      ...(stripeSubscription.customerId ? { stripeCustomerId: stripeSubscription.customerId } : {}),
      ...(stripeSubscription.stripePriceId ? { stripePriceId: stripeSubscription.stripePriceId } : {}),
    });

    if (stripeSubscription.customerId && workspace.stripeCustomerId !== stripeSubscription.customerId) {
      await this.billingRepository.updateWorkspaceStripeCustomerId(workspace.id, stripeSubscription.customerId);
    }

    return {
      workspaceId: workspace.id,
      subscriptionId: currentSubscription.id,
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

    const job = await this.queueDispatchService.dispatch<BillingWebhookJobPayload>({
      queue: 'billing-webhooks',
      dedupeKey: `stripe:${event.id}`,
      payload: {
        provider: 'stripe',
        webhookEventId: persistedEvent.record.id,
        externalEventId: event.id,
        eventType: event.type,
        receivedAt: persistedEvent.record.receivedAt.toISOString(),
      },
    });

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
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
    stripeSubscriptionId: string;
  } {
    const currentSubscription = workspace.subscriptions[0] ?? null;

    if (!currentSubscription) {
      throw new NotFoundException('Subscription not found for workspace.');
    }

    if (!currentSubscription.stripeSubscriptionId?.trim()) {
      throw new ServiceUnavailableException('Current workspace subscription is not linked to Stripe yet.');
    }

    return {
      id: currentSubscription.id,
      status: currentSubscription.status,
      cancelAtPeriodEnd: currentSubscription.cancelAtPeriodEnd,
      currentPeriodEnd: currentSubscription.currentPeriodEnd,
      stripeSubscriptionId: currentSubscription.stripeSubscriptionId,
    };
  }

  private async resolveWorkspaceStripeCustomerId(
    workspace: BillingWorkspaceContextRecord,
    fallbackEmail?: string | null,
  ): Promise<string> {
    const existingCustomerId =
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

  private assertStripeClientReady(): void {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('Stripe billing mutations require QUIZMIND_RUNTIME_MODE=connected.');
    }

    if (this.env.billingProvider !== 'stripe') {
      throw new ServiceUnavailableException('Stripe billing mutations require BILLING_PROVIDER=stripe.');
    }

    if (!this.env.stripeSecretKey?.trim()) {
      throw new ServiceUnavailableException('Stripe billing mutations require STRIPE_SECRET_KEY.');
    }
  }

  private assertStripeInvoiceExportReady(): void {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('Billing invoice exports require QUIZMIND_RUNTIME_MODE=connected.');
    }

    if (this.env.billingProvider !== 'stripe') {
      throw new ServiceUnavailableException('Billing invoice exports require BILLING_PROVIDER=stripe.');
    }

    if (!this.env.stripeSecretKey?.trim()) {
      throw new ServiceUnavailableException('Billing invoice exports require STRIPE_SECRET_KEY.');
    }
  }

  private assertStripeWebhookReady(): void {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('Stripe webhooks require QUIZMIND_RUNTIME_MODE=connected.');
    }

    if (this.env.billingProvider !== 'stripe') {
      throw new ServiceUnavailableException('Stripe webhooks require BILLING_PROVIDER=stripe.');
    }

    if (!this.env.stripeWebhookSecret?.trim()) {
      throw new ServiceUnavailableException('Stripe webhooks require STRIPE_WEBHOOK_SECRET.');
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
}
