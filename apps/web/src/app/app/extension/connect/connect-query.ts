import { readSearchParam } from '../../../auth/search-params';

const validAuthModes = new Set(['signup', 'login']);

function readTrimmedSearchParam(value: string | string[] | undefined): string | undefined {
  const normalized = readSearchParam(value)?.trim();

  return normalized ? normalized : undefined;
}

function normalizeCapabilityToken(value: string): string {
  return value.replace(/^[\s"'[\]]+|[\s"'[\]]+$/g, '').trim();
}

function parseCapabilitySearchEntry(value: string): string[] {
  const normalized = value.trim();

  if (!normalized) {
    return [];
  }

  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    try {
      const parsed = JSON.parse(normalized);

      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string')
          .map(normalizeCapabilityToken)
          .filter((item) => item.length > 0);
      }
    } catch {
      // Fall back to CSV parsing when capabilities are not valid JSON.
    }
  }

  return normalized
    .split(',')
    .map(normalizeCapabilityToken)
    .filter((item) => item.length > 0);
}

export function normalizeHttpOriginSearchParam(value: string | string[] | undefined): string | undefined {
  const normalized = readTrimmedSearchParam(value);

  if (!normalized) {
    return undefined;
  }

  try {
    const parsed = new URL(normalized);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }

    return parsed.origin;
  } catch {
    return undefined;
  }
}

export function readStringListSearchParam(value: string | string[] | undefined): string[] {
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];

  return Array.from(
    new Set(
      rawValues
        .flatMap((item) => parseCapabilitySearchEntry(item))
        .filter((item) => item.length > 0),
    ),
  );
}

export function resolveAuthMode(value: string | string[] | undefined): 'signup' | 'login' {
  const normalized = readTrimmedSearchParam(value)?.toLowerCase();

  if (!normalized || !validAuthModes.has(normalized)) {
    return 'login';
  }

  return normalized as 'signup' | 'login';
}

export function resolveStrictPlatformOriginMode(
  value: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  const normalized = value?.trim().toLowerCase();

  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true;
  }

  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }

  return nodeEnv === 'production';
}

export function resolvePlatformOriginValidation(input: {
  declaredPlatformOrigin?: string;
  configuredPlatformOrigin?: string;
  strictMode: boolean;
}): {
  warning: string | null;
  securityIssue: string | null;
} {
  if (
    !input.declaredPlatformOrigin ||
    !input.configuredPlatformOrigin ||
    input.declaredPlatformOrigin === input.configuredPlatformOrigin
  ) {
    return {
      warning: null,
      securityIssue: null,
    };
  }

  const mismatchMessage = `Bridge URL declares platformOrigin=${input.declaredPlatformOrigin}, but the site is configured as ${input.configuredPlatformOrigin}. Keep one environment origin for extension launch and auth redirect.`;

  if (input.strictMode) {
    return {
      warning: null,
      securityIssue: `${mismatchMessage} Bridge connect is blocked until origins match.`,
    };
  }

  return {
    warning: mismatchMessage,
    securityIssue: null,
  };
}
