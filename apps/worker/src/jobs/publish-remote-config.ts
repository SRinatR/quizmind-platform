import { createLogEvent } from '@quizmind/logger';
import { type RemoteConfigPublishResult } from '@quizmind/contracts';

export interface RemoteConfigPublishJobResult {
  propagated: boolean;
  logEvent: ReturnType<typeof createLogEvent>;
}

export function propagateRemoteConfigPublish(
  publishResult: RemoteConfigPublishResult,
): RemoteConfigPublishJobResult {
  return {
    propagated: true,
    logEvent: createLogEvent({
      eventId: `remote-config-propagation:${publishResult.versionLabel}`,
      eventType: 'remote_config.propagated',
      actorId: publishResult.actorId,
      actorType: 'user',
      targetType: 'remote_config_version',
      targetId: publishResult.versionLabel,
      occurredAt: publishResult.publishedAt,
      category: 'domain',
      severity: 'info',
      status: 'success',
      metadata: {
        appliedLayerCount: publishResult.appliedLayerCount,
      },
    }),
  };
}
