export type AdminSectionSearchParams = Record<string, string | string[] | undefined>;

function readSearchParamValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0] ?? undefined;
  }

  return value ?? undefined;
}

export function buildAdminSectionHref(input: {
  section: string;
  currentSearchParams?: AdminSectionSearchParams;
  overrides?: Record<string, string | number | undefined>;
  removeKeys?: string[];
}): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input.currentSearchParams ?? {})) {
    if (key === 'persona') {
      continue;
    }

    const normalizedValue = readSearchParamValue(value)?.trim();

    if (!normalizedValue) {
      continue;
    }

    params.set(key, normalizedValue);
  }

  for (const key of input.removeKeys ?? []) {
    params.delete(key);
  }

  for (const [key, value] of Object.entries(input.overrides ?? {})) {
    const normalizedValue = typeof value === 'number' ? String(value) : value?.trim();

    if (!normalizedValue) {
      params.delete(key);
      continue;
    }

    params.set(key, normalizedValue);
  }

  const query = params.toString();

  return query ? `/admin/${input.section}?${query}` : `/admin/${input.section}`;
}
