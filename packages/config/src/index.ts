export interface PlatformEnv {
  nodeEnv: 'development' | 'test' | 'production';
  appUrl: string;
  apiUrl: string;
  databaseUrl: string;
  redisUrl: string;
}

export type EnvSource = Record<string, string | undefined>;

export function readRequiredEnv(source: EnvSource, name: string): string {
  const value = source[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadPlatformEnv(source: EnvSource = process.env): PlatformEnv {
  const nodeEnv = (source.NODE_ENV ?? 'development') as PlatformEnv['nodeEnv'];

  return {
    nodeEnv,
    appUrl: source.APP_URL ?? 'http://localhost:3000',
    apiUrl: source.API_URL ?? 'http://localhost:4000',
    databaseUrl: readRequiredEnv(source, 'DATABASE_URL'),
    redisUrl: readRequiredEnv(source, 'REDIS_URL'),
  };
}
