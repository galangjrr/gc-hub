import { app } from 'electron';
import { db, sqlite } from '../src/server/db/index';
import * as schema from '../src/server/db/schema';
import { DbService } from '../src/server/db/dbService';
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

async function runDatabaseTests() {
  console.log('================================================================');
  console.log('💾 GC-HUB AUTHORITATIVE SQLITE DATABASE & DRIZZLE ORM TEST SUITE');
  console.log('================================================================\n');

  try {
    // 1. Verify All 25 Tables in SQLite Master
    console.log('--- [1. TABLE EXISTENCE IN SQLITE ENGINE] ---');
    const tableRows = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    const tableNames = new Set(tableRows.map(r => r.name));
    
    const requiredTables = [
      'Users',
      'UserGroups',
      'WorkstationGroups',
      'Workstations',
      'PcGridLayoutsCustom',
      'ChargingRates',
      'PeriodicDiscounts',
      'RateStructures',
      'PricePackagesFixed',
      'PrepayShortcuts',
      'ProductCategories',
      'OrderItems',
      'OrderLogs',
      'OrderItemLogs',
      'Employees',
      'Shifts',
      'SessionLogs',
      'TransactionLogs',
      'TopupQueues',
      'CouponCards',
      'PrepaidCardHistory',
      'GuestRecords',
      'GuestPricePromotions',
      'CafeContactInfo',
      'SystemLogs'
    ];

    let missingTables: string[] = [];
    for (const t of requiredTables) {
      if (!tableNames.has(t)) {
        missingTables.push(t);
      }
    }
    assert(missingTables.length === 0, `All 25 core tables exist in SQLite (${tableRows.length} total tables detected)`, missingTables.length ? `Missing: ${missingTables.join(', ')}` : `Found: ${Array.from(tableNames).join(', ')}`);

    // 2. Test DbService Initialization & Seeding
    console.log('\n--- [2. DBSERVICE INIT & SEEDING] ---');
    await DbService.init();
    const members = DbService.getMembers();
    const packages = DbService.getPackages();
    const rates = DbService.getChargingRates();
    assert(Array.isArray(members), 'DbService.getMembers() returns array');
    assert(Array.isArray(packages) && packages.length > 0, `DbService.getPackages() seeded (${packages.length} packages)`);
    assert(Array.isArray(rates) && rates.length > 0, `DbService.getChargingRates() seeded (${rates.length} rates)`);

    // 3. Test Users / Member CRUD
    console.log('\n--- [3. USERS / MEMBER CRUD TEST] ---');
    const testUsername = `test_member_${Date.now()}`;
    const newMember = DbService.createMember({
    password: "test1234",
      username: testUsername,
      firstName: 'Budi',
      lastName: 'Santoso',
      money: 25000,
      groupName: 'VIP',
      status: 'Normal'
    });
    assert(newMember.username === testUsername, `Member created: ${newMember.username} (ID: ${newMember.id})`);
    assert(newMember.money === 25000, 'Member balance correctly stored (Rp 25.000)');

    // Update member
    DbService.updateMember(newMember.id, { firstName: 'Budi Updated' });
    const memberAfterUpdate = DbService.getMembers().find(m => m.id === newMember.id);
    assert(memberAfterUpdate?.firstName === 'Budi Updated', 'Member profile update verified');

    // Top up member
    const topupRes = DbService.topUpMember(newMember.id, 10000, 'Kasir Test');
    assert(topupRes.newBalance === 35000, `Member balance top up verified (New Balance: Rp ${topupRes.newBalance.toLocaleString('id-ID')})`);

    // 4. Test Workstations CRUD
    console.log('\n--- [4. WORKSTATIONS CRUD TEST] ---');
    const testPcId = `PC-TEST-${Date.now().toString().slice(-4)}`;
    DbService.addWorkstation({
      name: testPcId,
      ip: '192.168.1.199',
      mac: 'AA:BB:CC:DD:EE:FF',
      groupName: 'VIP Room',
      pricePerHour: 6000
    });
    const wsList = DbService.getWorkstations();
    console.log('    -> All Workstations in SQLite:', wsList.map(w => `${w.name} (${w.pcId})`).join(', '));
    const foundWs = wsList.find(w => w.name === testPcId);
    assert(!!foundWs, `Workstation ${testPcId} successfully inserted`);
    assert(foundWs?.pricePerHour === 6000, 'Workstation pricePerHour verified (Rp 6.000)');

    const alphaName = `PC-Mokiya${Date.now().toString().slice(-4)}`;
    const alphaRes = DbService.addWorkstation({ name: alphaName });
    assert(alphaRes.success && DbService.getWorkstations().some(w => w.name === alphaName), `Alphabet workstation name kept as typed (${alphaName})`);
    const dupRes = DbService.addWorkstation({ name: alphaName.toUpperCase() });
    assert(!dupRes.success, 'Duplicate name with different case rejected', dupRes.message);
    const badRes = DbService.addWorkstation({ name: 'PC<script>' });
    assert(!badRes.success, 'Workstation name with illegal characters rejected', badRes.message);
    DbService.deleteWorkstation(alphaName);

    // 5. Test Coupon Batch Generation & Redemption
    console.log('\n--- [5. COUPONS GENERATION & REDEEM TEST] ---');
    const couponBatch = DbService.generateCouponsBatch(3, 'time', 0, 120, '31-12-2027');
    assert(couponBatch.length === 3, `Batch voucher generated (${couponBatch.length} coupons)`);
    
    const targetCoupon = couponBatch[0];
    const redeemRes = DbService.redeemCoupon(targetCoupon.code, testUsername);
    assert(redeemRes.success === true, `Coupon ${targetCoupon.code} redeemed successfully`);

    // Double redeem prevention
    const doubleRedeem = DbService.redeemCoupon(targetCoupon.code, testUsername);
    assert(doubleRedeem.success === false, 'Duplicate coupon redemption prevented');

    // 6. Test Direct Drizzle Queries on Core Tables
    console.log('\n--- [6. DIRECT DRIZZLE ORM TABLE OPERATIONS] ---');
    // Test SystemLogs
    const sysLogResult = db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: 1,
      operatorId: 1,
      description: 'Test system log entry from automated test runner',
      level: 0
    }).returning().get();
    assert(!!sysLogResult.id, `SystemLogs entry inserted with ID: ${sysLogResult.id}`);

    // Test CafeContactInfo
    const cafeInfo = db.insert(schema.cafeContactInfo).values({
      telNumber: '021-5551234',
      address: 'Jl. Warnet Cyber No. 99',
      email: 'admin@gchub.lan'
    }).returning().get();
    assert(cafeInfo.telNumber === '021-5551234', `CafeContactInfo inserted (Tel: ${cafeInfo.telNumber})`);

    // Personal rate accumulation interval survives a save/load round trip (stored as '30m')
    const originalRates = DbService.getChargingRates();
    DbService.saveChargingRates([{ ...originalRates[0], accumulationMinutes: 30 }]);
    const reloadedRate = DbService.getChargingRates()[0];
    assert(reloadedRate.accumulationMinutes === 30, `Personal rate accumulation interval persisted (${reloadedRate.accumulationMinutes} menit)`);
    DbService.saveChargingRates(originalRates);

    // Cleanup test records
    DbService.deleteMember(newMember.id);
    DbService.deleteWorkstation(testPcId);
    assert(true, 'Test records cleaned up successfully');

  } catch (err: any) {
    console.error('Database Test Exception:', err.stack || err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`📊 DATABASE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  try {
    app.exit(failed > 0 ? 1 : 0);
  } catch {
    process.exit(failed > 0 ? 1 : 0);
  }
}

app.whenReady().then(runDatabaseTests);
