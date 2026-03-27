#!/usr/bin/env node

function parseArgs(argv) {
  const parsed = {};

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }

    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

function requireArg(args, key, flagName) {
  const rawValue = args[key];

  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    throw new Error(`${flagName} is required.`);
  }

  return rawValue.trim();
}

function optionalArg(args, key) {
  const rawValue = args[key];

  if (typeof rawValue !== 'string') {
    return undefined;
  }

  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeBoolean(rawValue, fallback) {
  if (typeof rawValue === 'undefined') {
    return fallback;
  }

  const normalized = String(rawValue).trim().toLowerCase();

  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }

  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  throw new Error('Boolean flags must be true/false, 1/0, or yes/no.');
}

function parseUrl(rawValue, flagName) {
  try {
    const parsedUrl = new URL(rawValue);

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new Error(`${flagName} must use http:// or https://.`);
    }

    return parsedUrl;
  } catch {
    throw new Error(`${flagName} must be a valid absolute URL.`);
  }
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname).trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

async function main() {
  const args = parseArgs(process.argv);
  const requireHttps = normalizeBoolean(args['require-https'], false);
  const rejectLoopback = normalizeBoolean(args['reject-loopback'], false);
  const webhookUrl = parseUrl(requireArg(args, 'webhook-url', '--webhook-url'), '--webhook-url');
  const reason = requireArg(args, 'reason', '--reason');
  const apiUrl = optionalArg(args, 'api-url');
  const webUrl = optionalArg(args, 'web-url');
  const releaseRef = optionalArg(args, 'release-ref');
  const releaseSha = optionalArg(args, 'release-sha');
  const runUrl = optionalArg(args, 'run-url');
  const source = optionalArg(args, 'source') ?? 'release-gate';
  const token = optionalArg(args, 'token') ?? (process.env.ROLLBACK_WEBHOOK_TOKEN?.trim() || undefined);

  if (requireHttps && webhookUrl.protocol !== 'https:') {
    throw new Error('--webhook-url must use https:// when --require-https=true.');
  }

  if (rejectLoopback && isLoopbackHostname(webhookUrl.hostname)) {
    throw new Error('--webhook-url must not target localhost when --reject-loopback=true.');
  }

  const payload = {
    source,
    reason,
    requestedAt: new Date().toISOString(),
    ...(apiUrl ? { apiUrl } : {}),
    ...(webUrl ? { webUrl } : {}),
    ...(releaseRef ? { releaseRef } : {}),
    ...(releaseSha ? { releaseSha } : {}),
    ...(runUrl ? { runUrl } : {}),
  };

  console.log(`Triggering rollback webhook: ${webhookUrl.toString()}`);
  const response = await fetch(webhookUrl.toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await response.text().catch(() => '');

  if (!response.ok) {
    throw new Error(
      `Rollback webhook failed with status ${response.status}. Response: ${body.slice(0, 500)}`,
    );
  }

  console.log(`Rollback webhook acknowledged with status ${response.status}.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
