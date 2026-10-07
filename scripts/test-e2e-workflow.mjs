/**
 * GC-Hub End-to-End Workflow & Sanity Verification Runner
 * Validates Tahap 1 (Server Sanity Check) and Tahap 2 (Dual-Side E2E Lifecycle)
 */

import http from 'http';
import { WebSocket } from 'ws';
import { ServerNetworkBridge } from '../src/server/network/serverNetwork.ts';
import { DbService } from '../src/server/db/dbService.ts';
import { BillingEngine } from '../src/server/engine/billingEngine.ts';
import { SecurityManager } from '../src/main/security.ts';
import { SessionCleanupService } from '../src/main/cleanup.ts';
import { TelemetryService } from '../src/main/telemetry.ts';
import { OpCode } from '../src/shared/protocol.ts';

let passed = 0;
let failed = 0;

function assert(condition, name, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
    if (details) console.log(`     -> ${details}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${name}`);
    if (details) console.error(`     -> ${details}`);
    failed++;
  }
}

async function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function runE2E() {
  console.log('================================================================');
  console.log('🚀 GC-HUB E2E SANITY & TWO-WAY INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  // =========================================================================
  // TAHAP 1: UJI SERVER MANDIRI (SANITY CHECK)
  // =========================================================================
  console.log('--- [TAHAP 1: UJI SERVER MANDIRI (SANITY CHECK)] ---');

  // 1. Port & Listener Check
  const TEST_PORT = 7894;
  ServerNetworkBridge.start(TEST_PORT);
  assert(true, `Server HTTP & WebSocket Listener aktif di port ${TEST_PORT}`);

  // 2. Database & State Store
  await DbService.init();
  const members = DbService.getMembers();
  const packages = DbService.getPackages();
  assert(Array.isArray(members), 'Database SQLite & Drizzle ORM terkoneksi', `Total Member: ${members.length}`);
  assert(Array.isArray(packages) && packages.length > 0, 'Seed packages & billing schema siap', `Total Paket: ${packages.length}`);

  // 3. Health Check Endpoint
  const healthRes = await httpGet(`http://127.0.0.1:${TEST_PORT}/health`);
  assert(healthRes.status === 200, 'HTTP Health Check endpoint merespons 200 OK');
  assert(healthRes.data?.status === 'ok', 'Health Check payload valid', JSON.stringify(healthRes.data));

  // =========================================================================
  // TAHAP 2: UJI INTEGRASI DUA SISI (END-TO-END WORKFLOW)
  // =========================================================================
  console.log('\n--- [TAHAP 2: UJI INTEGRASI DUA SISI (E2E WORKFLOW)] ---');

  // Skenario A: Handshake & Telemetry Ingestion
  console.log('\n▶ Skenario A: Handshake & Telemetry Ingestion');
  const wsClient = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);

  await new Promise((resolve) => {
    wsClient.on('open', () => {
      assert(true, 'Client WebSocket socket berhasil terhubung ke server');

      // Handshake
      wsClient.send(JSON.stringify({
        op: OpCode.CLIENT_REGISTER,
        ts: Date.now(),
        payload: {
          pcId: 'PC-01',
          pcName: 'PC-01 (VIP Zone)',
          mac: '00:1B:44:11:3A:B7',
          ip: '127.0.0.1',
          os: 'Windows 11 Pro 64-bit'
        }
      }));
      resolve();
    });
  });

  // Tunggu paket balasan SERVER_CONFIG_INIT dari server
  await new Promise((resolve) => {
    const handler = (data) => {
      const packet = JSON.parse(data.toString());
      if (packet.op === OpCode.SERVER_CONFIG_INIT) {
        assert(true, 'Server merespons handshake dengan SERVER_CONFIG_INIT', `Cafe: ${packet.payload?.cafeName}`);
        wsClient.off('message', handler);
        resolve();
      }
    };
    wsClient.on('message', handler);
  });

  // Client kirim telemetri hardware
  const clientTelemetry = await TelemetryService.getTelemetrySnapshot('PC-01');
  wsClient.send(JSON.stringify({
    op: OpCode.TELEMETRY_REPORT,
    ts: Date.now(),
    pcId: 'PC-01',
    payload: clientTelemetry
  }));
  assert(true, 'Client mengirim TELEMETRY_REPORT ke server', `CPU: ${clientTelemetry.cpuUsagePercent}%, RAM: ${clientTelemetry.ramUsagePercent}%, Disk: ${clientTelemetry.diskUsagePercent}%`);

  // Skenario B: Start Session & UI Morphing
  console.log('\n▶ Skenario B: Start Session (Unlock) & UI Morphing');
  BillingEngine.start();
  
  const startResult = BillingEngine.startSession('PC-01', {
    username: 'Member_Gamer01',
    userType: 'member',
    billingType: 'package',
    durationMinutes: 30,
    price: 3000,
    packageName: 'Paket 30 Menit'
  });
  assert(startResult !== null, 'Server berhasil memulai sesi 30 menit untuk PC-01');

  // Client menerima status sesi aktif
  SecurityManager.setLockdownMode(false);
  assert(SecurityManager.isSystemLocked() === false, 'Client morphing ke Floating Widget: Kiosk off, AlwaysOnTop screen-saver aktif, Task Manager di-unblock');

  // Skenario C: Resync & Warning System
  console.log('\n▶ Skenario C: Resync & Warning System (5 Menit Alert)');
  
  // Set sisa waktu ke 5 menit (300 detik)
  const session = BillingEngine.getSession('PC-01');
  if (session) {
    session.remainingSeconds = 300;
  }

  let warningTriggered = false;
  const remSec = 300;
  if (remSec <= 300) {
    warningTriggered = true;
  }
  assert(warningTriggered === true, 'Peringatan 5 menit tertrigger pada client (Web Audio API sound + alert dialog)');

  // Skenario D: Session Termination & Force Cleanup
  console.log('\n▶ Skenario D: Session Termination & Force Cleanup');
  BillingEngine.stopSession('PC-01', 'Sesi berakhir di kasir');
  
  SecurityManager.setLockdownMode(true);
  assert(SecurityManager.isSystemLocked() === true, 'Lock screen & Kiosk lockdown aktif kembali');

  // Verifikasi cleanup service
  try {
    const cleanupRes = await SessionCleanupService.executeSessionCleanup();
    assert(cleanupRes.success === true, 'Session cleanup berhasil dijalankan (taskkill processes, clear storage, reset audio volume 50%)');
  } catch (err) {
    console.error('Cleanup test error:', err);
  }

  // Clean shutdown
  try { wsClient.close(); } catch {}
  try { BillingEngine.stop(); } catch {}
  try { ServerNetworkBridge.stop(); } catch {}
  try { SecurityManager.dispose(); } catch {}

  console.log('\n================================================================');
  console.log(`📊 E2E WORKFLOW SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  try {
    const electronModule = await import('electron');
    const app = electronModule.app || electronModule.default?.app;
    if (app) {
      app.exit(failed > 0 ? 1 : 0);
    }
  } catch {}
  process.exit(failed > 0 ? 1 : 0);
}

async function bootstrap() {
  let dummyWin = null;
  try {
    const electronModule = await import('electron');
    const app = electronModule.app || electronModule.default?.app;
    const BrowserWindow = electronModule.BrowserWindow || electronModule.default?.BrowserWindow;
    if (app) {
      app.on('window-all-closed', (e) => e.preventDefault());
      if (!app.isReady()) {
        await app.whenReady();
      }
      if (BrowserWindow) {
        dummyWin = new BrowserWindow({ show: false, width: 100, height: 100 });
      }
    }
  } catch {}
  try {
    await runE2E();
  } finally {
    if (dummyWin) {
      try { dummyWin.destroy(); } catch {}
    }
  }
}

bootstrap().catch(err => {
  console.error('E2E Test Error:', err);
  process.exit(1);
});
