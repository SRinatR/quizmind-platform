import {
  type PrimitiveValue,
  type RemoteConfigVersionSummary,
  type RemoteConfigPreviewRequest,
  type RemoteConfigPublishRequest,
  type RemoteConfigPublishResult,
  type RemoteConfigLayer,
  type ResolvedRemoteConfig,
} from '@quizmind/contracts';
import { createLogEvent } from '@quizmind/logger';
import { resolveRemoteConfig } from '@quizmind/extension';

import {
  type ActiveRemoteConfigLayerRecord,
  type RemoteConfigVersionRecord,
} from '../remote-config/remote-config.repository';

export function previewRemoteConfig(
  request: RemoteConfigPreviewRequest,
): ResolvedRemoteConfig {
  return resolveRemoteConfig(request.layers, request.context);
}

function isPrimitiveValueArray(value: unknown): value is PrimitiveValue[] {
  return Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item) || item === null);
}

function isPrimitiveRecord(value: unknown): value is Record<string, PrimitiveValue> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => ['string', 'number', 'boolean'].includes(typeof entry) || entry === null)
  );
}

function isRemoteConfigValueRecord(
  value: unknown,
): value is Record<string, PrimitiveValue | PrimitiveValue[] | Record<string, PrimitiveValue>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (entry) =>
        ['string', 'number', 'boolean'].includes(typeof entry) ||
        entry === null ||
        isPrimitiveValueArray(entry) ||
        isPrimitiveRecord(entry),
    )
  );
}

function isConditionsRecord(value: unknown): value is Record<string, PrimitiveValue | string[]> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (entry) =>
        ['string', 'number', 'boolean'].includes(typeof entry) ||
        entry === null ||
        (Array.isArray(entry) && entry.every((item) => typeof item === 'string')),
    )
  );
}

export function mapRemoteConfigLayerRecordToDefinition(record: ActiveRemoteConfigLayerRecord): RemoteConfigLayer {
  return {
    id: record.id,
    scope: record.scope,
    priority: record.priority,
    ...(isConditionsRecord(record.conditionsJson) ? { conditions: record.conditionsJson } : {}),
    values: isRemoteConfigValueRecord(record.valuesJson) ? record.valuesJson : {},
  };
}

export function mapRemoteConfigVersionRecordToSummary(
  record: RemoteConfigVersionRecord,
): RemoteConfigVersionSummary {
  return {
    id: record.id,
    versionLabel: record.versionLabel,
    workspaceId: record.workspaceId ?? undefined,
    isActive: record.isActive,
    publishedAt: record.createdAt.toISOString(),
    ...(record.publishedBy
      ? {
          publishedBy: {
            id: record.publishedBy.id,
            email: record.publishedBy.email,
            ...(record.publishedBy.displayName ? { displayName: record.publishedBy.displayName } : {}),
          },
        }
      : {}),
    layers: record.layers.map((layer) =>
      mapRemoteConfigLayerRecordToDefinition({
        ...layer,
        remoteConfigVersion: record,
      } as ActiveRemoteConfigLayerRecord),
    ),
  };
}

export function publishRemoteConfigVersion(
  request: RemoteConfigPublishRequest,
  options?: {
    publishedAt?: string;
  },
): {
  publishResult: RemoteConfigPublishResult;
  auditLog: ReturnType<typeof createLogEvent>;
} {
  const publishedAt = options?.publishedAt ?? new Date().toISOString();
  const publishResult: RemoteConfigPublishResult = {
    versionLabel: request.versionLabel,
    appliedLayerCount: request.layers.length,
    publishedAt,
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
