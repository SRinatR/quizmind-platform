import { type CompatibilityHandshake, type ExtensionInstallationBindRequest } from '@quizmind/contracts';

export const validBridgeBrowsers: CompatibilityHandshake['browser'][] = ['chrome', 'edge', 'brave', 'other'];

const validBrowserSet = new Set<CompatibilityHandshake['browser']>(validBridgeBrowsers);

const fieldAliases = {
  installationId: ['installationId', 'installation_id', 'installId'],
  extensionVersion: ['extensionVersion', 'extension_version', 'extVersion', 'version'],
  schemaVersion: ['schemaVersion', 'schema_version', 'schema'],
  capabilities: ['capabilities', 'capability', 'capabilities[]'],
  browser: ['browser', 'browserName', 'browser_name'],
  buildId: ['buildId', 'build_id'],
  workspaceId: ['workspaceId', 'workspace_id'],
  environment: ['environment', 'env'],
  targetOrigin: ['targetOrigin', 'target_origin', 'relayOrigin', 'relayUrl'],
  requestId: ['requestId', 'request_id', 'bridgeRequestId'],
} as const;

type BridgeFieldName = keyof typeof fieldAliases;

export interface BridgeConnectDiagnostics {
  missingFields: Array<'installationId' | 'extensionVersion' | 'schemaVersion' | 'capabilities' | 'browser'>;
  receivedParams: string[];
  acceptedAliases: Partial<Record<BridgeFieldName, string>>;
}

export interface ParsedBridgeConnectRequest {
  initialRequest: ExtensionInstallationBindRequest | null;
  targetOrigin?: string;
  requestId?: string;
  diagnostics: BridgeConnectDiagnostics;
}

export interface BridgeConnectParseOptions {
  defaultEnvironment: string;
}

function normalizeTrimmed(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function readFirstValue(params: URLSearchParams, aliases: readonly string[]): { value?: string; alias?: string } {
  for (const alias of aliases) {
    const match = params.get(alias);
    const normalized = normalizeTrimmed(match ?? undefined);

    if (normalized) {
      return { value: normalized, alias };
    }
  }

  return {};
}

function readAllValues(params: URLSearchParams, aliases: readonly string[]): { values: string[]; alias?: string } {
  const values: string[] = [];
  let alias: string | undefined;

  for (const key of aliases) {
    const matches = params.getAll(key).map((entry) => entry.trim()).filter(Boolean);

    if (matches.length > 0 && !alias) {
      alias = key;
    }

    values.push(...matches);
  }

  return {
    values,
    alias,
  };
}

function decodeCapabilities(rawValues: string[]): string[] {
  return Array.from(
    new Set(
      rawValues
        .flatMap((value) => {
          if (value.startsWith('[') && value.endsWith(']')) {
            try {
              const parsed = JSON.parse(value) as unknown;
              if (Array.isArray(parsed)) {
                return parsed;
              }
            } catch {
              return value.split(',');
            }
          }

          return value.split(',');
        })
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean),
    ),
  );
}

