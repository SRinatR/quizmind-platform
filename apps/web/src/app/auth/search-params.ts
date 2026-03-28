export function readSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function resolveNextPath(rawValue: string | string[] | undefined, fallback = '/app'): string {
  const value = readSearchParam(rawValue);

  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  return value;
}

export function readBooleanSearchParam(value: string | string[] | undefined): boolean {
  const normalized = readSearchParam(value);

  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function withNextPath(path: string, nextPath: string): string {
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}next=${encodeURIComponent(nextPath)}`;
}
