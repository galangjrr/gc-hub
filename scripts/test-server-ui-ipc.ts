import { app } from 'electron';
import { db } from '../src/server/db/index';
import * as schema from '../src/server/db/schema';
import { DbService } from '../src/server/db/dbService';
import { BillingEngine } from '../src/server/engine/billingEngine';
import { Workstation } from '../src/shared/types';
import { EXE_SETTINGS_KEY } from '../src/shared/exePolicy';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, details: string = '') {
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

async function runServerUiIpcIntegrationTests() {
  console.log('================================================================');
  console.log('⚡ GC-HUB TASK 2.3 SERVER UI IPC INTEGRATION & STATE MACHINE TEST');
  console.log('================================================================\n');

  try {
    // 1. Init Database & Engine
    console.log('--- [1. INITIALIZING DBSERVICE & BILLING ENGINE] ---');
    await DbService.init();
    BillingEngine.start();
    assert(true, 'DbService and BillingEngine initialized');

    // 2. Realtime Workstation Grid State Machine Transitions
    console.log('\n--- [2. REALTIME WORKSTATION GRID STATE MACHINE TRANSITIONS] ---');
    const pcTest = 'PC-IPC-01';
    
    // Add workstation -> Initial State: offline (no WS client connected) or idle
    DbService.addWorkstation({ name: pcTest, ip: '192.168.1.101', pricePerHour: 4000 });
    let grid = BillingEngine.getLiveWorkstations();
    let pcObj = grid.find(w => w.name === pcTest);
    assert(pcObj !== undefined && pcObj.state === 'offline', 'State 0 (Disconnected): PC-IPC-01 initial state is offline when disconnected');

    // Start session on PC-IPC-01 -> State: active_guest (ONLINE)
    let listenerCalled = false;
    let updatedWorkstationsList: Workstation[] = [];
    const unsub = BillingEngine.onStateChange((list) => {
      listenerCalled = true;
      updatedWorkstationsList = list;
    });

    BillingEngine.startSession(pcTest, {
      username: 'guest_ipc',
      billingType: 'package',
      durationMinutes: 60,
      price: 4000,
      packageName: 'Paket 1 Jam'
    });

    grid = BillingEngine.getLiveWorkstations();
    pcObj = grid.find(w => w.name === pcTest);
    assert(pcObj?.state === 'active_guest', 'State 1 (ONLINE): Workstation state updated to active_guest');
    assert(pcObj?.packageName === 'Paket 1 Jam', 'Active session has package name');
    assert(pcObj?.timeRemainingMinutes === 60, 'Active session timeRemainingMinutes = 60m');
    assert(listenerCalled === true, 'Engine state change listener triggered on session start');

    // Pause session -> State: locked (SUSPENDED / AFK)
    listenerCalled = false;
    BillingEngine.pauseSession(pcTest);
    grid = BillingEngine.getLiveWorkstations();
    pcObj = grid.find(w => w.name === pcTest);
    assert(pcObj?.state === 'locked', 'State 2 (SUSPENDED): Workstation state updated to locked when paused (AFK PIN)');

    // Resume session -> State: active_guest (ONLINE)
    BillingEngine.resumeSession(pcTest);
    grid = BillingEngine.getLiveWorkstations();
    pcObj = grid.find(w => w.name === pcTest);
    assert(pcObj?.state === 'active_guest', 'State 1 (ONLINE): Workstation resumed back to active_guest');

    // Stop session -> State: offline / idle (AVAILABLE)
    BillingEngine.stopSession(pcTest, 'Selesai Testing');
    grid = BillingEngine.getLiveWorkstations();
    pcObj = grid.find(w => w.name === pcTest);
    assert(pcObj?.state === 'offline' || pcObj?.state === 'idle', 'State 0 (AVAILABLE): Workstation returned to standby');

    // 3. Member Session & Live Balance Mutation
    console.log('\n--- [3. MEMBER ONLINE SESSION & BALANCE SYNC] ---');
    const memberName = `ipc_member_${Date.now()}`;
    const newMember = DbService.createMember({
    password: "test1234",
      username: memberName,
      firstName: 'Budi',
      lastName: 'Santoso',
      money: 15000,
      groupName: 'VIP'
    });

    BillingEngine.startSession(pcTest, {
      username: newMember.username,
      userType: 'member',
      billingType: 'member',
      durationMinutes: 180,
      pricePerHour: 4000,
      memberId: newMember.id
    });

    grid = BillingEngine.getLiveWorkstations();
    pcObj = grid.find(w => w.name === pcTest);
    assert(pcObj?.state === 'active_member', 'State 1 (ONLINE Member): Workstation state shows active_member');
    assert(pcObj?.username === memberName, 'Workstation displays member username');

    BillingEngine.stopSession(pcTest, 'Member Logout');

    // 4. Multi-PC Session Transfer Test
    console.log('\n--- [4. SESSION TRANSFER PC-TO-PC] ---');
    const pcSource = 'PC-IPC-SRC';
    const pcDest = 'PC-IPC-DST';
    DbService.addWorkstation({ name: pcSource, ip: '192.168.1.102', pricePerHour: 4000 });
    DbService.addWorkstation({ name: pcDest, ip: '192.168.1.103', pricePerHour: 4000 });

    BillingEngine.startSession(pcSource, {
      username: 'transfer_user',
      billingType: 'package',
      durationMinutes: 120,
      price: 8000,
      packageName: 'Paket 2 Jam'
    });

    const transferRes = BillingEngine.transferSession(pcSource, pcDest);
    assert(transferRes === true, 'Session transfer function returned true');

    const srcGrid = BillingEngine.getLiveWorkstations().find(w => w.name === pcSource);
    const dstGrid = BillingEngine.getLiveWorkstations().find(w => w.name === pcDest);
    assert(srcGrid?.state === 'offline' || srcGrid?.state === 'idle', 'Source PC reset to idle/offline');
    assert(dstGrid?.state === 'active_guest' && dstGrid.username === 'transfer_user', 'Destination PC received active session seamlessly');

    BillingEngine.stopSession(pcDest);

    // 5. Realtime Transaction Event Push
    console.log('\n--- [5. TRANSACTION EVENT PUSH TO UI] ---');
    let txEventFired = false;
    let receivedTx: any = null;
    const unsubTx = DbService.onTransactionAdded((tx) => {
      txEventFired = true;
      receivedTx = tx;
    });

    DbService.addTransaction({
      username: 'test_kasir',
      date: new Date().toLocaleDateString('id-ID'),
      time: new Date().toTimeString().split(' ')[0],
      price: 15000,
      timeUsed: '3j 0m',
      staff: 'Admin',
      note: 'Pembelian Paket 3 Jam Kasir'
    });

    assert(txEventFired === true, 'DbService.onTransactionAdded fired event to UI listeners');
    assert(receivedTx?.price === 15000, 'Received transaction matches inserted data');

    // 5b. gc-agent state and per-PC exe allowlist reach the PC card data
    console.log('\n--- [5b. KIOSK AND EXE ALLOWLIST ON THE PC CARD] ---');
    DbService.setSetting(EXE_SETTINGS_KEY, JSON.stringify({ defaultMode: 'off', allowPaths: [], overrides: { [pcTest.toUpperCase()]: 'audit' } }));
    BillingEngine.setAgentState(pcTest, { kioskEnabled: false, exeMode: 'audit' });
    const agentPc = BillingEngine.getLiveWorkstations().find(w => w.name === pcTest);
    assert(agentPc?.exeOverride === 'audit', 'Per-PC exe mode from the server setting shows on the workstation');
    assert(agentPc?.kioskEnabled === false && agentPc?.exeMode === 'audit', 'Kiosk switch and exe mode reported by the booth show on the workstation');
    const otherPc = BillingEngine.getLiveWorkstations().find(w => w.name === pcSource);
    assert(otherPc?.exeOverride === undefined, 'PCs without an override follow the default');
    DbService.setSetting(EXE_SETTINGS_KEY, '');

    // 6. Cleanup Test Data
    console.log('\n--- [6. CLEANUP TEST DATA] ---');
    unsub();
    unsubTx();
    BillingEngine.deleteWorkstation(pcTest);
    BillingEngine.deleteWorkstation(pcSource);
    BillingEngine.deleteWorkstation(pcDest);
    DbService.deleteMember(newMember.id);
    BillingEngine.stop();
    assert(true, 'Test workstations and member records cleaned up');

  } catch (err: any) {
    console.error('Server UI IPC Test Exception:', err.stack || err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`📊 SERVER UI IPC TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  try {
    app.exit(failed > 0 ? 1 : 0);
  } catch {
    process.exit(failed > 0 ? 1 : 0);
  }
}

app.whenReady().then(runServerUiIpcIntegrationTests);
