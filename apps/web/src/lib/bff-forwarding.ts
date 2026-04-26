const FORWARDED_HEADER_NAMES = ['x-forwarded-for', 'x-real-ip', 'x-forwarded-proto', 'user-agent'] as const;

type ForwardedHeaderName = (typeof FORWARDED_HEADER_NAMES)[number];

function normalizeForwardedFor(value: string): string {
  return value
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(', ');
}

export function buildForwardedAuthHeaders(request: Request): Record<string, string> {
  const forwardedHeaders: Partial<Record<ForwardedHeaderName, string>> = {};

  for (const headerName of FORWARDED_HEADER_NAMES) {
    const value = request.headers.get(headerName)?.trim();

    if (!value) {
      continue;
    }

    forwardedHeaders[headerName] = value;
  }

  const forwardedFor = forwardedHeaders['x-forwarded-for'];

  if (forwardedFor) {
    forwardedHeaders['x-forwarded-for'] = normalizeForwardedFor(forwardedFor);
  } else {
    const realIp = forwardedHeaders['x-real-ip'];

    if (realIp) {
      forwardedHeaders['x-forwarded-for'] = realIp;
    }
  }

  return forwardedHeaders as Record<string, string>;
}
