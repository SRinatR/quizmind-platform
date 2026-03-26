import { mapStripeBillingInterval, resolveSubscriptionStatusFromStripeEvent } from '@quizmind/billing';
import { type BillingWebhookJobPayload, type SubscriptionStatus } from '@quizmind/contracts';
import { createLogEvent } from '@quizmind/logger';

export interface BillingWebhookEventSnapshot {
  id: string;
  provider: string;
  externalEventId: string;
  eventType: string;
  payloadJson: unknown;
  status: string;
  receivedAt: Date;
  processedAt?: Date | null;
}

export interface BillingWorkspaceSnapshot {
  id: string;
  providerCustomerId?: string | null;
  stripeCustomerId?: string | null;
}

export interface BillingPlanSnapshot {
  id: string;
  code: string;
}

export interface BillingSubscriptionSnapshot {
  id: string;
  workspaceId: string;
  planId: string;
  provider?: string | null;
  providerCustomerId?: string | null;
  providerPriceId?: string | null;
  providerSubscriptionId?: string | null;
  status: SubscriptionStatus;
  billingInterval: 'monthly' | 'yearly';
  seatCount: number;
  stripeCustomerId?: string | null;
  stripePriceId?: string | null;
  stripeSubscriptionId?: string | null;
  trialStartAt?: Date | null;
}

export interface BillingInvoiceSnapshot {
  id: string;
}

export interface BillingPaymentSnapshot {
  id: string;
}

export interface BillingWebhookProcessingRepository {
  findWebhookEventById(webhookEventId: string): Promise<BillingWebhookEventSnapshot | null>;
  markWebhookEventProcessed(webhookEventId: string, processedAt: Date): Promise<void>;
  markWebhookEventFailed(webhookEventId: string, lastError: string): Promise<void>;
  findWorkspaceById(workspaceId: string): Promise<BillingWorkspaceSnapshot | null>;
  findWorkspaceByStripeCustomerId(stripeCustomerId: string): Promise<BillingWorkspaceSnapshot | null>;
  setWorkspaceStripeCustomerId(workspaceId: string, stripeCustomerId: string): Promise<void>;
  findPlanByCode(planCode: string): Promise<BillingPlanSnapshot | null>;
  findSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string): Promise<BillingSubscriptionSnapshot | null>;
  findCurrentSubscriptionByWorkspaceId(workspaceId: string): Promise<BillingSubscriptionSnapshot | null>;
  upsertStripeSubscriptionForWorkspace(input: {
    workspaceId: string;
    planId: string;
    provider?: string;
    providerCustomerId?: string;
    providerPriceId?: string;
    providerSubscriptionId?: string;
    stripeCustomerId?: string;
    stripePriceId?: string;
    stripeSubscriptionId: string;
    status: SubscriptionStatus;
    billingInterval: 'monthly' | 'yearly';
    seatCount: number;
    cancelAtPeriodEnd: boolean;
    trialStartAt?: Date;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
  }): Promise<BillingSubscriptionSnapshot>;
  updateSubscriptionStatus(subscriptionId: string, status: SubscriptionStatus): Promise<void>;
  upsertInvoice(input: {
    subscriptionId: string;
    provider?: string;
    providerInvoiceId?: string;
    externalId: string;
    amountDue: number;
    amountPaid: number;
    currency: string;
    issuedAt: Date;
    dueAt?: Date | null;
    paidAt?: Date | null;
  }): Promise<BillingInvoiceSnapshot>;
  upsertPayment(input: {
    subscriptionId: string;
    provider?: string;
    providerPaymentId?: string;
    externalId: string;
    amount: number;
    currency: string;
    status: string;
    processedAt?: Date | null;
  }): Promise<BillingPaymentSnapshot>;
}

interface StripeWebhookEvent {
  id: string;
  type: string;
  created?: number;
  data?: {
    object?: Record<string, unknown>;
  };
}

interface StripePriceObject {
  id?: string;
  recurring?: {
    interval?: string;
  };
  metadata?: Record<string, unknown>;
}

interface StripeSubscriptionItemObject {
  quantity?: number;
  price?: StripePriceObject;
}

