import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException, UnauthorizedException } from '@nestjs/common';

import { ExtensionControlController } from '../src/extension/extension-control.controller';

function createIngestResult() {
  return {
    queued: true,
    queue: 'usage-events',
    job: {
      id: 'job_1',
      queue: 'usage-events',
      dedupeKey: 'dedupe_1',
      createdAt: new Date().toISOString(),
      attempts: 1,
    },
    handler: 'worker.process-usage-event',
    logEvent: {
      eventId: 'log_1',
      eventType: 'extension.usage_queued',
      occurredAt: new Date().toISOString(),
      status: 'success',
    },
  };
}

test('ExtensionControlController.ingestUsageEventV2 accepts batched telemetry envelope and normalizes event field', async () => {
  const capturedEvents: Array<Record<string, unknown>> = [];
  const extensionControlService = {
    async resolveInstallationSession() {
      return {
        installation: {
          installationId: 'inst_1',
          userId: 'user_1',
        },
      };
    },
    async ingestUsageEventForInstallationSession(_session: unknown, event?: Record<string, unknown>) {
      capturedEvents.push(event ?? {});
      return createIngestResult();
    },
  };
  const controller = new ExtensionControlController({} as any, extensionControlService as any, {} as any);
  const nowTs = Date.now();

  const response = await controller.ingestUsageEventV2(
    {
      events: [
        { event: 'connect_started', ts: nowTs, mode: 'signin' },
        {
          eventType: 'bootstrap_refreshed',
          occurredAt: '2026-03-28T10:00:12.000Z',
          payload: { status: 'connected' },
        },
      ],
    } as any,
    'Bearer installation-token',
  );

  assert.equal(capturedEvents.length, 2);
  assert.equal(capturedEvents[0]?.eventType, 'connect_started');
  assert.equal((capturedEvents[0]?.payload as Record<string, unknown>)?.mode, 'signin');
  assert.equal(capturedEvents[1]?.eventType, 'bootstrap_refreshed');
  assert.equal((capturedEvents[1]?.payload as Record<string, unknown>)?.status, 'connected');

  assert.equal(response.ok, true);
  const data = response.data as { queued: boolean; count: number };
  assert.equal(data.queued, true);
  assert.equal(data.count, 2);
});

test('ExtensionControlController.ingestUsageEventV2 keeps single-event compatibility', async () => {
  const capturedEvents: Array<Record<string, unknown>> = [];
  const extensionControlService = {
    async resolveInstallationSession() {
      return {
        installation: {
          installationId: 'inst_1',
          userId: 'user_1',
        },
      };
    },
    async ingestUsageEventForInstallationSession(_session: unknown, event?: Record<string, unknown>) {
      capturedEvents.push(event ?? {});
      return createIngestResult();
    },
  };
  const controller = new ExtensionControlController({} as any, extensionControlService as any, {} as any);

  const response = await controller.ingestUsageEventV2(
    {
      eventType: 'extension.quiz_answer_requested',
      occurredAt: '2026-03-28T10:00:12.000Z',
      payload: { source: 'content_script' },
    } as any,
    'Bearer installation-token',
  );

  assert.equal(capturedEvents.length, 1);
  assert.equal(capturedEvents[0]?.eventType, 'extension.quiz_answer_requested');
  assert.equal((capturedEvents[0]?.payload as Record<string, unknown>)?.source, 'content_script');

  assert.equal(response.ok, true);
  const data = response.data as { queued: boolean; queue: string };
  assert.equal(data.queued, true);
  assert.equal(data.queue, 'usage-events');
});

test('ExtensionControlController.ingestUsageEventV2 requires installation bearer token', async () => {
  const extensionControlService = {
    async resolveInstallationSession() {
      return {
        installation: {
          installationId: 'inst_1',
          userId: 'user_1',
        },
      };
    },
    async ingestUsageEventForInstallationSession() {
      return createIngestResult();
    },
  };
  const controller = new ExtensionControlController({} as any, extensionControlService as any, {} as any);

  await assert.rejects(
    () =>
      controller.ingestUsageEventV2(
        {
          eventType: 'extension.quiz_answer_requested',
        } as any,
        undefined,
      ),
    UnauthorizedException,
  );
});

