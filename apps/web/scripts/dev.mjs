import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(currentDirectory, '..');
const preferredPort = Number(process.env.WEB_PORT ?? 3000);
const hostname = process.env.WEB_HOSTNAME ?? '127.0.0.1';
const require = createRequire(import.meta.url);

function probePort(port) {
  return new Promise((resolveProbe) => {
    const server = createServer();

    server.once('error', () => {
      resolveProbe(false);
    });

    server.once('listening', () => {
      server.close(() => resolveProbe(true));
    });

    server.listen(port);
  });
}

async function findAvailablePort(port) {
  let candidate = port;

  while (!(await probePort(candidate))) {
    candidate += 1;
  }

  return candidate;
}

const resolvedPort = await findAvailablePort(preferredPort);

if (resolvedPort !== preferredPort) {
  console.log(`[quizmind-web] Port ${preferredPort} is busy, switching to ${resolvedPort}.`);
}

const nextEntrypoint = require.resolve('next/dist/bin/next');

const child = spawn(
  process.execPath,
  [nextEntrypoint, 'dev', '--hostname', hostname, '--port', String(resolvedPort)],
  {
  cwd: appDirectory,
  stdio: 'inherit',
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
