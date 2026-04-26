function titleToken(token: string): string {
  if (/^\d+[a-z]?$/i.test(token)) return token.toUpperCase();
  if (/^[a-z]\d+[a-z]?$/i.test(token)) return token.toUpperCase();
  if (/^gpt$/i.test(token)) return 'GPT';
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function getReadableModelName(modelId: string): string {
  const normalized = (modelId || '').trim();
  if (!normalized) return 'Unknown model';

  const withoutSuffix = normalized.replace(/:free$/i, '');
  const segments = withoutSuffix.split('/').filter(Boolean);
  const leaf = (segments[segments.length - 1] || withoutSuffix)
    .replace(/[-_]+/g, ' ')
    .trim();

  if (!leaf) return withoutSuffix;

  return leaf
    .split(/\s+/)
    .filter(Boolean)
    .map(titleToken)
    .join(' ');
}
