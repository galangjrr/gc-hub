import { app } from 'electron';
import { db, sqlite } from '../src/server/db/index';
import * as schema from '../src/server/db/schema';
import { DbService } from '../src/server/db/dbService';
import { BillingEngine } from '../src/server/engine/billingEngine';
import { ServerNetworkBridge } from '../src/server/network/serverNetwork';
import { eq } from 'drizzle-orm';

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

async function runComprehensiveBillingTests() {
  console.log('================================================================');
  console.log('⚡ GC-HUB TASK 2.2 COMPREHENSIVE BILLING ENGINE INTEGRATION TEST');
  console.log('================================================================\n');

  try {
    // 1. Initialize DbService & BillingEngine
    console.log('--- [1. INITIALIZING DBSERVICE & BILLING ENGINE] ---');
    await DbService.init();
    BillingEngine.start();
    assert(true, 'DbService and BillingEngine initialized and tick started');

    // 2. Prepaid / Package Session & 80% Tolerance Rule Test
    console.log('\n--- [2. PREPAID SESSION & 80% TOLERANCE GANTI PAKET] ---');
    const pc1 = 'PC-TEST-01';
    DbService.addWorkstation({ name: pc1, ip: '192.168.1.51', pricePerHour: 4000 });
    
    // Start 60m package @ Rp 4.000
    BillingEngine.startSession(pc1, {
      username: 'guest_pc1',
      billingType: 'package',
      durationMinutes: 60,
      price: 4000,
      packageName: 'Paket 1 Jam'
    });

    const s1 = BillingEngine.getSession(pc1);
    assert(s1 !== undefined && s1.remainingSeconds === 3600, 'Session started with 3600s (60m)');

    // Simulate elapsed 30m (50% usage < 80%)
    BillingEngine.simulateSessionElapsed(pc1, 30);
    const s1_mid = BillingEngine.getSession(pc1);
    assert(s1_mid?.remainingSeconds === 1800, 'Elapsed 30m -> Remaining 1800s (30m)');

    // Upgrade to 2 Jam (120m, Rp 8.000) -> Should succeed
    const upgradeRes = BillingEngine.replacePackage(pc1, 120, 8000, 'Paket 2 Jam');
    assert(upgradeRes.success === true, 'Ganti paket at 30m elapsed approved', `Msg: ${upgradeRes.message}`);
    assert(upgradeRes.remainingMinutes === 90, 'New remaining minutes = 120 - 30 = 90m', `Remaining: ${upgradeRes.remainingMinutes}m`);
    assert(upgradeRes.diff === 4000, 'Price diff = Rp 8.000 - Rp 4.000 = Rp 4.000', `Diff: Rp ${upgradeRes.diff}`);

    // Simulate elapsed 100m
    BillingEngine.simulateSessionElapsed(pc1, 100);
    // Replace with 180m (180m > 100m) -> Should succeed, remaining = 80m
    const allowRemainingRes = BillingEngine.replacePackage(pc1, 180, 12000, 'Paket 3 Jam');
    assert(allowRemainingRes.success === true, 'Ganti paket allowed when remaining time > 0 (180m - 100m = 80m)', `Remaining: ${allowRemainingRes.remainingMinutes}m`);

    // Reject new duration <= elapsed time (60m <= 100m)
    const rejectDurationRes = BillingEngine.replacePackage(pc1, 60, 4000, 'Paket 1 Jam');
    assert(rejectDurationRes.success === false, 'Ganti paket rejected when new duration <= elapsed (60m <= 100m)', rejectDurationRes.message);

    // 3. Stacking Packages & Auto-Activation Test
    console.log('\n--- [3. PACKAGE STACKING & QUEUE ENGINE] ---');
    const pc2 = 'PC-TEST-02';
    DbService.addWorkstation({ name: pc2, ip: '192.168.1.52', pricePerHour: 4000 });
    
    BillingEngine.startSession(pc2, {
      username: 'guest_pc2',
      billingType: 'package',
      durationMinutes: 60,
      price: 4000,
      packageName: 'Paket 1 Jam'
    });

    // Add stacked package (Paket 2 Jam, 120m)
    BillingEngine.addStackedPackage(pc2, 120, 8000, 'Paket 2 Jam (Antrian)');
    const s2 = BillingEngine.getSession(pc2);
    assert(s2?.stackedPackages?.length === 2, 'Stacked package added to session queue');
    assert(s2?.stackedPackages?.[1].status === 'Not Used', 'Queued package is in "Not Used" status');

    // 4. Postpaid (personal) parking-style billing and the unpaid hold
    console.log('\n--- [4. POSTPAID PARKING BILLING & UNPAID HOLD] ---');
    const pc3 = 'PC-TEST-03';
    DbService.addWorkstation({ name: pc3, ip: '192.168.1.53', pricePerHour: 4000 });
    BillingEngine.startSession(pc3, {
      username: 'postpaid_user',
      billingType: 'postpaid',
      pricePerHour: 4000,
      rateConfig: { firstHourPrice: 4000, nextHoursPrice: 3500, accumulationMinutes: 60, name: 'Reguler' }
    });

    const realConnected = ServerNetworkBridge.getConnectedClients;
    const tickAt = (minutes: number) => {
      BillingEngine.simulateSessionElapsed(pc3, minutes);
      (ServerNetworkBridge as any).getConnectedClients = () => [{ pcId: pc3, pcName: pc3 }];
      (BillingEngine as any).tick(false);
      (ServerNetworkBridge as any).getConnectedClients = realConnected;
      return BillingEngine.getSession(pc3)?.totalCost || 0;
    };
    assert(tickAt(10) === 4000, 'Postpaid 10m: first hour billed in full (Rp 4.000)');
    const engineCost = tickAt(61);
    assert(engineCost === 7500, 'Postpaid 61m: second hour started (Rp 7.500)', `Rp ${engineCost}`);

    const liveCard = BillingEngine.getLiveWorkstations().find(w => w.name === pc3);
    assert(liveCard?.billingType === 'postpaid' && liveCard?.personalBill?.total === 7500, 'Card data carries billing type and personal bill');
    assert(liveCard?.personalRate?.name === 'Reguler' && liveCard?.personalBill?.nextTotal === 11000, 'Card data carries rate name and next total');

    const txBeforeStop = DbService.getTransactions(50).filter(t => t.username === 'postpaid_user').length;
    BillingEngine.stopSession(pc3, 'Checkout Kasir Postpaid');
    const txAfterStop = DbService.getTransactions(50).filter(t => t.username === 'postpaid_user').length;
    assert(txAfterStop === txBeforeStop, 'Postpaid stop: no cash booked before the customer pays');
    const unpaidCard = BillingEngine.getLiveWorkstations().find(w => w.name === pc3);
    assert(unpaidCard?.state === 'unpaid' && unpaidCard?.unpaidAmount === 7500, 'Postpaid stop: PC held as unpaid with the bill', `${unpaidCard?.state} Rp ${unpaidCard?.unpaidAmount}`);
    assert(BillingEngine.startSession(pc3, { username: 'next_guest', billingType: 'package', durationMinutes: 60, price: 4000 }) === false, 'Unpaid PC refuses a new session');

    const settle = BillingEngine.settleUnpaid(pc3, 'Kasir Test');
    const postTx = DbService.getTransactions(50).filter(t => t.username === 'postpaid_user');
    assert(settle.success && postTx.length === txBeforeStop + 1 && postTx[0].price === 7500, 'Settlement books exactly one transaction of the bill', settle.message);
    assert(BillingEngine.getLiveWorkstations().find(w => w.name === pc3)?.state !== 'unpaid', 'Settled PC is free again');
    assert(BillingEngine.settleUnpaid(pc3).success === false, 'Settling twice is refused');

    // 5. Member Balance Authoritative Deduction & Session Log Test
    console.log('\n--- [5. MEMBER BALANCE DEDUCTION & SESSIONLOGS] ---');
    const memberName = `test_member_${Date.now()}`;
    const testMember = DbService.createMember({
    password: "test1234",
      username: memberName,
      firstName: 'Pro',
      lastName: 'Gamer',
      money: 20000,
      groupName: 'Reguler'
    });
    assert(testMember.money === 20000, 'Test member created with Rp 20.000 balance');

    const pc4 = 'PC-TEST-04';
    DbService.addWorkstation({ name: pc4, ip: '192.168.1.54', pricePerHour: 4000 });
    
    // Member starts session
    BillingEngine.startSession(pc4, {
      username: testMember.username,
      userType: 'member',
      billingType: 'member',
      durationMinutes: Math.floor((20000 / 4000) * 60), // 300m
      pricePerHour: 4000,
      memberId: testMember.id
    });

    // Simulate 45m usage (Cost = 45/60 * 4000 = Rp 3.000)
    BillingEngine.simulateSessionElapsed(pc4, 45);
    const s4 = BillingEngine.getSession(pc4);
    if (s4) {
      s4.totalCost = 3000;
    }

    // Stop session -> Must deduct Rp 3.000 from member balance in SQLite
    BillingEngine.stopSession(pc4, 'Member Logout');
    
    const updatedMember = DbService.getMembers().find(m => m.id === testMember.id);
    assert(updatedMember?.money === 17000, 'Member balance deducted in SQLite (Rp 20.000 - Rp 3.000 = Rp 17.000)', `Remaining: Rp ${updatedMember?.money}`);

    // Verify SessionLogs table in SQLite
    const sessionLogsRow = db.select().from(schema.sessionLogs).where(eq(schema.sessionLogs.username, testMember.username)).get();
    assert(!!sessionLogsRow, 'SessionLogs row committed into SQLite database', `Session ID: ${sessionLogsRow?.sessionId}`);
    assert(sessionLogsRow?.realMoneyUsed === 3000, 'SessionLogs realMoneyUsed matches spent amount (Rp 3.000)');

    // 6. Guest Token Generator & Redemption Test
    console.log('\n--- [6. GUEST TOKEN GENERATOR & REDEMPTION] ---');
    const guestToken = DbService.generateGuestToken({
      durationMinutes: 60,
      price: 4000,
      note: 'Test Guest Token'
    });
    assert(guestToken.code.startsWith('GT-') && guestToken.code.length === 9, 'Guest token generated with GT-XXXXXX format', `Code: ${guestToken.code}`);

    const redeemTokenRes = DbService.redeemCoupon(guestToken.code, 'Guest_Bilik');
    assert(redeemTokenRes.success === true, 'Guest token redeemed successfully');

    const duplicateTokenRes = DbService.redeemCoupon(guestToken.code, 'Guest_Bilik');
    assert(duplicateTokenRes.success === false, 'Duplicate guest token redemption rejected');

    const batchTokens = DbService.generateGuestTokenBatch(3, 120, 8000);
    assert(batchTokens.length === 3, `Batch guest tokens generated (${batchTokens.length} tokens)`);

    // 7. Crash & Power-Outage Recovery Test
    console.log('\n--- [7. CRASH & POWER-OUTAGE RECOVERY] ---');
    const pc5 = 'PC-TEST-05';
    DbService.addWorkstation({ name: pc5, ip: '192.168.1.55', pricePerHour: 4000 });
    
    BillingEngine.startSession(pc5, {
      username: 'persistent_user',
      billingType: 'package',
      durationMinutes: 90,
      price: 6000,
      packageName: 'Paket 90 Menit'
    });
    BillingEngine.simulateSessionElapsed(pc5, 30); // 60m remaining

    // Stop engine and simulate server crash/restart
    BillingEngine.stop();
    assert(true, 'Billing Engine stopped (Simulating server restart / power outage)');

    // Restart engine -> Should recover active session for PC-TEST-05 from SQLite
    BillingEngine.start();
    const recoveredSession = BillingEngine.getSession(pc5);
    assert(recoveredSession !== undefined, 'Active session for PC-TEST-05 recovered from SQLite');
    assert(recoveredSession?.username === 'persistent_user', 'Recovered session username matches "persistent_user"');
    assert(recoveredSession?.remainingSeconds === 3600, 'Recovered session remaining duration matches 3600s (60m)');

    // 7b. A running session must never be overwritten; operator unlock keeps it and its bill
    console.log('\n--- [7b. RUNNING SESSION PROTECTION & OPERATOR UNLOCK] ---');
    const overwrite = BillingEngine.startSession(pc5, { username: 'Admin', userType: 'admin', billingType: 'postpaid', durationMinutes: 99999 });
    assert(overwrite === false, 'startSession on a PC with a running session is refused');
    assert(BillingEngine.getSession(pc5)?.username === 'persistent_user', 'Running session still belongs to "persistent_user"');

    BillingEngine.pauseSession(pc5);
    assert(BillingEngine.getSession(pc5)?.isPaused === true, 'Cashier lock pauses the session');
    assert(BillingEngine.operatorUnlock(pc5) === true, 'Operator unlock accepted for a running session');
    assert(BillingEngine.getSession(pc5)?.isPaused === false, 'Operator unlock resumes the paused session');
    assert(BillingEngine.getSession(pc5)?.remainingSeconds === 3600, 'Operator unlock keeps the remaining time');
    assert(BillingEngine.operatorUnlock('PC-TIDAK-ADA') === false, 'Operator unlock refused when the PC has no session');

    // 8. Cleanup test workstations and records
    console.log('\n--- [8. CLEANUP TEST DATA] ---');
    BillingEngine.stopSession(pc1);
    BillingEngine.stopSession(pc2);
    BillingEngine.stopSession(pc5);
    DbService.deleteWorkstation(pc1);
    DbService.deleteWorkstation(pc2);
    DbService.deleteWorkstation(pc3);
    DbService.deleteWorkstation(pc4);
    DbService.deleteWorkstation(pc5);
    DbService.deleteMember(testMember.id);
    BillingEngine.stop();
    assert(true, 'Test workstations and member records cleaned up');

  } catch (err: any) {
    console.error('Comprehensive Billing Test Exception:', err.stack || err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`📊 COMPREHENSIVE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  try {
    app.exit(failed > 0 ? 1 : 0);
  } catch {
    process.exit(failed > 0 ? 1 : 0);
  }
}

app.whenReady().then(runComprehensiveBillingTests);
