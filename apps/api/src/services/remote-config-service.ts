import {
  type RemoteConfigPreviewRequest,
  type RemoteConfigPublishRequest,
  type RemoteConfigPublishResult,
  type ResolvedRemoteConfig,
} from '@quizmind/contracts';
import { createLogEvent } from '@quizmind/logger';
import { resolveRemoteConfig } from '@quizmind/extension';

export function previewRemoteConfig(
  request: RemoteConfigPreviewRequest,
): ResolvedRemoteConfig {
  return resolveRemoteConfig(request.layers, request.context);
}

export function publishRemoteConfigVersion(
  request: RemoteConfigPublishRequest,
): {
  publishResult: RemoteConfigPublishResult;
  auditLog: ReturnType<typeof createLogEvent>;
} {
  const publishResult: RemoteConfigPublishResult = {
    versionLabel: request.versionLabel,
    appliedLayerCount: request.layers.length,
    publishedAt: new Date().toISOString(),
    actorId: request.actorId,
    workspaceId: request.workspaceId,
  };

  return {
    publishResult,
    auditLog: createLogEvent({
      eventId: `remote-config:${request.versionLabel}`,
      eventType: 'remote_config.published',
      actorId: request.actorId,
      actorType: 'user',
      workspaceId: request.workspaceId,
      targetType: 'remote_config_version',
      targetId: request.versionLabel,
      occurredAt: publishResult.publishedAt,
      category: 'audit',
      severity: 'info',
      status: 'success',
      metadata: {
        layerCount: request.layers.length,
      },
    }),
  };
}
