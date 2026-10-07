// Compile the Go Windows helpers to bin/ for packaging. Requires the Go toolchain.
// Run via `npm run build:agent`; package-release.mjs calls it before electron-builder so the
// exes are present when bin/** is copied into the client dist.
//   gc-agent.exe  LocalSystem service: kiosk policy, process-kill, watchdog
//   gc-probe.exe  user-session one-shot: prints the foreground app (replaces per-tick PowerShell)
//   gc-input.exe  user-session daemon: remote-assist input relay (replaces runtime-compiled C#)
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const agentDir = path.resolve(rootDir, 'agent');
const binDir = path.resolve(rootDir, 'bin');

try {
  execSync('go version', { stdio: 'ignore' });
} catch {
  console.error('[AGENT] Go toolchain tidak ditemukan. Install Go untuk membangun helper Windows.');
  process.exit(1);
}

fs.mkdirSync(binDir, { recursive: true });
const env = { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' };
const builds = [
  { name: 'gc-agent.exe', pkg: '.' },
  { name: 'gc-probe.exe', pkg: './probe' },
  { name: 'gc-input.exe', pkg: './input' }
];
for (const b of builds) {
  const out = path.resolve(binDir, b.name);
  console.log(`[AGENT] Building ${b.name} (GOOS=windows)...`);
  execSync(`go build -trimpath -ldflags="-s -w" -o "${out}" ${b.pkg}`, { cwd: agentDir, stdio: 'inherit', env });
  console.log(`[AGENT] Done -> ${out}`);
}
