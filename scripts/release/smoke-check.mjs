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

function normalizeBaseUrl(rawValue, flagName) {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    throw new Error(`${flagName} is required.`);
  }

  const normalized = rawValue.trim();

  try {
    const url = new URL(normalized);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`${flagName} must use http:// or https://.`);
    }

    return url.origin;
  } catch {
    throw new Error(`${flagName} must be a valid absolute URL.`);
  }
}

function parseBaseUrl(rawValue, flagName) {
  try {
    return new URL(normalizeBaseUrl(rawValue, flagName));
  } catch (error) {
    throw error instanceof Error ? error : new Error(`${flagName} must be a valid absolute URL.`);
  }
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname).trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function validatePublicUrl(url, flagName, options) {
  if (options.requireHttps && url.protocol !== 'https:') {
    throw new Error(`${flagName} must use https:// when --require-https=true.`);
  }

  if (options.rejectLoopback && isLoopbackHostname(url.hostname)) {
    throw new Error(`${flagName} must not target localhost when --reject-loopback=true.`);
  }
}

function normalizeTimeoutSeconds(rawValue) {
  if (typeof rawValue === 'undefined') {
    return 180;
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < 10 || parsed > 1800) {
    throw new Error('--timeout-seconds must be an integer between 10 and 1800.');
  }

  return parsed;
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

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttpOk(url, timeoutMs, label) {
  const startedAt = Date.now();
  let lastStatus = 0;
  let lastBody = '';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'user-agent': 'quizmind-release-smoke-check/1.0',
        },
      });

      const body = await response.text();
      lastStatus = response.status;
      lastBody = body.slice(0, 300);

      if (response.ok) {
        console.log(`[OK] ${label}: ${url} -> ${response.status}`);
        return;
      }
    } catch (error) {
      lastStatus = 0;
      lastBody = error instanceof Error ? error.message : String(error);
    }

    await sleep(2_000);
  }

  throw new Error(
    `[FAILED] ${label}: ${url} did not return 2xx within ${Math.ceil(timeoutMs / 1000)}s. Last status=${lastStatus}; last output=${lastBody}`,
  );
}

async function waitForApiReady(url, timeoutMs) {
  const startedAt = Date.now();
  let lastFailure = 'No attempts yet.';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'user-agent': 'quizmind-release-smoke-check/1.0',
        },
      });
      const body = await response.text();

      if (!response.ok) {
        lastFailure = `status=${response.status}; body=${body.slice(0, 300)}`;
        await sleep(2_000);
        continue;
      }

      const parsed = JSON.parse(body);
      const data = parsed?.data;
      const checks = data?.checks;

      if (!parsed?.ok || !data || data.status !== 'ready') {
        lastFailure = 'API ready payload shape is invalid or status is not "ready".';
        await sleep(2_000);
        continue;
      }

      if (
        !checks ||
        checks.runtimeConnected !== true ||
        checks.validationIssues !== true ||
        checks.postgresReachable !== true ||
        checks.postgresSchemaReady !== true ||
        checks.redisReachable !== true
      ) {
        lastFailure = `API readiness checks are incomplete: ${JSON.stringify(checks ?? {}).slice(0, 300)}`;
        await sleep(2_000);
        continue;
      }

      console.log(`[OK] API readiness confirmed: ${url}`);
      return data;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      await sleep(2_000);
    }
  }

  throw new Error(
    `[FAILED] API readiness timed out within ${Math.ceil(timeoutMs / 1000)}s. Last failure: ${lastFailure}`,
  );
}

async function waitForApiHealth(url, timeoutMs, checks) {
  const startedAt = Date.now();
  let lastFailure = 'No attempts yet.';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'user-agent': 'quizmind-release-smoke-check/1.0',
        },
      });
      const body = await response.text();

      if (!response.ok) {
        lastFailure = `status=${response.status}; body=${body.slice(0, 300)}`;
        await sleep(2_000);
        continue;
      }

      const parsed = JSON.parse(body);
      const data = parsed?.data;

      if (!parsed?.ok || !data || typeof data !== 'object') {
        lastFailure = 'API health payload shape is invalid.';
        await sleep(2_000);
        continue;
      }

      const runtimeMode = data?.runtime?.runtimeMode;
      const validationIssues = Array.isArray(data?.configuration?.validationIssues)
        ? data.configuration.validationIssues
        : [];

      if (checks.requireConnected && runtimeMode !== 'connected') {
        lastFailure = `runtimeMode is "${String(runtimeMode)}" but connected mode is required.`;
        await sleep(2_000);
        continue;
      }

      if (checks.requireZeroValidationIssues && validationIssues.length > 0) {
        lastFailure = `validationIssues present: ${JSON.stringify(validationIssues).slice(0, 400)}`;
        await sleep(2_000);
        continue;
      }

      console.log(`[OK] API health envelope validated: ${url}`);
      return data;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      await sleep(2_000);
    }
  }

  throw new Error(
    `[FAILED] API health validation timed out within ${Math.ceil(timeoutMs / 1000)}s. Last failure: ${lastFailure}`,
  );
}