interface StripeSubscriptionObject {
  id: string;
  customer?: string;
  status?: string;
  quantity?: number;
  cancel_at_period_end?: boolean;
  trial_start?: number;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, unknown>;
  items?: {
    data?: StripeSubscriptionItemObject[];
  };
}

interface StripeInvoiceObject {
  id: string;
  customer?: string;
  subscription?: string;
  status?: string;
  amount_due?: number;
  amount_paid?: number;
  currency?: string;
  created?: number;
  due_date?: number | null;
  payment_intent?: string | null;
  charge?: string | null;
  status_transitions?: {
    paid_at?: number | null;
  };
}

interface StripeCheckoutSessionObject {
  id: string;
  customer?: string;
  subscription?: string;
  mode?: string;
  status?: string;
  payment_status?: string;
  client_reference_id?: string;
  metadata?: Record<string, unknown>;
}

export interface BillingWebhookProcessingResult {
  processed: boolean;
  webhookEventId: string;
  externalEventId: string;
  eventType: string;
  workspaceId?: string;
  subscriptionId?: string;
  invoiceId?: string;
  paymentId?: string;
  logEvent: ReturnType<typeof createLogEvent>;
}

interface BillingWebhookMutationResult {
  workspaceId?: string;
  subscriptionId?: string;
  invoiceId?: string;
  paymentId?: string;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readDateFromUnixSeconds(value: unknown): Date | undefined {
  const timestamp = readNumber(value);

  return typeof timestamp === 'number' ? new Date(timestamp * 1000) : undefined;
}

function readMetadataValue(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  return metadata ? readString(metadata[key]) : undefined;
}

function parseStripeWebhookEvent(payloadJson: unknown): StripeWebhookEvent {
  if (!payloadJson || typeof payloadJson !== 'object') {
    throw new Error('Webhook payload is missing or invalid.');
  }

  const payload = payloadJson as Partial<StripeWebhookEvent>;
  const id = readString(payload.id);
  const type = readString(payload.type);

  if (!id || !type) {
    throw new Error('Webhook payload is missing required event fields.');
  }

  return {
    id,
    type,
    ...(typeof payload.created === 'number' ? { created: payload.created } : {}),
    ...(payload.data && typeof payload.data === 'object' ? { data: payload.data } : {}),
  };
}

function parseStripeSubscriptionObject(event: StripeWebhookEvent): StripeSubscriptionObject {
  const dataObject = event.data?.object;

  if (!dataObject || typeof dataObject !== 'object') {
    throw new Error(`Stripe event ${event.type} is missing a subscription object.`);
  }

  const subscription = dataObject as Partial<StripeSubscriptionObject>;
  const id = readString(subscription.id);

  if (!id) {
    throw new Error(`Stripe event ${event.type} is missing a subscription id.`);
  }

  return {
    id,
    customer: readString(subscription.customer),
    status: readString(subscription.status),
    quantity: readNumber(subscription.quantity),
    cancel_at_period_end: subscription.cancel_at_period_end === true,
    trial_start: readNumber(subscription.trial_start),
    current_period_start: readNumber(subscription.current_period_start),
    current_period_end: readNumber(subscription.current_period_end),
    metadata: subscription.metadata && typeof subscription.metadata === 'object' ? subscription.metadata : undefined,
    items: subscription.items && typeof subscription.items === 'object' ? subscription.items : undefined,
  };
}

function parseStripeInvoiceObject(event: StripeWebhookEvent): StripeInvoiceObject {
  const dataObject = event.data?.object;

  if (!dataObject || typeof dataObject !== 'object') {
    throw new Error(`Stripe event ${event.type} is missing an invoice object.`);
  }

  const invoice = dataObject as Partial<StripeInvoiceObject>;
  const id = readString(invoice.id);

  if (!id) {
    throw new Error(`Stripe event ${event.type} is missing an invoice id.`);
  }

  return {
    id,
    customer: readString(invoice.customer),
    subscription: readString(invoice.subscription),
    status: readString(invoice.status),
    amount_due: readNumber(invoice.amount_due),
    amount_paid: readNumber(invoice.amount_paid),
    currency: readString(invoice.currency),
    created: readNumber(invoice.created),
    due_date: invoice.due_date === null ? null : readNumber(invoice.due_date),
    payment_intent: readString(invoice.payment_intent) ?? null,
    charge: readString(invoice.charge) ?? null,
    status_transitions:
      invoice.status_transitions && typeof invoice.status_transitions === 'object'
        ? invoice.status_transitions
        : undefined,
  };
}

function parseStripeCheckoutSessionObject(event: StripeWebhookEvent): StripeCheckoutSessionObject {
  const dataObject = event.data?.object;

  if (!dataObject || typeof dataObject !== 'object') {
    throw new Error(`Stripe event ${event.type} is missing a checkout session object.`);
  }

  const session = dataObject as Partial<StripeCheckoutSessionObject>;
  const id = readString(session.id);

  if (!id) {
    throw new Error(`Stripe event ${event.type} is missing a checkout session id.`);
  }

  return {
    id,
    customer: readString(session.customer),
    subscription: readString(session.subscription),
    mode: readString(session.mode),
    status: readString(session.status),
    payment_status: readString(session.payment_status),
    client_reference_id: readString(session.client_reference_id),
    metadata: session.metadata && typeof session.metadata === 'object' ? session.metadata : undefined,
  };
}

function resolvePlanCode(subscription: StripeSubscriptionObject): string | undefined {
  const metadataPlanCode = readMetadataValue(subscription.metadata, 'planCode');

  if (metadataPlanCode) {
    return metadataPlanCode;
  }

  const firstItem = subscription.items?.data?.[0];

  return readMetadataValue(firstItem?.price?.metadata, 'planCode');
}

function resolveSeatCount(
  subscription: StripeSubscriptionObject,
  existingSubscription?: BillingSubscriptionSnapshot | null,
): number {
  const firstItemQuantity = readNumber(subscription.items?.data?.[0]?.quantity);

  return firstItemQuantity ?? subscription.quantity ?? existingSubscription?.seatCount ?? 1;
}

function resolveBillingIntervalFromMetadata(
  value: string | undefined,
): 'monthly' | 'yearly' | undefined {
  if (value === 'monthly' || value === 'yearly') {
    return value;
  }

  if (value === 'month') {
    return 'monthly';
  }

  if (value === 'year') {
    return 'yearly';
  }

  return undefined;
}

async function processStripeCheckoutCompletedEvent(
  event: StripeWebhookEvent,
  repository: BillingWebhookProcessingRepository,
): Promise<{ workspaceId: string; subscriptionId: string }> {
  const session = parseStripeCheckoutSessionObject(event);
  const workspaceIdFromMetadata =
    readMetadataValue(session.metadata, 'workspaceId') ?? readString(session.client_reference_id);
  const planCode = readMetadataValue(session.metadata, 'planCode');
  const customerId = readString(session.customer);
  const stripeSubscriptionId = readString(session.subscription);
  const stripePriceId = readMetadataValue(session.metadata, 'stripePriceId');

  if (session.mode && session.mode !== 'subscription') {
    throw new Error(`Unsupported Stripe checkout session mode "${session.mode}" for event ${event.type}.`);
  }

  if (!stripeSubscriptionId) {
    throw new Error(`Stripe checkout session ${session.id} is missing a subscription reference.`);
  }

  let workspace = workspaceIdFromMetadata ? await repository.findWorkspaceById(workspaceIdFromMetadata) : null;

  if (!workspace && customerId) {
    workspace = await repository.findWorkspaceByStripeCustomerId(customerId);
  }

  if (!workspace) {
    throw new Error(`Unable to resolve workspace for Stripe checkout session ${session.id}.`);
  }

  if (customerId && workspace.stripeCustomerId !== customerId) {
    await repository.setWorkspaceStripeCustomerId(workspace.id, customerId);
  }

  const subscriptionByStripeId = await repository.findSubscriptionByStripeSubscriptionId(stripeSubscriptionId);
  const currentWorkspaceSubscription =
    subscriptionByStripeId ?? (await repository.findCurrentSubscriptionByWorkspaceId(workspace.id));
  let planId = currentWorkspaceSubscription?.planId;

  if (planCode) {
    const plan = await repository.findPlanByCode(planCode);

    if (!plan) {
      throw new Error(`Unable to resolve internal plan for plan code "${planCode}".`);
    }

    planId = plan.id;
  }

  if (!planId) {
    throw new Error(`Stripe checkout session ${session.id} is missing a resolvable internal plan.`);
  }

  const billingInterval =
    resolveBillingIntervalFromMetadata(readMetadataValue(session.metadata, 'interval')) ??
    currentWorkspaceSubscription?.billingInterval;

  if (!billingInterval) {
    throw new Error(`Stripe checkout session ${session.id} is missing a resolvable billing interval.`);
  }

  const persistedSubscription = await repository.upsertStripeSubscriptionForWorkspace({
    workspaceId: workspace.id,
    planId,
    provider: 'stripe',
    ...(customerId ? { providerCustomerId: customerId } : {}),
    ...(stripePriceId ? { providerPriceId: stripePriceId } : {}),
    providerSubscriptionId: stripeSubscriptionId,
    ...(customerId ? { stripeCustomerId: customerId } : {}),
    ...(stripePriceId ? { stripePriceId } : {}),
    stripeSubscriptionId,
    status:
      session.payment_status === 'paid' || session.payment_status === 'no_payment_required' || session.status === 'complete'
        ? 'active'
        : currentWorkspaceSubscription?.status ?? 'incomplete',
    billingInterval,
    seatCount: currentWorkspaceSubscription?.seatCount ?? 1,
    cancelAtPeriodEnd: false,
    trialStartAt: currentWorkspaceSubscription?.trialStartAt ?? undefined,
  });

  return {
    workspaceId: workspace.id,
    subscriptionId: persistedSubscription.id,
  };
}

async function processStripeSubscriptionEvent(
  event: StripeWebhookEvent,
  repository: BillingWebhookProcessingRepository,
): Promise<{ workspaceId: string; subscriptionId: string }> {
  const subscription = parseStripeSubscriptionObject(event);
  const workspaceIdFromMetadata = readMetadataValue(subscription.metadata, 'workspaceId');
  const planCode = resolvePlanCode(subscription);
  const customerId = readString(subscription.customer);
  const stripePriceId = readString(subscription.items?.data?.[0]?.price?.id);

  let workspace = workspaceIdFromMetadata ? await repository.findWorkspaceById(workspaceIdFromMetadata) : null;

  if (!workspace && customerId) {
    workspace = await repository.findWorkspaceByStripeCustomerId(customerId);
  }

  if (!workspace) {
    throw new Error(`Unable to resolve workspace for Stripe subscription ${subscription.id}.`);
  }

  if (customerId && workspace.stripeCustomerId !== customerId) {
    await repository.setWorkspaceStripeCustomerId(workspace.id, customerId);
  }

  const subscriptionByStripeId = await repository.findSubscriptionByStripeSubscriptionId(subscription.id);
  const currentWorkspaceSubscription =
    subscriptionByStripeId ?? (await repository.findCurrentSubscriptionByWorkspaceId(workspace.id));
  let planId = currentWorkspaceSubscription?.planId;

  if (planCode) {
    const plan = await repository.findPlanByCode(planCode);

    if (!plan) {
      throw new Error(`Unable to resolve internal plan for plan code "${planCode}".`);
    }

    planId = plan.id;
  }

  if (!planId) {
    throw new Error(`Stripe subscription ${subscription.id} is missing a resolvable internal plan.`);
  }

  const stripeInterval = readString(subscription.items?.data?.[0]?.price?.recurring?.interval);
  const billingInterval =
    (stripeInterval ? mapStripeBillingInterval(stripeInterval) : undefined) ?? currentWorkspaceSubscription?.billingInterval;

  if (!billingInterval) {
    throw new Error(`Stripe subscription ${subscription.id} is missing a resolvable billing interval.`);
  }

  const persistedSubscription = await repository.upsertStripeSubscriptionForWorkspace({
    workspaceId: workspace.id,
    planId,
    provider: 'stripe',
    ...(customerId ? { providerCustomerId: customerId } : {}),
    ...(stripePriceId ? { providerPriceId: stripePriceId } : {}),
    providerSubscriptionId: subscription.id,
    ...(customerId ? { stripeCustomerId: customerId } : {}),
    ...(stripePriceId ? { stripePriceId } : {}),
    stripeSubscriptionId: subscription.id,
    status: resolveSubscriptionStatusFromStripeEvent({
      currentStatus: currentWorkspaceSubscription?.status ?? 'incomplete',
      eventType: event.type,
      stripeStatus: subscription.status,
    }),
    billingInterval,
    seatCount: resolveSeatCount(subscription, currentWorkspaceSubscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    trialStartAt:
      readDateFromUnixSeconds(subscription.trial_start) ??
      (subscription.status === 'trialing' ? readDateFromUnixSeconds(subscription.current_period_start) : undefined) ??
      currentWorkspaceSubscription?.trialStartAt ??
      undefined,
    currentPeriodStart: readDateFromUnixSeconds(subscription.current_period_start),
    currentPeriodEnd: readDateFromUnixSeconds(subscription.current_period_end),
  });

  return {
    workspaceId: workspace.id,
    subscriptionId: persistedSubscription.id,
  };
}

async function processStripeInvoiceEvent(
  event: StripeWebhookEvent,
  repository: BillingWebhookProcessingRepository,
  webhook: BillingWebhookEventSnapshot,
): Promise<{ workspaceId?: string; subscriptionId?: string; invoiceId?: string; paymentId?: string }> {
  const invoice = parseStripeInvoiceObject(event);
  const stripeSubscriptionId = readString(invoice.subscription);

  if (!stripeSubscriptionId) {
    throw new Error(`Stripe invoice ${invoice.id} is missing a subscription reference.`);
  }

  const subscription = await repository.findSubscriptionByStripeSubscriptionId(stripeSubscriptionId);

  if (!subscription) {
    throw new Error(`Unable to resolve internal subscription for Stripe subscription ${stripeSubscriptionId}.`);
  }

  const issuedAt = readDateFromUnixSeconds(invoice.created) ?? webhook.receivedAt;
  const dueAt =
    invoice.due_date === null ? null : readDateFromUnixSeconds(invoice.due_date) ?? undefined;
  const paidAt =
    readDateFromUnixSeconds(invoice.status_transitions?.paid_at) ??
    (event.type === 'invoice.payment_succeeded' ? webhook.receivedAt : undefined);
  const invoiceRecord = await repository.upsertInvoice({
    subscriptionId: subscription.id,
    provider: 'stripe',
    providerInvoiceId: invoice.id,
    externalId: invoice.id,
    amountDue: invoice.amount_due ?? 0,
    amountPaid: invoice.amount_paid ?? 0,
    currency: invoice.currency ?? 'usd',
    issuedAt,
    ...(dueAt !== undefined ? { dueAt } : {}),
    ...(paidAt !== undefined ? { paidAt } : {}),
  });
  const nextSubscriptionStatus = resolveSubscriptionStatusFromStripeEvent({
    currentStatus: subscription.status,
    eventType: event.type,
  });

  if (nextSubscriptionStatus !== subscription.status) {
    await repository.updateSubscriptionStatus(subscription.id, nextSubscriptionStatus);
  }

  const paymentExternalId = invoice.payment_intent ?? invoice.charge ?? undefined;

  if (!paymentExternalId) {
    return {
      workspaceId: subscription.workspaceId,
      subscriptionId: subscription.id,
      invoiceId: invoiceRecord.id,
    };
  }

  const paymentStatus =
    event.type === 'invoice.payment_failed'
      ? 'failed'
      : event.type === 'invoice.payment_succeeded' || invoice.status === 'paid'
        ? 'succeeded'
        : invoice.status ?? 'pending';
  const paymentRecord = await repository.upsertPayment({
    subscriptionId: subscription.id,
    provider: 'stripe',
    providerPaymentId: paymentExternalId,
    externalId: paymentExternalId,
    amount: invoice.amount_paid ?? invoice.amount_due ?? 0,
    currency: invoice.currency ?? 'usd',
    status: paymentStatus,
    ...(paidAt !== undefined ? { processedAt: paidAt } : {}),
  });

  return {
    workspaceId: subscription.workspaceId,
    subscriptionId: subscription.id,
    invoiceId: invoiceRecord.id,
    paymentId: paymentRecord.id,
  };
}

export async function processBillingWebhookJob(
  job: BillingWebhookJobPayload,
  repository: BillingWebhookProcessingRepository,
): Promise<BillingWebhookProcessingResult> {
  const webhook = await repository.findWebhookEventById(job.webhookEventId);

  if (!webhook) {
    throw new Error(`Billing webhook event ${job.webhookEventId} was not found.`);
  }

  if (webhook.processedAt || webhook.status === 'processed') {
    return {
      processed: false,
      webhookEventId: webhook.id,
      externalEventId: webhook.externalEventId,
      eventType: webhook.eventType,
      logEvent: createLogEvent({
        eventId: `billing-webhook:${webhook.id}:skipped`,
        eventType: 'billing.webhook_skipped',
        actorId: webhook.provider,
        actorType: 'system',
        targetType: 'billing_webhook',
        targetId: webhook.externalEventId,
        occurredAt: new Date().toISOString(),
        category: 'domain',
        severity: 'info',
        status: 'success',
        metadata: {
          reason: 'already_processed',
          webhookEventId: webhook.id,
          stripeEventType: webhook.eventType,
        },
      }),
    };
  }

  if (webhook.provider !== 'stripe') {
    const processedAt = new Date();

    await repository.markWebhookEventProcessed(webhook.id, processedAt);

    return {
      processed: true,
      webhookEventId: webhook.id,
      externalEventId: webhook.externalEventId,
      eventType: webhook.eventType,
      logEvent: createLogEvent({
        eventId: `billing-webhook:${webhook.id}:ignored`,
        eventType: 'billing.webhook_ignored',
        actorId: webhook.provider,
        actorType: 'system',
        targetType: 'billing_webhook',
        targetId: webhook.externalEventId,
        occurredAt: processedAt.toISOString(),
        category: 'domain',
        severity: 'warn',
        status: 'success',
        metadata: {
          webhookEventId: webhook.id,
          reason: 'unsupported_provider',
          provider: webhook.provider,
          providerEventType: webhook.eventType,
        },
      }),
    };
  }

  try {
    const event = parseStripeWebhookEvent(webhook.payloadJson);
    const mutationResult: BillingWebhookMutationResult =
      event.type === 'checkout.session.completed'
        ? await processStripeCheckoutCompletedEvent(event, repository)
        : event.type.startsWith('customer.subscription.')
        ? await processStripeSubscriptionEvent(event, repository)
        : event.type.startsWith('invoice.')
          ? await processStripeInvoiceEvent(event, repository, webhook)
          : {};
    const processedAt = new Date();

    await repository.markWebhookEventProcessed(webhook.id, processedAt);

    return {
      processed: true,
      webhookEventId: webhook.id,
      externalEventId: webhook.externalEventId,
      eventType: event.type,
      ...mutationResult,
      logEvent: createLogEvent({
        eventId: `billing-webhook:${webhook.id}:processed`,
        eventType: 'billing.webhook_processed',
        actorId: webhook.provider,
        actorType: 'system',
        ...(mutationResult.workspaceId ? { workspaceId: mutationResult.workspaceId } : {}),
        targetType: 'billing_webhook',
        targetId: webhook.externalEventId,
        occurredAt: processedAt.toISOString(),
        category: 'domain',
        severity: 'info',
        status: 'success',
        metadata: {
          webhookEventId: webhook.id,
          stripeEventType: event.type,
          ...(mutationResult.subscriptionId ? { subscriptionId: mutationResult.subscriptionId } : {}),
          ...(mutationResult.invoiceId ? { invoiceId: mutationResult.invoiceId } : {}),
          ...(mutationResult.paymentId ? { paymentId: mutationResult.paymentId } : {}),
        },
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await repository.markWebhookEventFailed(webhook.id, message);
    throw error;
  }
}
