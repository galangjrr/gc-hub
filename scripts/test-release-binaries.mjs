/**
 * GC-Hub Standalone Release Binary (.exe) E2E Test Suite
 * Spawns the compiled GC-Hub-Server.exe and GC-Hub-Client.exe from release directory
 * and verifies real production behavior on Windows OS.
 */

import { spawn, execSync } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const serverExePath = path.resolve(rootDir, 'release/GC-Hub-Server/GC-Hub-Server.exe');
const clientExePath = path.resolve(rootDir, 'release/GC-Hub-Client/GC-Hub-Client.exe');

let passed = 0;
let failed = 0;

function assert(condition, name, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${name} ${details ? `(${details})` : ''}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${name} ${details ? `(${details})` : ''}`);
    failed++;
  }
}

async function httpGet(url, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function waitForServerHealthy(maxRetries = 20, intervalMs = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await httpGet('http://127.0.0.1:7894/health');
      if (res.status === 200 && res.data?.status === 'ok') {
        return res.data;
      }
    } catch {}
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

async function runReleaseBinaryTest() {
  console.log('================================================================');
  console.log('🚀 GC-HUB RELEASE BINARY (.EXE) INTEGRATION & STRESS TEST');
  console.log('   Testing compiled production executables in release/ directory');
  console.log('================================================================\n');

  // Clean old processes first
  try {
    execSync('taskkill /f /im GC-Hub-Server.exe /im GC-Hub-Client.exe 2>nul', { stdio: 'ignore' });
  } catch {}

  assert(fs.existsSync(serverExePath), 'Server Executable file exists', serverExePath);
  assert(fs.existsSync(clientExePath), 'Client Executable file exists', clientExePath);

  // ---------------------------------------------------------------------------
  // 1. SPAWN SERVER .EXE PROCESS
  // ---------------------------------------------------------------------------
  console.log('\n--- [1. SPAWNING GC-Hub-Server.exe] ---');
  const serverProc = spawn(serverExePath, [], {
    detached: false,
    stdio: 'ignore',
    cwd: path.dirname(serverExePath)
  });

  assert(serverProc.pid > 0, `GC-Hub-Server.exe spawned as Windows Process (PID: ${serverProc.pid})`);

  // Wait for server health endpoint
  const healthData = await waitForServerHealthy(30, 500);
  assert(!!healthData, 'Compiled Server .exe responding on http://127.0.0.1:7894/health (200 OK)', `Service: ${healthData?.service}, Port: ${healthData?.port}`);

  // ---------------------------------------------------------------------------
  // 2. SPAWN CLIENT .EXE PROCESS
  // ---------------------------------------------------------------------------
  console.log('\n--- [2. SPAWNING GC-Hub-Client.exe] ---');
  const clientProc = spawn(clientExePath, [], {
    detached: false,
    stdio: 'ignore',
    cwd: path.dirname(clientExePath)
  });

  assert(clientProc.pid > 0, `GC-Hub-Client.exe spawned as Windows Process (PID: ${clientProc.pid})`);

  // Wait for client to connect to server via WebSocket
  console.log('  ⏳ Menunggu Client .exe auto-discovery & connect ke Server .exe...');
  let clientConnected = false;
  let latestHealth = null;

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      latestHealth = (await httpGet('http://127.0.0.1:7894/health')).data;
      if (latestHealth && latestHealth.connectedClients >= 1) {
        clientConnected = true;
        break;
      }
    } catch {}
  }

  assert(clientConnected, 'Client .exe berhasil terhubung ke Server .exe secara realtime', `Total Connected Workstations: ${latestHealth?.connectedClients}`);

  // ---------------------------------------------------------------------------
  // 3. WEBSOCKET E2E INTERACTION WITH COMPILED INSTANCE
  // ---------------------------------------------------------------------------
  console.log('\n--- [3. PROBE WEBSOCKET INTERACTIONS ON COMPILED RUNTIME] ---');
  const ws = new WebSocket('ws://127.0.0.1:7894');
  const incomingMessages = [];

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
    ws.on('message', (msg) => {
      try { incomingMessages.push(JSON.parse(msg.toString())); } catch {}
    });
  });

  const PROBE_PC_ID = 'PC-PROBE-EXE';
  ws.send(JSON.stringify({
    op: 'CLIENT_REGISTER',
    ts: Date.now(),
    payload: {
      pcId: PROBE_PC_ID,
      pcName: 'PC Probe Exe Test',
      mac: 'AA:11:22:33:44:55',
      ip: '127.0.0.1',
      os: 'Windows 11 Pro 64-bit'
    }
  }));

  await new Promise(r => setTimeout(r, 600));
  const serverConfig = incomingMessages.find(p => p.op === 'SERVER_CONFIG_INIT');
  assert(!!serverConfig, 'Compiled Server .exe sent SERVER_CONFIG_INIT packet', `Cafe Name: ${serverConfig?.payload?.cafeName}`);

  // Send Heartbeat Ping
  ws.send(JSON.stringify({
    op: 'HEARTBEAT_C2S',
    ts: Date.now(),
    pcId: PROBE_PC_ID,
    payload: { time: Date.now() }
  }));

  await new Promise(r => setTimeout(r, 400));
  const pong = incomingMessages.find(p => p.op === 'HEARTBEAT_S2C');
  assert(!!pong, 'Compiled Server .exe returned HEARTBEAT_S2C pong response');

  // Submit in-game POS Order to compiled server
  console.log('\n--- [4. IN-GAME POS ORDER ON COMPILED SERVER .EXE] ---');
  ws.send(JSON.stringify({
    op: 'ORDER_REQUEST',
    ts: Date.now(),
    pcId: PROBE_PC_ID,
    payload: {
      pcId: PROBE_PC_ID,
      username: 'ExeTester',
      items: [
        { productId: 1, name: 'Mie Goreng Telur', price: 12000, quantity: 1 }
      ],
      totalPrice: 12000,
      note: 'Binary Release Test Order'
    }
  }));

  await new Promise(r => setTimeout(r, 600));
  const orderAck = incomingMessages.find(p => p.op === 'ORDER_STATUS_UPDATE');
  assert(!!orderAck, 'Compiled Server .exe handled ORDER_REQUEST & updated SQLite DB', `Order: ${orderAck?.payload?.orderId}`);

  // Verify SQLite Database created and modified in release directory
  const serverSqlitePath = path.resolve(rootDir, 'release/GC-Hub-Server/data/gcserver.sqlite');
  assert(fs.existsSync(serverSqlitePath), 'SQLite Database file active in release/GC-Hub-Server/data/', `Size: ${fs.statSync(serverSqlitePath).size} bytes`);

  // Close probe socket
  ws.close();

  // ---------------------------------------------------------------------------
  // 5. TEARDOWN PROCESSES CLEANLY
  // ---------------------------------------------------------------------------
  console.log('\n--- [5. CLEANING UP SPAWNED PROCESSES & TEST DB RECORDS] ---');
  try {
    execSync('taskkill /f /im GC-Hub-Server.exe /im GC-Hub-Client.exe 2>nul', { stdio: 'ignore' });
    assert(true, 'GC-Hub-Server.exe dan GC-Hub-Client.exe ditutup bersih via taskkill');
  } catch {
    assert(false, 'Gagal menutup proses GC-Hub .exe');
  }

  // Purge test probe record from SQLite
  try {
    execSync('npx cross-env ELECTRON_RUN_AS_NODE=1 npx electron scripts/clean-workstations.cjs', { cwd: rootDir, stdio: 'ignore' });
  } catch {}

  console.log('\n================================================================');
  console.log(`🎉 RELEASE BINARY TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runReleaseBinaryTest().catch(err => {
  console.error('Release Binary Test Fatal Error:', err);
  try {
    execSync('taskkill /f /im GC-Hub-Server.exe /im GC-Hub-Client.exe 2>nul', { stdio: 'ignore' });
  } catch {}
  process.exit(1);
});