test('ExtensionControlController.answerV2 proxies extension runtime AI payload through installation session context', async () => {
  let capturedSession: unknown;
  let capturedRequest: Record<string, unknown> | null = null;
  const extensionControlService = {
    async resolveInstallationSession() {
      return {
        installation: {
          installationId: 'inst_1',
          userId: 'user_1',
          workspaceId: 'ws_1',
        },
      };
    },
  };
  const aiProxyService = {
    async proxyForCurrentSession(session: unknown, request: Record<string, unknown>) {
      capturedSession = session;
      capturedRequest = request;
      return {
        requestId: 'req_1',
        workspaceId: 'ws_1',
        provider: 'openrouter',
        model: 'openrouter/auto',
        keySource: 'platform',
        quota: {
          key: 'limit.requests_per_day',
          limit: 100,
          consumed: 1,
          remaining: 99,
          periodStart: '2026-03-28T00:00:00.000Z',
          periodEnd: '2026-03-29T00:00:00.000Z',
          decremented: true,
          decisionCode: 'accepted',
        },
        response: {
          id: 'gen_1',
          model: 'openrouter/auto',
          choices: [{ message: { role: 'assistant', content: 'Hello' } }],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 18,
            total_tokens: 30,
          },
        },
      };
    },
  };
  const controller = new ExtensionControlController(
    {} as any,
    extensionControlService as any,
    aiProxyService as any,
  );

  const response = await controller.answerV2(
    {
      model: 'openrouter/auto',
      messages: [
        {
          role: 'user',
          content: 'Hello!',
        },
      ],
      options: {
        temperature: 0.1,
        max_tokens: 222,
      },
    } as any,
    'Bearer installation-token',
  );

  assert.equal(response.ok, true);
  assert.equal((response.data as any).id, 'gen_1');
  assert.equal((response.data as any).provider, 'openrouter');
  assert.equal((capturedRequest as any)?.model, 'openrouter/auto');
  assert.equal((capturedRequest as any)?.temperature, 0.1);
  assert.equal((capturedRequest as any)?.maxTokens, 222);
  assert.equal((capturedRequest as any)?.stream, false);
  assert.equal((capturedSession as any)?.user?.id, 'user_1');
  assert.equal((capturedSession as any)?.personaKey, 'extension-installation');
});

test('ExtensionControlController.listExtensionModels returns extension-friendly model shape', async () => {
  const extensionControlService = {
    async resolveInstallationSession() {
      return {
        installation: {
          installationId: 'inst_1',
          userId: 'user_1',
          workspaceId: 'ws_1',
        },
      };
    },
  };
  const aiProxyService = {
    async listModelsForCurrentSession() {
      return {
        workspaceId: 'ws_1',
        planCode: 'pro',
        providers: [],
        models: [
          {
            provider: 'openrouter',
            modelId: 'openrouter/auto',
            displayName: 'OpenRouter Auto',
            capabilityTags: ['text'],
            availability: 'active',
            latencyClass: 'low',
            planAvailability: ['free', 'pro'],
          },
          {
            provider: 'openai',
            modelId: 'gpt-4.1-mini',
            displayName: 'GPT-4.1 Mini',
            capabilityTags: ['text', 'vision'],
            availability: 'active',
            latencyClass: 'standard',
            planAvailability: ['pro'],
          },
        ],
      };
    },
  };
  const controller = new ExtensionControlController(
    {} as any,
    extensionControlService as any,
    aiProxyService as any,
  );

  const chatResponse = await controller.listExtensionModels('chat', 'Bearer installation-token');
  const imageResponse = await controller.listExtensionModels('image', 'Bearer installation-token');

  assert.equal(chatResponse.ok, true);
  assert.equal(Array.isArray((chatResponse.data as any).models), true);
  assert.deepEqual(
    (chatResponse.data as any).models.map((entry: Record<string, unknown>) => entry.id),
    ['openrouter/auto', 'gpt-4.1-mini'],
  );

  assert.equal(imageResponse.ok, true);
  assert.deepEqual(
    (imageResponse.data as any).models.map((entry: Record<string, unknown>) => entry.id),
    ['gpt-4.1-mini'],
  );
});

