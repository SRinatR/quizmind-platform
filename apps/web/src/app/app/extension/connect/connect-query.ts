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

