import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

async function patchDevExe() {
  try {
    const { rcedit } = require('rcedit');
    const devElectron = path.resolve(rootDir, 'node_modules/electron/dist/electron.exe');
    if (fs.existsSync(devElectron)) {
      await rcedit(devElectron, {
        'version-string': {
          'CompanyName': 'GC Net',
          'FileDescription': 'GC Hub - Server',
          'LegalCopyright': 'Copyright © 2026 GC Net',
          'ProductName': 'GC Hub - Server',
          'InternalName': 'GC-Hub-Server',
          'OriginalFilename': 'GC-Hub-Server.exe'
        },
        'file-version': '1.0.0',
        'product-version': '1.0.0',
        'icon': path.resolve(rootDir, 'icons/icon.ico')
      });
      console.log('[DEV] Patched node_modules/electron/dist/electron.exe PE metadata successfully.');
    }
  } catch (err) {}
}

patchDevExe();