test('ExtensionControlController.listExtensionModels returns RouterAI models when selected upstream', async () => {
  const extensionControlService = {
    async resolveInstallationSession() {
      return {
        installation: {
          installationId: 'inst_1',
          userId: 'user_1',
          workspaceId: 'ws_1',
        },
      };
    },
  };
  const aiProxyService = {
    async listModelsForCurrentSession() {
      return {
        providers: [{ provider: 'routerai', displayName: 'RouterAI', availability: 'beta', supportsProxy: true, supportsBringYourOwnKey: false }],
        defaultProvider: 'routerai',
        defaultModel: 'openai/gpt-4o-mini',
        models: [
          {
            provider: 'routerai',
            modelId: 'openai/gpt-4o-mini',
            displayName: 'GPT-4o Mini',
            capabilityTags: ['text', 'vision'],
            availability: 'active',
          },
        ],
      };
    },
  };
  const controller = new ExtensionControlController(
    {} as any,
    extensionControlService as any,
    aiProxyService as any,
  );

  const response = await controller.listExtensionModels('chat', 'Bearer installation-token');

  assert.equal(response.ok, true);
  assert.deepEqual(
    (response.data as any).models.map((entry: Record<string, unknown>) => ({
      id: entry.id,
      provider: entry.provider,
    })),
    [{ id: 'openai/gpt-4o-mini', provider: 'routerai' }],
  );
});

function makeInstallationSession() {
  return {
    async resolveInstallationSession() {
      return {
        installation: {
          installationId: 'inst_1',
          userId: 'user_1',
        },
      };
    },
    recordAiFailureSafely: async () => undefined,
  };
}

test('ExtensionControlController.answerV2 rejects request when model is missing', async () => {
  const controller = new ExtensionControlController(
    {} as any,
    makeInstallationSession() as any,
    {} as any,
  );

  await assert.rejects(
    () =>
      controller.answerV2(
        {
          messages: [{ role: 'user', content: 'Hello!' }],
        } as any,
        'Bearer installation-token',
      ),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      assert.match(err.message, /missing a required model id/i);
      return true;
    },
  );
});

test('ExtensionControlController.chatV2 rejects request when model is empty string', async () => {
  const controller = new ExtensionControlController(
    {} as any,
    makeInstallationSession() as any,
    {} as any,
  );

  await assert.rejects(
    () =>
      controller.chatV2(
        {
          model: '   ',
          messages: [{ role: 'user', content: 'Hello!' }],
        } as any,
        'Bearer installation-token',
      ),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      assert.match(err.message, /missing a required model id/i);
      return true;
    },
  );
});

test('ExtensionControlController.screenshotV2 rejects request when model is missing', async () => {
  const controller = new ExtensionControlController(
    {} as any,
    makeInstallationSession() as any,
    {} as any,
  );

  await assert.rejects(
    () =>
      controller.screenshotV2(
        {
          messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }] }],
        } as any,
        'Bearer installation-token',
      ),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      assert.match(err.message, /missing a required model id/i);
      return true;
    },
  );
});

test('ExtensionControlController.multicheckV2 rejects request when model is missing', async () => {
  const controller = new ExtensionControlController(
    {} as any,
    makeInstallationSession() as any,
    {} as any,
  );

  await assert.rejects(
    () =>
      controller.multicheckV2(
        {
          messages: [{ role: 'user', content: 'Check this.' }],
        } as any,
        'Bearer installation-token',
      ),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      assert.match(err.message, /missing a required model id/i);
      return true;
    },
  );
});
