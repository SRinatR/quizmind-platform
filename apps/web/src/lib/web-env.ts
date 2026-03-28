import { loadWebEnv, validateWebEnv } from '@quizmind/config';

export const WEB_ENV = loadWebEnv();

const webEnvIssues = validateWebEnv(WEB_ENV);

if (webEnvIssues.length > 0) {
  const message = `Invalid web environment: ${webEnvIssues.map((issue) => `${issue.key}: ${issue.message}`).join('; ')}`;
  const isProductionBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

  if (isProductionBuildPhase) {
    // Next.js evaluates modules during build-time page-data collection. We defer
    // fail-fast enforcement to runtime startup so CI/local builds can compile.
  } else {
    throw new Error(message);
  }
}
