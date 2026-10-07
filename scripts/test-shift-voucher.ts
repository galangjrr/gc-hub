import { app } from 'electron';
import { db } from '../src/server/db/index';
import * as schema from '../src/server/db/schema';
import { DbService } from '../src/server/db/dbService';
import { BillingEngine } from '../src/server/engine/billingEngine';
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

async function runShiftAndVoucherIntegrationTests() {
  console.log('================================================================');
  console.log('🎟️ GC-HUB PHASE 4.3 PRE-PAID VOUCHER & SHIFT HANDOVER TEST');
  console.log('================================================================\n');

  try {
    // 1. Init Database & Engine
    console.log('--- [1. INITIALIZING DATABASE & SEEDING] ---');
    await DbService.init();
    BillingEngine.start();
    assert(true, 'DbService and BillingEngine initialized');

    // Ensure test operators Kasir 1 and Kasir 2 exist
    const k1 = db.select().from(schema.employees).where(eq(schema.employees.name, 'Kasir 1')).get();
    if (!k1) DbService.createEmployee({ name: 'Kasir 1', password: '123', role: 0 });
    const k2 = db.select().from(schema.employees).where(eq(schema.employees.name, 'Kasir 2')).get();
    if (!k2) DbService.createEmployee({ name: 'Kasir 2', password: '123', role: 0 });

    // Ensure active open shift exists
    const openShift = db.select().from(schema.shifts).where(eq(schema.shifts.status, 1)).get();
    if (!openShift) {
      const activeStaff = db.select().from(schema.employees).all()[0];
      db.insert(schema.shifts).values({
        emplId: activeStaff.id,
        shiftTime: 1,
        startDT: Date.now(),
        startCash: 100000,
        totalCashIn: 0,
        totalCashOut: 0,
        endCash: 0,
        status: 1
      }).run();
    }

    // 2. Initial Seeding Verification (Employees, Shift, Coupons)
    console.log('\n--- [2. VERIFY INITIAL SEEDING] ---');
    const initialEmployees = DbService.getEmployees();
    assert(initialEmployees.length >= 2, `Default staff seeded (${initialEmployees.length} employees found: ${initialEmployees.map(e => e.name).join(', ')})`);

    const initialCoupons = DbService.getCoupons();
    assert(initialCoupons.length >= 3, `Default starter coupons seeded (${initialCoupons.length} vouchers found)`);

    // Admin-only cafe: with no enabled non-admin staff the shift system stays off and never blocks.
    const staffRows = db.select().from(schema.employees).all().filter(e => e.role !== 2 && e.enabled === 1);
    for (const e of staffRows) db.update(schema.employees).set({ enabled: 0 }).where(eq(schema.employees.id, e.id)).run();
    const adminOnlyStatus = DbService.getShiftStatus();
    assert(!adminOnlyStatus.hasStaff && !adminOnlyStatus.enabled, 'Admin-only cafe: shift system off, no staff');
    assert(DbService.setShiftEnabled(true).success === false, 'Admin-only cafe: shift cannot be enabled without staff');
    assert(DbService.getActiveShiftSummary() === null, 'Admin-only cafe: no shift is auto-created');
    assert(DbService.closeShiftHandover({ shiftId: 0, incomingOperator: 'Admin', incomingPassword: '', actualEndCash: 0 }).success === false, 'Admin-only cafe: handover refused instead of crashing');
    for (const e of staffRows) db.update(schema.employees).set({ enabled: 1 }).where(eq(schema.employees.id, e.id)).run();

    assert(DbService.setShiftEnabled(true).success === true, 'Shift system enabled once staff exist');
    const initialShiftSummary = DbService.getActiveShiftSummary();
    assert(initialShiftSummary !== null, 'Active shift found in SQLite', `Shift ID: ${initialShiftSummary.currentShift.id}, Start Cash: Rp ${initialShiftSummary.currentShift.startCash.toLocaleString('id-ID')}`);

    // 3. Batch Voucher Generation with Custom Prefix & Auto-Inc Serial
    console.log('\n--- [3. BATCH VOUCHER GENERATION & SERIAL INTEGRITY] ---');
    const batch1 = DbService.generateCouponsBatch({
      count: 5,
      prefix: 'VIP',
      type: 'time',
      durationMinutes: 180,
      value: 12000,
      userGroupId: 2,
      expireDays: 30
    });

    assert(batch1.length === 5, `Generated 5 VIP time vouchers (first: ${batch1[0].code})`);
    assert(batch1[0].code.startsWith('VIP-'), `Prefix VIP correctly applied: ${batch1[0].code}`);
    assert(batch1[0].durationMinutes === 180, `Duration correctly assigned: ${batch1[0].durationMinutes} minutes`);
    assert(batch1[0].userGroupId === 2, 'User group tier VIP (ID 2) correctly set');

    // Second batch with same prefix should increment auto-inc serial
    const batch2 = DbService.generateCouponsBatch({
      count: 3,
      prefix: 'VIP',
      type: 'money',
      durationMinutes: 0,
      value: 20000,
      userGroupId: 2,
      expireDays: 60
    });

    assert(batch2.length === 3, `Generated 3 more VIP money vouchers (first: ${batch2[0].code})`);
    const serial1 = parseInt(batch1[0].code.split('-')[1], 10);
    const serial2 = parseInt(batch2[0].code.split('-')[1], 10);
    assert(serial2 > serial1, `Serial auto-increment integrity verified: ${serial1} -> ${serial2}`);

    // Batch with different prefix
    const nightBatch = DbService.generateCouponsBatch({
      count: 2,
      prefix: 'NGT',
      type: 'time',
      durationMinutes: 360,
      value: 25000,
      userGroupId: 1,
      expireDays: 7
    });
    assert(nightBatch.length === 2 && nightBatch[0].code.startsWith('NGT-'), `Prefix NGT batch created: ${nightBatch[0].code}`);

    // 4. Voucher Redemption Engine
    console.log('\n--- [4. VOUCHER REDEMPTION ENGINE] ---');
    const testVoucher = batch1[0];
    
    // Redeem valid voucher
    const redeemResult1 = DbService.redeemCoupon(testVoucher.code, 'MemberTest');
    assert(redeemResult1.success === true, `Valid voucher [${testVoucher.code}] successfully redeemed`, `Granted: ${redeemResult1.durationMinutes}m duration, Rp ${redeemResult1.value} value`);

    // Redeem same voucher again (must be rejected)
    const redeemResult2 = DbService.redeemCoupon(testVoucher.code, 'MemberTest2');
    assert(redeemResult2.success === false, `Double redemption correctly rejected: "${redeemResult2.message}"`);

    // Redeem nonexistent voucher (must be rejected)
    const redeemResult3 = DbService.redeemCoupon('INVALID-CODE-9999', 'MemberTest');
    assert(redeemResult3.success === false, `Nonexistent voucher rejected: "${redeemResult3.message}"`);

    // Verify voucher status in list
    const updatedCoupons = DbService.getCoupons();
    const redeemedInDb = updatedCoupons.find(c => c.code === testVoucher.code);
    assert(redeemedInDb?.status === 'Terpakai' && redeemedInDb?.usedBy === 'MemberTest', `Database state updated: status = Terpakai, usedBy = ${redeemedInDb?.usedBy}`);

    // 5. Voucher Deletion
    console.log('\n--- [5. VOUCHER DELETION] ---');
    const voucherToDelete = batch1[1];
    DbService.deleteCoupon(voucherToDelete.id);
    const couponsAfterDelete = DbService.getCoupons();
    assert(couponsAfterDelete.find(c => c.id === voucherToDelete.id) === undefined, `Voucher ID ${voucherToDelete.id} successfully deleted from database`);

    // 6. Cash In Transactions & Live Shift Audit
    console.log('\n--- [6. CASH IN TRANSACTIONS & LIVE SHIFT RECONCILIATION] ---');
    const summaryBeforeTx = DbService.getActiveShiftSummary();
    // A row from before this shift opened must not count toward it
    DbService.addTransaction({
      username: 'PC-OLD',
      date: '1/1/2020',
      time: '10:00:00',
      staff: 'Kasir 1',
      price: 99000,
      timeUsed: '0m',
      note: 'GCNET Paket terbeli, [paket: lama], [harga: 99.000]'
    });
    // Paid from member balance: no cash moved
    DbService.addTransaction({
      username: 'pro_gamer',
      date: new Date().toLocaleDateString('id-ID'),
      time: new Date().toTimeString().split(' ')[0],
      staff: 'Kasir 1',
      price: 7000,
      timeUsed: 'F&B',
      note: 'Penjualan F&B Potong Saldo (1 item) - PC-02'
    });
    // Add sample billing transaction
    DbService.addTransaction({
      username: 'PC-01',
      date: new Date().toLocaleDateString('id-ID'),
      time: new Date().toLocaleTimeString('id-ID'),
      staff: 'Kasir 1',
      price: 12000,
      note: 'Paket 3 Jam (PC-01)'
    });

    // Add sample F&B POS transaction
    DbService.addTransaction({
      username: 'PC-02',
      date: new Date().toLocaleDateString('id-ID'),
      time: new Date().toLocaleTimeString('id-ID'),
      staff: 'Kasir 1',
      price: 25000,
      note: 'Pesanan F&B POS #POS-1001 (Nasi Goreng + Teh Manis)'
    });

    // Add sample Member Topup transaction
    DbService.addTransaction({
      username: 'pro_gamer',
      date: new Date().toLocaleDateString('id-ID'),
      time: new Date().toLocaleTimeString('id-ID'),
      staff: 'Kasir 1',
      price: 50000,
      note: 'Top Up Saldo Akun [pro_gamer]'
    });

    const shiftSummaryAfterTx = DbService.getActiveShiftSummary();
    assert(shiftSummaryAfterTx.totalCashIn - summaryBeforeTx.totalCashIn === 87000, `Shift cash in grew by exactly Rp 87.000 (old-day row and balance payment excluded): +Rp ${(shiftSummaryAfterTx.totalCashIn - summaryBeforeTx.totalCashIn).toLocaleString('id-ID')}`);
    assert(shiftSummaryAfterTx.billingCash >= 12000, `Billing cash aggregated: Rp ${shiftSummaryAfterTx.billingCash.toLocaleString('id-ID')}`);
    assert(shiftSummaryAfterTx.posCash >= 25000, `POS F&B cash aggregated: Rp ${shiftSummaryAfterTx.posCash.toLocaleString('id-ID')}`);
    assert(shiftSummaryAfterTx.topupCash >= 50000, `Topup cash aggregated: Rp ${shiftSummaryAfterTx.topupCash.toLocaleString('id-ID')}`);
    assert(shiftSummaryAfterTx.expectedEndCash >= shiftSummaryAfterTx.currentShift.startCash + 87000, `Live expected end cash verified: Rp ${shiftSummaryAfterTx.expectedEndCash.toLocaleString('id-ID')}`);

    // 7. Cashier Shift Handover & Reconciliation
    console.log('\n--- [7. CASHIER SHIFT HANDOVER & RECONCILIATION CYCLE] ---');
    const activeShiftBeforeClose = shiftSummaryAfterTx.currentShift;
    const physicalCash = shiftSummaryAfterTx.expectedEndCash + 5000; // Over by Rp 5.000

    const wrongPwHandover = DbService.closeShiftHandover({
      shiftId: activeShiftBeforeClose.id,
      incomingOperator: 'Kasir 2',
      incomingPassword: 'salah',
      actualEndCash: physicalCash,
      note: 'Percobaan tanpa password benar',
      staff: 'Kasir 1'
    });
    assert(wrongPwHandover.success === false, 'Shift handover rejected with wrong incoming password');
    assert(DbService.getActiveShiftSummary().currentShift.id === activeShiftBeforeClose.id, 'Rejected handover leaves the shift open');

    const initialAdminRetry = DbService.setupInitialAdmin({ username: 'Kasir 2', password: 'rebut-admin' });
    assert(initialAdminRetry.success === false, 'Initial admin setup refused once accounts exist');

    const handoverResult = DbService.closeShiftHandover({
      shiftId: activeShiftBeforeClose.id,
      incomingOperator: 'Kasir 2',
      incomingPassword: '123',
      actualEndCash: physicalCash,
      note: 'Handover shift malam: kas fisik lebih 5rb receh',
      staff: 'Kasir 1'
    });

    assert(handoverResult.success === true, 'Shift handover completed successfully');
    assert(handoverResult.variance === 5000, `Variance calculated correctly (+Rp 5.000): ${handoverResult.variance}`);
    assert(handoverResult.closedShift.status === 0, 'Previous shift marked closed (status = 0)');
    assert(handoverResult.newShift.status === 1, 'New shift activated (status = 1)');
    assert(handoverResult.operator?.name === 'Kasir 2', 'Handover returns the verified incoming operator');
    assert(handoverResult.newShift.employeeName === 'Kasir 2', `New shift assigned to incoming operator: ${handoverResult.newShift.employeeName}`);
    assert(handoverResult.newShift.startCash === physicalCash, `New shift start cash equal to actual end cash: Rp ${handoverResult.newShift.startCash.toLocaleString('id-ID')}`);

    // 8. Shift History & Ledger Audit
    console.log('\n--- [8. SHIFT HISTORY & LEDGER AUDIT] ---');
    const shiftHistory = DbService.getShiftHistory();
    assert(shiftHistory.length >= 1, `Shift history contains closed shifts (${shiftHistory.length} shift records)`);
    const lastClosedShift = shiftHistory.find(s => s.id === activeShiftBeforeClose.id);
    assert(lastClosedShift !== undefined, `Closed shift #${activeShiftBeforeClose.id} found in history with status: ${lastClosedShift?.statusText}`);

    const systemLogs = DbService.getLogs(50);
    const handoverLog = systemLogs.find(l => l.action.toLowerCase().includes('handover'));
    assert(handoverLog !== undefined, `Handover audit logged in SystemLogs: "${handoverLog?.action}"`);

    // 9. Transaction range query, correction and delete
    console.log('\n--- [9. TRANSACTION RANGE, CORRECTION & DELETE] ---');
    const old2020 = DbService.getTransactions(500, '2020-01-01', '2020-01-01');
    assert(old2020.length === 1 && old2020[0].username === 'PC-OLD', `Single-day range returns only that day (${old2020.length} row)`);
    const t = new Date();
    const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const todayRows = DbService.getTransactions(500, iso, iso);
    assert(todayRows.length > 0 && !todayRows.some(r => r.username === 'PC-OLD'), `Today range excludes old rows (${todayRows.length} rows)`);

    const target = todayRows.find(r => r.note.startsWith('Paket 3 Jam'))!;
    const corrected = DbService.correctTransaction(target.id, 8000, 'Paket 2 Jam (PC-01)', 'Admin');
    const afterFix = DbService.getTransactions(500, iso, iso).find(r => r.id === target.id)!;
    assert(corrected.success && afterFix.price === 8000, 'Correction changes the amount');
    assert(afterFix.note.includes('dikoreksi Admin') && afterFix.note.includes('Rp 12.000 jadi Rp 8.000'), `Correction leaves a trail: ${afterFix.note}`);
    assert(DbService.correctTransaction(target.id, NaN, 'x', 'Admin').success === false, 'Correction rejects an invalid amount');
    assert(DbService.correctTransaction(target.id, 1000, '   ', 'Admin').success === false, 'Correction requires a note');
    const handoverRow = todayRows.find(r => r.note.startsWith('Handover'))!;
    assert(DbService.deleteTransaction(handoverRow.id, 'Admin').success === false, 'Handover row cannot be deleted');

    const deleted = DbService.deleteTransaction(target.id, 'Admin');
    assert(deleted.success && !DbService.getTransactions(500, iso, iso).some(r => r.id === target.id), 'Delete removes the row');
    assert(DbService.getLogs(50).some(l => l.action.includes(`menghapus transaksi #${target.id}`)), 'Delete is kept in the system log');

  } catch (error: any) {
    console.error('FATAL ERROR DURING TEST EXECUTION:', error);
    assert(false, 'Integration test threw uncaught exception', error?.message);
  }

  // Summary
  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runShiftAndVoucherIntegrationTests();
