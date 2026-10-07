// Bundle satu script test lalu jalankan di Electron (better-sqlite3 dikompilasi untuk Electron),
// memakai database SQLite sementara agar data dev di data/gcserver.sqlite tidak tersentuh.
// Pakai: node scripts/run-electron-test.mjs scripts/test-xxx.ts
import { build } from 'esbuild';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const entry = process.argv[2];
if (!entry || !fs.existsSync(entry)) {
  console.error('Pakai: node scripts/run-electron-test.mjs scripts/test-xxx.ts');
  process.exit(1);
}

const outfile = path.join('dist-electron', `${path.basename(entry).replace(/\.(ts|mjs|js)$/, '')}.cjs`);
await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron', 'better-sqlite3', 'ws'],
  logLevel: 'warning',
});

const electronBinary = createRequire(import.meta.url)('electron');
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gchub-test-'));
const result = spawnSync(electronBinary, [outfile], { stdio: 'inherit', env: { ...process.env, GCHUB_DB_DIR: dbDir, GCHUB_NO_OS_EFFECTS: '1' } });
fs.rmSync(dbDir, { recursive: true, force: true });
process.exit(result.status ?? 1);
