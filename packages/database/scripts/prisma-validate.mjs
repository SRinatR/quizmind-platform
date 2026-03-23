import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma/build/index.js');

const result = spawnSync(process.execPath, [prismaCli, 'validate', '--schema', 'prisma/schema.prisma'], {
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/quizmind',
  },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
