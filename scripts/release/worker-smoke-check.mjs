#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

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
  const value = args[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${flagName} is required.`);
  }

  return value.trim();
}

function normalizeTimeoutSeconds(rawValue) {
  if (typeof rawValue === 'undefined') {
    return 120;
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

async function tryReadFile(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

async function waitForWorkerSignals(options) {
  const startedAt = Date.now();
  let lastLogTail = '';

  while (Date.now() - startedAt < options.timeoutMs) {
    const logContent = await tryReadFile(options.logFile);
    lastLogTail = logContent.slice(-800);

    const started = logContent.includes('"eventType":"platform.worker_started"');
    const queueBound = logContent.includes('"eventType":"platform.worker_queues_bound"');
    const fallback = logContent.includes('"eventType":"platform.worker_fallback_mode"');

    if (options.forbidFallback && fallback) {
      throw new Error(
        `[FAILED] Worker entered fallback mode during smoke check. Log file: ${options.logFile}`,
      );
    }

    if (started && (!options.requireQueueBind || queueBound)) {
      console.log(`[OK] Worker smoke signals observed in ${options.logFile}.`);
      return;
    }

    await sleep(2_000);
  }

  throw new Error(
    `[FAILED] Worker smoke timed out after ${Math.ceil(options.timeoutMs / 1000)}s. Expected startup/queue-bind events in ${options.logFile}. Last log tail:\n${lastLogTail}`,
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const logFile = requireArg(args, 'log-file', '--log-file');
  const timeoutSeconds = normalizeTimeoutSeconds(args['timeout-seconds']);
  const requireQueueBind = normalizeBoolean(args['require-queue-bind'], true);
  const forbidFallback = normalizeBoolean(args['forbid-fallback'], true);

  console.log(
    `Running worker smoke check with timeout=${timeoutSeconds}s, requireQueueBind=${String(requireQueueBind)}, forbidFallback=${String(forbidFallback)}`,
  );

  await waitForWorkerSignals({
    logFile,
    timeoutMs: timeoutSeconds * 1000,
    requireQueueBind,
    forbidFallback,
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
