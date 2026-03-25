import { randomUUID } from 'node:crypto';

import { BadGatewayException, BadRequestException, Inject, Injectable } from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import {
  type AiProvider,
  type ExtensionAiRuntimeRequest,
  type ExtensionAiRuntimeResponse,
  type UsageEventPayload,
} from '@quizmind/contracts';
import { type Prisma } from '@quizmind/database';
import { decryptSecret, type EncryptedSecretEnvelope } from '@quizmind/secrets';

import { AiProviderPolicyService } from '../providers/ai-provider-policy.service';
import { ProviderCredentialRepository } from '../providers/provider-credential.repository';
import { QueueDispatchService } from '../queue/queue-dispatch.service';
import { type ExtensionInstallationSessionRecord } from './extension-installation-session.repository';

function readEncryptedEnvelope(value: Prisma.JsonValue): EncryptedSecretEnvelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;

  if (
    input.algorithm === 'aes-256-gcm' &&
    input.keyVersion === 'v1' &&
    typeof input.ciphertext === 'string' &&
    typeof input.iv === 'string' &&
    typeof input.authTag === 'string'
  ) {
    return input as unknown as EncryptedSecretEnvelope;
  }

  return null;
}

@Injectable()
export class ExtensionAiRuntimeService {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(AiProviderPolicyService)
    private readonly aiProviderPolicyService: AiProviderPolicyService,
    @Inject(ProviderCredentialRepository)
    private readonly providerCredentialRepository: ProviderCredentialRepository,
    @Inject(QueueDispatchService)
    private readonly queueDispatchService: QueueDispatchService,
  ) {}

  async executeForInstallationSession(
    installationSession: ExtensionInstallationSessionRecord,
    request: Partial<ExtensionAiRuntimeRequest> | undefined,
    operation: 'chat' | 'answer' | 'screenshot' | 'multicheck',
  ): Promise<ExtensionAiRuntimeResponse> {
    const startedAt = Date.now();
    const installationId = request?.installationId?.trim();

    if (!installationId || installationId !== installationSession.installation.installationId) {
      throw new BadRequestException('installationId is required and must match the installation session.');
    }

    const prompt = request?.prompt?.trim();

    if (!prompt) {
      throw new BadRequestException('prompt is required.');
    }

    if (request?.operation && request.operation !== operation) {
      throw new BadRequestException(`operation must match endpoint operation: ${operation}.`);
    }

    const policy = await this.aiProviderPolicyService.resolvePolicyForWorkspace(
      installationSession.installation.workspaceId ?? undefined,
    );
    const resolvedProvider =
      request?.requestedProvider && policy.providers.includes(request.requestedProvider)
        ? request.requestedProvider
        : policy.defaultProvider ?? policy.providers[0] ?? 'openrouter';
    const resolvedModel = request?.requestedModel?.trim() || policy.defaultModel || 'openrouter/auto';
    const credential = await this.providerCredentialRepository.resolveRuntimeCredential({
      userId: installationSession.userId,
      workspaceId: installationSession.installation.workspaceId,
      provider: resolvedProvider,
    });

    const secretEnvelope = credential ? readEncryptedEnvelope(credential.encryptedSecretJson) : null;
    const providerSecret =
      secretEnvelope && credential
        ? decryptSecret({
            envelope: secretEnvelope,
            secret: this.env.providerCredentialSecret,
          })
        : null;

    const execution = providerSecret
      ? await this.callProvider({
          provider: resolvedProvider,
          model: resolvedModel,
          prompt,
          operation,
          secret: providerSecret,
        })
      : {
          answer: this.buildSimulatedResponse({
            operation,
            prompt,
            provider: resolvedProvider,
          }),
          simulated: true,
        };

    await this.queueDispatchService.dispatch({
      queue: 'usage-events',
      payload: {
        installationId,
        ...(installationSession.installation.workspaceId
          ? { workspaceId: installationSession.installation.workspaceId }
          : {}),
        eventType: `extension.${operation}_requested`,
        occurredAt: new Date().toISOString(),
        payload: {
          provider: resolvedProvider,
          model: resolvedModel,
          simulated: execution.simulated,
        },
      } satisfies UsageEventPayload,
      dedupeKey: `runtime:${operation}:${installationId}:${Date.now()}`,
    });

    return {
      installationId,
      requestId: randomUUID(),
      operation,
      answer: execution.answer,
      providerSelection: {
        provider: resolvedProvider,
        model: resolvedModel,
        credentialOwnerType: credential?.ownerType ?? 'platform_default',
        policyScope: policy.scopeKey,
      },
      usage: {
        accepted: true,
        code: 'accepted',
      },
      metadata: {
        simulated: execution.simulated,
        latencyMs: Date.now() - startedAt,
        processedAt: new Date().toISOString(),
      },
    };
  }

  private buildSimulatedResponse(input: {
    operation: 'chat' | 'answer' | 'screenshot' | 'multicheck';
    prompt: string;
    provider: AiProvider;
  }): string {
    return `QuizMind (${input.provider}) handled ${input.operation} server-side. Prompt digest: ${input.prompt.slice(0, 240)}`;
  }

  private async callProvider(input: {
    provider: AiProvider;
    model: string;
    prompt: string;
    operation: 'chat' | 'answer' | 'screenshot' | 'multicheck';
    secret: string;
  }): Promise<{ answer: string; simulated: boolean }> {
    if (input.provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.secret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: input.model,
          input: input.prompt,
        }),
      });

      if (!response.ok) {
        throw new BadGatewayException(`Provider request failed with status ${response.status}.`);
      }

      const payload = (await response.json().catch(() => null)) as { output_text?: string } | null;

      return {
        answer: payload?.output_text?.trim() || 'Provider completed without text output.',
        simulated: false,
      };
    }

    return {
      answer: this.buildSimulatedResponse({
        operation: input.operation,
        prompt: input.prompt,
        provider: input.provider,
      }),
      simulated: true,
    };
  }
}
