import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bundle() {
  await Promise.all([
    // Main process
    build({
      entryPoints: [path.join(__dirname, 'src/main/index.ts')],
      outfile: path.join(__dirname, 'dist-electron/main/index.cjs'),
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      external: ['electron', 'better-sqlite3', 'ws'],
      sourcemap: true,
      loader: { '.woff2': 'dataurl' },
    }),
    // Preload
    build({
      entryPoints: [path.join(__dirname, 'src/preload/index.ts')],
      outfile: path.join(__dirname, 'dist-electron/preload/index.cjs'),
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      external: ['electron', 'better-sqlite3', 'ws'],
      sourcemap: true,
    }),
  ]);
  console.log('[ELECTRON BUILD] Main & Preload bundle completed.');
}

bundle().catch((err) => {
  console.error('[ELECTRON BUILD] Build failed:', err);
  process.exit(1);
});
