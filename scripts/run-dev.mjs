import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const { rcedit } = require('rcedit');

const mode = process.argv[2] || 'server';
const isServer = mode === 'server';
const appTitle = isServer ? 'GC Hub - Server' : 'GC Hub - Client';
const exeName = isServer ? 'GC-Hub-Server.exe' : 'GC-Hub-Client.exe';

const devRuntimeDir = path.resolve(rootDir, '.dev-runtime', isServer ? 'server' : 'client');
const electronDist = path.resolve(rootDir, 'node_modules/electron/dist');
const targetExe = path.resolve(devRuntimeDir, exeName);

async function setupDevRuntime() {
  if (!fs.existsSync(devRuntimeDir)) {
    fs.mkdirSync(devRuntimeDir, { recursive: true });
  }

  // Copy all electron dist files if target exe doesn't exist
  if (!fs.existsSync(targetExe)) {
    console.log(`[DEV RUNNER] Preparing dedicated ${appTitle} dev runtime...`);
    fs.cpSync(electronDist, devRuntimeDir, { recursive: true });
    const originalExe = path.resolve(devRuntimeDir, 'electron.exe');
    if (fs.existsSync(originalExe)) {
      fs.renameSync(originalExe, targetExe);
    }
  }

  // Stamp PE Metadata & Icon
  try {
    await rcedit(targetExe, {
      'version-string': {
        'CompanyName': 'GC Net',
        'FileDescription': appTitle,
        'LegalCopyright': 'Copyright © 2026 GC Net',
        'ProductName': appTitle,
        'InternalName': isServer ? 'GC-Hub-Server' : 'GC-Hub-Client',
        'OriginalFilename': exeName
      },
      'file-version': '1.0.0',
      'product-version': '1.0.0',
      'icon': path.resolve(rootDir, 'icons/icon.ico')
    });
  } catch (e) {
    // If locked, continue
  }
}

async function start() {
  await setupDevRuntime();

  console.log(`[DEV RUNNER] Starting ${appTitle} (${exeName})...`);
  const child = spawn(targetExe, [rootDir, `--mode=${mode}`], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_APP_MODE: mode,
      ELECTRON_NO_ATTACH_CONSOLE: 'true'
    }
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

start();
