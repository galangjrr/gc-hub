// Compile the gc-agent LocalSystem helper (agent/) to bin/gc-agent.exe for packaging.
// Requires the Go toolchain. Run via `npm run build:agent`; package-release.mjs calls it
// before electron-builder so the exe is present when bin/** is copied into the client dist.
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const agentDir = path.resolve(rootDir, 'agent');
const outExe = path.resolve(rootDir, 'bin', 'gc-agent.exe');

try {
  execSync('go version', { stdio: 'ignore' });
} catch {
  console.error('[AGENT] Go toolchain tidak ditemukan. Install Go untuk membangun gc-agent.exe.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(outExe), { recursive: true });
console.log('[AGENT] Building gc-agent.exe (GOOS=windows)...');
execSync(`go build -trimpath -ldflags="-s -w" -o "${outExe}" ./...`, {
  cwd: agentDir,
  stdio: 'inherit',
  env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' }
});
console.log(`[AGENT] Done -> ${outExe}`);
