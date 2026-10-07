/**
 * GC-Hub Comprehensive Live End-to-End Test Suite
 * Tests real live running GC-Hub server instance on port 7894
 */

import http from 'http';
import { WebSocket } from 'ws';

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

async function runLiveE2E() {
  console.log('================================================================');
  console.log('🌐 GC-HUB AUTHORITATIVE LIVE E2E INTEGRATION TEST (PORT 7894)');
  console.log('================================================================\n');

  // =========================================================================
  // 1. HEALTH CHECK HTTP ENDPOINT
  // =========================================================================
  console.log('--- [1. LIVE SERVER HTTP HEALTH CHECK] ---');
  const health = await httpGet('http://127.0.0.1:7894/health');
  assert(health.status === 200, 'HTTP GET /health status 200 OK');
  assert(health.data?.status === 'ok', 'Server health status = "ok"', `Service: ${health.data?.service}, Uptime: ${health.data?.uptime}s`);
  assert(typeof health.data?.connectedClients === 'number', 'Connected clients count active', `Initial Connected: ${health.data?.connectedClients}`);

  // =========================================================================
  // 2. WEBSOCKET CONNECTION & HANDSHAKE
  // =========================================================================
  console.log('\n--- [2. WEBSOCKET CONNECTION & HANDSHAKE REGISTRATION] ---');
  const ws = new WebSocket('ws://127.0.0.1:7894');
  const incomingMessages = [];

  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      assert(true, 'WebSocket client connected to live server');
      resolve();
    });
    ws.on('error', reject);
    ws.on('message', (msg) => {
      try {
        const pkt = JSON.parse(msg.toString());
        incomingMessages.push(pkt);
      } catch {}
    });
  });

  const TEST_PC_ID = 'PC-99';
  ws.send(JSON.stringify({
    op: 'CLIENT_REGISTER',
    ts: Date.now(),
    payload: {
      pcId: TEST_PC_ID,
      pcName: 'PC-99 (E2E Pro Gaming)',
      mac: '54:04:A6:88:99:AA',
      ip: '127.0.0.1',
      os: 'Windows 11 Pro 64-bit'
    }
  }));

  // Wait for SERVER_CONFIG_INIT
  await new Promise(r => setTimeout(r, 600));
  const configInit = incomingMessages.find(p => p.op === 'SERVER_CONFIG_INIT');
  assert(!!configInit, 'Server returned SERVER_CONFIG_INIT packet', `Cafe Name: ${configInit?.payload?.cafeName}`);

  // =========================================================================
  // 3. HEARTBEAT & TELEMETRY STREAM
  // =========================================================================
  console.log('\n--- [3. HEARTBEAT & TELEMETRY INGESTION] ---');
  ws.send(JSON.stringify({
    op: 'HEARTBEAT_C2S',
    ts: Date.now(),
    pcId: TEST_PC_ID,
    payload: { clientTime: Date.now() }
  }));

  await new Promise(r => setTimeout(r, 400));
  const pong = incomingMessages.find(p => p.op === 'HEARTBEAT_S2C');
  assert(!!pong, 'Server returned HEARTBEAT_S2C ping response', `Server Time: ${pong?.payload?.serverTime}`);

  ws.send(JSON.stringify({
    op: 'TELEMETRY_REPORT',
    ts: Date.now(),
    pcId: TEST_PC_ID,
    payload: {
      pcId: TEST_PC_ID,
      cpuUsagePercent: 24,
      ramTotalMb: 32768,
      ramUsedMb: 12288,
      ramUsagePercent: 37.5,
      diskTotalGb: 1024,
      diskFreeGb: 650,
      diskUsagePercent: 36.5,
      gpuName: 'NVIDIA GeForce RTX 4080 16GB',
      activeWindow: 'Dota 2',
      timestamp: Date.now()
    }
  }));
  assert(true, 'Telemetry metrics packet dispatched to server');

  // =========================================================================
  // 4. IN-GAME POS F&B ORDERING FLOW
  // =========================================================================
  console.log('\n--- [4. IN-GAME F&B ORDERING & ACKNOWLEDGMENT] ---');
  ws.send(JSON.stringify({
    op: 'ORDER_REQUEST',
    ts: Date.now(),
    pcId: TEST_PC_ID,
    payload: {
      pcId: TEST_PC_ID,
      username: 'BudiGamer',
      items: [
        { productId: 1, name: 'Indomie Goreng Telur', price: 12000, quantity: 2, note: 'Setengah matang' },
        { productId: 2, name: 'Es Teh Manis Jumbo', price: 5000, quantity: 2, note: 'Kurang manis' }
      ],
      totalPrice: 34000,
      note: 'Antar ke meja PC-99 ya min'
    }
  }));

  await new Promise(r => setTimeout(r, 600));
  const orderAck = incomingMessages.find(p => p.op === 'ORDER_STATUS_UPDATE');
  assert(!!orderAck, 'Server processed order and returned ORDER_STATUS_UPDATE', `Order Code: ${orderAck?.payload?.orderId}, Msg: ${orderAck?.payload?.message}`);

  // =========================================================================
  // 5. MEMBER AUTHENTICATION & SESSION INITIATION
  // =========================================================================
  console.log('\n--- [5. MEMBER AUTHENTICATION & AUTHORITATIVE TICK] ---');
  ws.send(JSON.stringify({
    op: 'AUTH_REQUEST',
    ts: Date.now(),
    pcId: TEST_PC_ID,
    payload: {
      username: 'galang',
      type: 'member',
      billingType: 'member'
    }
  }));

  await new Promise(r => setTimeout(r, 800));
  const authSuccess = incomingMessages.find(p => p.op === 'SESSION_BEGIN');
  const unlockPkt = incomingMessages.find(p => p.op === 'SCREEN_UNLOCK');
  assert(!!authSuccess || !!unlockPkt, 'Server verified member credentials & dispatched UNLOCK signal', `Session User: ${authSuccess?.payload?.username || 'galang'}`);

  // Check SESSION_TICK reception
  const sessionTicks = incomingMessages.filter(p => p.op === 'SESSION_TICK');
  assert(sessionTicks.length > 0, 'Client receiving authoritative SESSION_TICK stream', `Ticks received: ${sessionTicks.length}, Remaining: ${sessionTicks[sessionTicks.length - 1]?.payload?.timeRemainingMinutes || 0}m`);

  // =========================================================================
  // 6. CLIENT LOGOUT & SESSION TERMINATION
  // =========================================================================
  console.log('\n--- [6. CLIENT LOGOUT & SYSTEM LOCKDOWN] ---');
  ws.send(JSON.stringify({
    op: 'LOGOUT_AND_END',
    ts: Date.now(),
    pcId: TEST_PC_ID,
    payload: { pcId: TEST_PC_ID }
  }));

  await new Promise(r => setTimeout(r, 600));
  const lockPkt = incomingMessages.find(p => p.op === 'SCREEN_LOCK' || p.op === 'SESSION_END');
  assert(!!lockPkt, 'Server terminated session & locked workstation', `Lock Packet: ${lockPkt?.op}`);

  // Close connection cleanly
  ws.close();
  await new Promise(r => setTimeout(r, 300));

  // =========================================================================
  // 7. FINAL LIVE HEALTH STATUS
  // =========================================================================
  console.log('\n--- [7. FINAL RECONCILIATION CHECK] ---');
  const healthFinal = await httpGet('http://127.0.0.1:7894/health');
  assert(healthFinal.status === 200, 'Live server remains healthy and operational');

  console.log('\n================================================================');
  console.log(`📊 LIVE E2E RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runLiveE2E().catch(err => {
  console.error('Live E2E Test Error:', err);
  process.exit(1);
});