function parseHandshakeJson(params: URLSearchParams) {
  const handshakeParam = readFirstValue(params, ['handshake', 'extensionHandshake', 'handshakeJson']);

  if (!handshakeParam.value) {
    return null;
  }

  try {
    const parsed = JSON.parse(handshakeParam.value) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseBridgeConnectRequest(
  params: URLSearchParams,
  options: BridgeConnectParseOptions,
): ParsedBridgeConnectRequest {
  const handshakeJson = parseHandshakeJson(params);
  const acceptedAliases: Partial<Record<BridgeFieldName, string>> = {};

  const installation = readFirstValue(params, fieldAliases.installationId);
  const extensionVersion = readFirstValue(params, fieldAliases.extensionVersion);
  const schemaVersion = readFirstValue(params, fieldAliases.schemaVersion);
  const browser = readFirstValue(params, fieldAliases.browser);
  const buildId = readFirstValue(params, fieldAliases.buildId);
  const workspaceId = readFirstValue(params, fieldAliases.workspaceId);
  const environment = readFirstValue(params, fieldAliases.environment);
  const targetOrigin = readFirstValue(params, fieldAliases.targetOrigin);
  const requestId = readFirstValue(params, fieldAliases.requestId);
  const capabilityValues = readAllValues(params, fieldAliases.capabilities);

  const resolvedInstallationId = installation.value ?? normalizeTrimmed(String(handshakeJson?.installationId ?? ''));
  const resolvedExtensionVersion = extensionVersion.value ?? normalizeTrimmed(String(handshakeJson?.extensionVersion ?? ''));
  const resolvedSchemaVersion = schemaVersion.value ?? normalizeTrimmed(String(handshakeJson?.schemaVersion ?? ''));
  const resolvedBuildId = buildId.value ?? normalizeTrimmed(String(handshakeJson?.buildId ?? ''));
  const resolvedWorkspaceId = workspaceId.value;
  const resolvedEnvironment = environment.value ?? options.defaultEnvironment;
  const resolvedRequestId = requestId.value;

  const handshakeCapabilities = decodeCapabilities(
    Array.isArray(handshakeJson?.capabilities)
      ? handshakeJson.capabilities.map((item) => (typeof item === 'string' ? item : '')).filter(Boolean)
      : [],
  );
  const resolvedCapabilities = decodeCapabilities([...capabilityValues.values, ...handshakeCapabilities]);

  const rawBrowser = (browser.value ?? normalizeTrimmed(String(handshakeJson?.browser ?? '')))?.toLowerCase();
  const resolvedBrowser = rawBrowser && validBrowserSet.has(rawBrowser as CompatibilityHandshake['browser'])
    ? (rawBrowser as CompatibilityHandshake['browser'])
    : undefined;

  (Object.entries(fieldAliases) as Array<[BridgeFieldName, readonly string[]]>).forEach(([field, aliases]) => {
    const alias = aliases.find((candidate) => params.has(candidate));

    if (alias && alias !== aliases[0]) {
      acceptedAliases[field] = alias;
    }
  });

  if (!resolvedBrowser && rawBrowser) {
    acceptedAliases.browser = browser.alias ?? acceptedAliases.browser;
  }

  const missingFields: BridgeConnectDiagnostics['missingFields'] = [];

  if (!resolvedInstallationId) {
    missingFields.push('installationId');
  }

  if (!resolvedExtensionVersion) {
    missingFields.push('extensionVersion');
  }

  if (!resolvedSchemaVersion) {
    missingFields.push('schemaVersion');
  }

  if (resolvedCapabilities.length === 0) {
    missingFields.push('capabilities');
  }

  if (!resolvedBrowser) {
    missingFields.push('browser');
  }

  const initialRequest: ExtensionInstallationBindRequest | null =
    missingFields.length === 0 && resolvedInstallationId && resolvedExtensionVersion && resolvedSchemaVersion && resolvedBrowser
      ? {
          installationId: resolvedInstallationId,
          environment: resolvedEnvironment,
          handshake: {
            extensionVersion: resolvedExtensionVersion,
            schemaVersion: resolvedSchemaVersion,
            capabilities: resolvedCapabilities,
            browser: resolvedBrowser,
            ...(resolvedBuildId ? { buildId: resolvedBuildId } : {}),
          },
          ...(resolvedWorkspaceId ? { workspaceId: resolvedWorkspaceId } : {}),
        }
      : null;

  const resolvedTargetOrigin = normalizeTrimmed(targetOrigin.value);

  return {
    initialRequest,
    targetOrigin: resolvedTargetOrigin,
    requestId: resolvedRequestId,
    diagnostics: {
      missingFields,
      receivedParams: Array.from(new Set(Array.from(params.keys()))).sort(),
      acceptedAliases,
    },
  };
}

export function toSearchParams(record?: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(record ?? {})) {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry) {
          params.append(key, entry);
        }
      });
      continue;
    }

    if (value) {
      params.set(key, value);
    }
  }

  return params;
}
