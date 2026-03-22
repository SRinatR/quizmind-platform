export interface PlatformEnv {
  nodeEnv: 'development' | 'test' | 'production';
  appUrl: string;
  apiUrl: string;
  databaseUrl: string;
  redisUrl: string;
  runtimeMode: 'mock' | 'connected';
}

export type EnvSource = Record<string, string | undefined>;

export function readRequiredEnv(source: EnvSource, name: string): string {
  const value = source[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function readNumberEnv(source: EnvSource, name: string, fallback: number): number {
  const rawValue = source[name];

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function resolveNodeEnv(source: EnvSource): PlatformEnv['nodeEnv'] {
  const nodeEnv = source.NODE_ENV ?? 'development';

  return nodeEnv === 'production' || nodeEnv === 'test' ? nodeEnv : 'development';
}

function resolveRuntimeMode(source: EnvSource): PlatformEnv['runtimeMode'] {
  return source.QUIZMIND_RUNTIME_MODE === 'connected' ? 'connected' : 'mock';
}

export function loadPlatformEnv(source: EnvSource = process.env): PlatformEnv {
  return {
    nodeEnv: resolveNodeEnv(source),
    appUrl: source.APP_URL ?? source.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    apiUrl: source.API_URL ?? source.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
    databaseUrl: source.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/quizmind',
    redisUrl: source.REDIS_URL ?? 'redis://localhost:6379',
    runtimeMode: resolveRuntimeMode(source),
  };
}

export interface ApiEnv extends PlatformEnv {
  port: number;
  jwtSecret: string;
}

export interface WebEnv {
  nodeEnv: PlatformEnv['nodeEnv'];
  appUrl: string;
  apiUrl: string;
  defaultPersona: string;
}

export interface WorkerEnv extends PlatformEnv {
  heartbeatIntervalMs: number;
}

export function loadApiEnv(source: EnvSource = process.env): ApiEnv {
  const platformEnv = loadPlatformEnv(source);

  return {
    ...platformEnv,
    port: readNumberEnv(source, 'API_PORT', 4000),
    jwtSecret: source.JWT_SECRET ?? 'replace-me',
  };
}

export function loadWebEnv(source: EnvSource = process.env): WebEnv {
  const platformEnv = loadPlatformEnv(source);

  return {
    nodeEnv: platformEnv.nodeEnv,
    appUrl: platformEnv.appUrl,
    apiUrl: platformEnv.apiUrl,
    defaultPersona: source.DEFAULT_PERSONA ?? 'platform-admin',
  };
}

export function loadWorkerEnv(source: EnvSource = process.env): WorkerEnv {
  const platformEnv = loadPlatformEnv(source);

  return {
    ...platformEnv,
    heartbeatIntervalMs: readNumberEnv(source, 'WORKER_HEARTBEAT_MS', 30000),
  };
}