async function assertWorkspaceEndpointRequiresAuth(apiUrl) {
  const url = `${apiUrl}/workspaces`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'user-agent': 'quizmind-release-smoke-check/1.0',
    },
  });
  const body = await response.text();

  if (response.status === 401 || response.status === 403) {
    console.log(`[OK] Workspace endpoint enforces auth: ${url} -> ${response.status}`);
    return;
  }

  throw new Error(
    `[FAILED] ${url} must reject unauthenticated calls with 401/403 in connected mode. Received ${response.status}: ${body.slice(0, 300)}`,
  );
}

async function assertAuthLoginHealth(apiUrl, options) {
  const url = `${apiUrl}/auth/login`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'quizmind-release-smoke-check/1.0',
    },
    body: JSON.stringify({}),
  });
  const body = await response.text();

  if (response.status >= 500) {
    throw new Error(`[FAILED] ${url} returned ${response.status}. Body: ${body.slice(0, 300)}`);
  }

  const validClientErrorStatuses = new Set([400, 401, 403, 422, 429]);

  if (!validClientErrorStatuses.has(response.status)) {
    throw new Error(
      `[FAILED] ${url} returned unexpected status ${response.status}. Expected one of: ${Array.from(validClientErrorStatuses).join(', ')}.`,
    );
  }

  if (options.requireRateLimitHeaders) {
    const limitHeader = response.headers.get('x-ratelimit-limit');
    const remainingHeader = response.headers.get('x-ratelimit-remaining');

    if (!limitHeader || !remainingHeader) {
      throw new Error(
        `[FAILED] ${url} response is missing required rate-limit headers (x-ratelimit-limit/x-ratelimit-remaining).`,
      );
    }
  }

  console.log(`[OK] Auth login endpoint rejected invalid payload as expected: ${url} -> ${response.status}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const requireHttps = normalizeBoolean(args['require-https'], false);
  const rejectLoopback = normalizeBoolean(args['reject-loopback'], false);
  const apiBaseUrl = parseBaseUrl(args['api-url'], '--api-url');
  validatePublicUrl(apiBaseUrl, '--api-url', { requireHttps, rejectLoopback });
  const apiUrl = apiBaseUrl.origin;
  const webBaseUrl = typeof args['web-url'] === 'string' && args['web-url'].trim().length > 0
    ? parseBaseUrl(args['web-url'], '--web-url')
    : undefined;
  if (webBaseUrl) {
    validatePublicUrl(webBaseUrl, '--web-url', { requireHttps, rejectLoopback });
  }
  const webUrl = webBaseUrl?.origin;
  const timeoutSeconds = normalizeTimeoutSeconds(args['timeout-seconds']);
  const requireConnected = normalizeBoolean(args['require-connected'], true);
  const requireZeroValidationIssues = normalizeBoolean(args['require-zero-validation-issues'], true);
  const requireRateLimitHeaders = normalizeBoolean(args['require-rate-limit-headers'], true);
  const timeoutMs = timeoutSeconds * 1000;

  console.log(`Running release smoke checks with timeout=${timeoutSeconds}s`);
  await waitForApiReady(`${apiUrl}/ready`, timeoutMs);
  await waitForApiHealth(`${apiUrl}/health`, timeoutMs, {
    requireConnected,
    requireZeroValidationIssues,
  });
  await waitForHttpOk(`${apiUrl}/foundation`, timeoutMs, 'API foundation');
  await assertWorkspaceEndpointRequiresAuth(apiUrl);
  await assertAuthLoginHealth(apiUrl, {
    requireRateLimitHeaders,
  });

  if (webUrl) {
    await waitForHttpOk(`${webUrl}/`, timeoutMs, 'Web root');
  }

  console.log('Release smoke checks passed.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
