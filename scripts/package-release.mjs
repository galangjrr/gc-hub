import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { rcedit } = require('rcedit');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.resolve(rootDir, 'release');
const unpackedDir = path.resolve(releaseDir, 'win-unpacked');
const pfxFile = path.resolve(rootDir, 'certs/gcnet-codesign.pfx');
const buildEnv = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' };

// Terminate any running GC-Hub processes before starting
try {
  execSync('taskkill /f /im GC-Hub-Server.exe /im GC-Hub-Client.exe /im GC-Hub.exe /im electron.exe 2>nul', { stdio: 'ignore' });
} catch (e) {}

// Wait 1.5s for Windows to release file handles
execSync('ping 127.0.0.1 -n 2 >nul', { shell: 'cmd.exe' });

console.log('=== [1/4] COMPILING ELECTRON & WEB ASSETS ===');
execSync('npm run build:all', { stdio: 'inherit', cwd: rootDir, env: buildEnv });

console.log('\n=== [2/4] PACKAGING ELECTRON BASE BINARY (WITH NATIVE MODULES) ===');
execSync('npx electron-builder --dir', { stdio: 'inherit', cwd: rootDir, env: buildEnv });

const serverDist = path.resolve(releaseDir, 'GC-Hub-Server');
const clientDist = path.resolve(releaseDir, 'GC-Hub-Client');

function safeCopyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (fs.existsSync(dest)) {
    try {
      fs.rmSync(dest, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
    } catch (err) {
      console.warn(`[WARN] Direct delete failed, overwriting into: ${dest}`);
    }
  }
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function findAndRenameExe(distDir, targetExeName) {
  const possibleNames = [targetExeName, 'GC-Hub-Server.exe', 'GC-Hub-Client.exe', 'GC Hub - Server.exe', 'GC Hub.exe', 'app.exe'];
  const targetPath = path.resolve(distDir, targetExeName);
  for (const name of possibleNames) {
    const srcPath = path.resolve(distDir, name);
    if (fs.existsSync(srcPath) && srcPath !== targetPath) {
      fs.copyFileSync(srcPath, targetPath);
      try { fs.unlinkSync(srcPath); } catch (e) {}
      break;
    }
  }
}

// 3. Create Server Distribution
console.log('\n=== [3/4] CREATING GC-Hub-Server DISTRIBUTION ===');
const releaseDataDir = path.resolve(serverDist, 'data');
const devDataDir = path.resolve(rootDir, 'data');
const dataBackupDir = path.resolve(rootDir, '.server_data_backup');

// 1. Backup existing database (prefer release/data, fallback to dev data)
if (fs.existsSync(path.resolve(releaseDataDir, 'gcserver.sqlite'))) {
  fs.cpSync(releaseDataDir, dataBackupDir, { recursive: true, force: true });
  console.log('[PERSISTENCE] Preserved existing release data/gcserver.sqlite database.');
} else if (fs.existsSync(path.resolve(devDataDir, 'gcserver.sqlite'))) {
  fs.cpSync(devDataDir, dataBackupDir, { recursive: true, force: true });
  console.log('[PERSISTENCE] Preserved dev data/gcserver.sqlite database into release.');
}

safeCopyDir(unpackedDir, serverDist);

// 2. Restore database into release folder
if (fs.existsSync(dataBackupDir)) {
  if (!fs.existsSync(releaseDataDir)) {
    fs.mkdirSync(releaseDataDir, { recursive: true });
  }
  fs.cpSync(dataBackupDir, releaseDataDir, { recursive: true, force: true });
  try { fs.rmSync(dataBackupDir, { recursive: true, force: true }); } catch (e) {}
  console.log('[PERSISTENCE] Restored data/gcserver.sqlite database into release folder.');
}

findAndRenameExe(serverDist, 'GC-Hub-Server.exe');
const gcServerExe = path.resolve(serverDist, 'GC-Hub-Server.exe');

if (fs.existsSync(gcServerExe)) {
  console.log('[RCEDIT] Stamping Win32 PE Metadata: "GC Hub - Server"...');
  await rcedit(gcServerExe, {
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
}

// 4. Create Client Distribution
console.log('\n=== [4/4] CREATING GC-Hub-Client DISTRIBUTION ===');
const configBackupPath = path.resolve(rootDir, '.client-config_backup.json');
const targetConfig = path.resolve(clientDist, 'client-config.json');
if (fs.existsSync(targetConfig)) {
  fs.copyFileSync(targetConfig, configBackupPath);
  console.log('[PERSISTENCE] Preserved existing client-config.json.');
}

safeCopyDir(unpackedDir, clientDist);

if (fs.existsSync(configBackupPath)) {
  fs.copyFileSync(configBackupPath, path.resolve(clientDist, 'client-config.json'));
  try { fs.unlinkSync(configBackupPath); } catch (e) {}
  console.log('[PERSISTENCE] Restored client-config.json into release folder.');
}

findAndRenameExe(clientDist, 'GC-Hub-Client.exe');
const gcClientExe = path.resolve(clientDist, 'GC-Hub-Client.exe');

if (fs.existsSync(gcClientExe)) {
  console.log('[RCEDIT] Stamping Win32 PE Metadata: "GC Hub - Client"...');
  await rcedit(gcClientExe, {
    'version-string': {
      'CompanyName': 'GC Net',
      'FileDescription': 'GC Hub - Client',
      'LegalCopyright': 'Copyright © 2026 GC Net',
      'ProductName': 'GC Hub - Client',
      'InternalName': 'GC-Hub-Client',
      'OriginalFilename': 'GC-Hub-Client.exe'
    },
    'file-version': '1.0.0',
    'product-version': '1.0.0',
    'icon': path.resolve(rootDir, 'icons/icon.ico')
  });
}

// Copy Native Icons & Binaries
const iconsSrc = path.resolve(rootDir, 'icons');
if (fs.existsSync(iconsSrc)) {
  fs.cpSync(iconsSrc, path.resolve(serverDist, 'icons'), { recursive: true });
  fs.cpSync(iconsSrc, path.resolve(clientDist, 'icons'), { recursive: true });
}

const binSrc = path.resolve(rootDir, 'bin');
if (fs.existsSync(binSrc)) {
  fs.cpSync(binSrc, path.resolve(serverDist, 'bin'), { recursive: true });
  fs.cpSync(binSrc, path.resolve(clientDist, 'bin'), { recursive: true });
}

// 5. Code Signing & Authenticode Timestamping
if (fs.existsSync(pfxFile)) {
  console.log('\n=== [5/5] SIGNING EXECUTABLES (SmartScreen & Authenticode) ===');
  try {
    execSync('powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sign-executables.ps1', { stdio: 'inherit', cwd: rootDir });
  } catch (e) {
    console.warn('[WARN] Authenticode signing encountered warning:', e.message);
  }
}

console.log('\n======================================================');
console.log('🎉 GC-HUB BUILD & PACKAGE COMPLETED!');
console.log(`📁 Server Binary Folder: ${serverDist}`);
console.log(`   -> GC-Hub-Server.exe (Double-click to start Kasir Dashboard)`);
console.log(`📁 Client Binary Folder: ${clientDist}`);
console.log(`   -> GC-Hub-Client.exe (Double-click to start Bilik Workstation)`);
console.log('======================================================\n');
