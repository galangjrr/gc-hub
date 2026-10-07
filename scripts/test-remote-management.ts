/**
 * GC-Hub Task 4.2 Comprehensive Test Suite
 * Validates Remote Workstation Control Protocol:
 * 1. Remote Screen Capture & Screenshot Stream
 * 2. Remote Power Actions: Lock, Unlock, Reboot, Shutdown, Wake-on-LAN (WOL)
 * 3. Remote Volume Adjustment & Admin Broadcast Messaging
 * 4. Remote Process Inspector & Task Manager Dispatch
 */

import WebSocket from 'ws';
(global as any).WebSocket = WebSocket;
(global as any).window = {
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { hostname: '127.0.0.1' }
};

import { SystemService } from '../src/main/systemService';
import { ServerNetworkBridge } from '../src/server/network/serverNetwork';
import { ClientNetworkService } from '../src/client/network/clientNetwork';
import { OpCode, Packet, RemoteCommandPayload, ScreenCaptureResponsePayload } from '../src/shared/protocol';
import { DbService } from '../src/server/db/dbService';
import { BillingEngine } from '../src/server/engine/billingEngine';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${msg}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    failCount++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🖥️  GC-HUB TASK 4.2: REMOTE WORKSTATION CONTROL PROTOCOL SUITE');
  console.log('================================================================\n');

  // --- SECTION 1: NATIVE SYSTEM SERVICE & POWER UTILITIES ---
  console.log('--- [1. NATIVE SYSTEM SERVICE & POWER UTILITIES] ---');
  
  // 1.1 WOL Validation
  const wolValid = await SystemService.sendWakeOnLan('00:1A:2B:3C:4D:5E');
  assert(wolValid.success === true, 'WOL: Valid MAC address generates and broadcasts magic packet');

  const wolInvalid = await SystemService.sendWakeOnLan('INVALID-MAC');
  assert(wolInvalid.success === false, 'WOL: Invalid MAC address rejected cleanly');

  // 1.2 Desktop Screen Capture
  const screenCapture = await SystemService.captureDesktopScreen(1280, 720);
  assert(screenCapture !== null && screenCapture.startsWith('data:image/'), 'Screen Capture: Generates valid data URL image');

  // 1.3 System Volume Control
  const volResult = await SystemService.setSystemVolume(75, false);
  assert(volResult.success === true, 'Volume Control: Adjusts system audio level');

  const muteResult = await SystemService.setSystemVolume(0, true);
  assert(muteResult.success === true, 'Volume Control: Mutes system audio');

  // 1.4 Native Power Commands (Dry-run signature validation)
  assert(typeof SystemService.executeRestart === 'function', 'Power: executeRestart function exists and callable');
  assert(typeof SystemService.executeShutdown === 'function', 'Power: executeShutdown function exists and callable');


  // --- SECTION 2: WEBSOCKET REALTIME REMOTE PROTOCOL DISPATCH ---
  console.log('\n--- [2. WEBSOCKET REALTIME REMOTE PROTOCOL DISPATCH] ---');
  
  const testPort = 7899;
  ServerNetworkBridge.start(testPort);
  DbService.init();
  BillingEngine.start();

  const testPcId = 'PC-REMOTE-01';
  ClientNetworkService.setWorkstationConfig(testPcId, testPcId);
  ClientNetworkService.setServerUrl(`ws://127.0.0.1:${testPort}`);
  ClientNetworkService.connect();

  // Wait for WS connection
  await new Promise((r) => setTimeout(r, 600));

  assert(ClientNetworkService.getIsConnected() === true, 'Client WS connected to server network bridge');

  // 2.1 Remote Screen Capture Handshake
  let screenshotReceived = false;
  let receivedScreenshotPayload: any = null;

  ServerNetworkBridge.on(OpCode.REMOTE_COMMAND, (client, packet) => {
    if (packet.payload?.action === 'screen_capture_response') {
      screenshotReceived = true;
      receivedScreenshotPayload = packet.payload.params;
    }
  });

  // Server requests screen capture
  ServerNetworkBridge.sendToClient(testPcId, OpCode.REMOTE_COMMAND, {
    action: 'capture_screen',
    params: { requestId: 'REQ-101' }
  });

  // Client responds with screenshot
  const clientScreen = await SystemService.captureDesktopScreen();
  ClientNetworkService.send(OpCode.REMOTE_COMMAND, {
    action: 'screen_capture_response',
    params: {
      pcId: testPcId,
      imageBase64: clientScreen,
      timestamp: Date.now(),
      requestId: 'REQ-101'
    }
  });

  await new Promise((r) => setTimeout(r, 300));
  assert(screenshotReceived === true, 'Screen Capture: Server received screenshot response from client');
  assert(receivedScreenshotPayload?.pcId === testPcId, 'Screen Capture: Response matches workstation ID');
  assert(typeof receivedScreenshotPayload?.imageBase64 === 'string', 'Screen Capture: Contains base64 image data');


  // --- SECTION 3: REMOTE VOLUME & BROADCAST MESSAGING ---
  console.log('\n--- [3. REMOTE VOLUME & BROADCAST MESSAGING] ---');

  let clientReceivedVolume = false;
  let clientVolumePayload: any = null;
  let clientReceivedBroadcast = false;
  let clientBroadcastPayload: any = null;

  ClientNetworkService.on(OpCode.REMOTE_COMMAND, (packet: Packet<RemoteCommandPayload>) => {
    if (packet.payload?.action === 'set_volume') {
      clientReceivedVolume = true;
      clientVolumePayload = packet.payload.params;
    } else if (packet.payload?.action === 'broadcast_message') {
      clientReceivedBroadcast = true;
      clientBroadcastPayload = packet.payload.params;
    }
  });

  // Server sends volume adjustment
  ServerNetworkBridge.sendToClient(testPcId, OpCode.REMOTE_COMMAND, {
    action: 'set_volume',
    params: { volume: 60, isMuted: false }
  });

  // Server broadcasts message to all connected clients
  ServerNetworkBridge.broadcast(OpCode.REMOTE_COMMAND, {
    action: 'broadcast_message',
    params: {
      message: 'Perhatian: Billing akan ditutup dalam 10 menit.',
      title: 'Pengumuman Operator',
      sender: 'Admin',
      priority: 'warning',
      timestamp: Date.now()
    }
  });

  await new Promise((r) => setTimeout(r, 300));

  assert(clientReceivedVolume === true, 'Volume: Client received set_volume command');
  assert(clientVolumePayload?.volume === 60, 'Volume: Volume value is 60%');
  assert(clientReceivedBroadcast === true, 'Broadcast: Client received broadcast_message announcement');
  assert(clientBroadcastPayload?.priority === 'warning', 'Broadcast: Announcement priority is warning');


  // --- SECTION 4: REMOTE WORKSTATION LOCK / UNLOCK & PROCESS CONTROL ---
  console.log('\n--- [4. REMOTE WORKSTATION LOCK / UNLOCK & PROCESS CONTROL] ---');

  let lockReceived = false;
  let unlockReceived = false;
  let processReqReceived = false;

  ClientNetworkService.on(OpCode.SCREEN_LOCK, () => {
    lockReceived = true;
  });

  ClientNetworkService.on(OpCode.SCREEN_UNLOCK, () => {
    unlockReceived = true;
  });

  ClientNetworkService.on(OpCode.FETCH_PROCESS_LIST_REQ, () => {
    processReqReceived = true;
  });

  // Test Lock Override
  ServerNetworkBridge.sendToClient(testPcId, OpCode.SCREEN_LOCK, {});
  await new Promise((r) => setTimeout(r, 150));
  assert(lockReceived === true, 'Remote Lock: Client received SCREEN_LOCK packet');

  // Test Unlock Override
  ServerNetworkBridge.sendToClient(testPcId, OpCode.SCREEN_UNLOCK, {});
  await new Promise((r) => setTimeout(r, 150));
  assert(unlockReceived === true, 'Remote Unlock: Client received SCREEN_UNLOCK packet');

  // Test Process List Request
  ServerNetworkBridge.sendToClient(testPcId, OpCode.FETCH_PROCESS_LIST_REQ, { includeSystem: true });
  await new Promise((r) => setTimeout(r, 150));
  assert(processReqReceived === true, 'Remote Process: Client received FETCH_PROCESS_LIST_REQ packet');


  // --- CLEANUP ---
  ClientNetworkService.disconnect();
  ServerNetworkBridge.stop();
  BillingEngine.stop();

  console.log('\n================================================================');
  console.log(`📊 REMOTE MANAGEMENT TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
