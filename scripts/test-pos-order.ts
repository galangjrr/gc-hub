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

async function runPosOrderIntegrationTests() {
  console.log('================================================================');
  console.log('🍔 GC-HUB PHASE 4.1 F&B POS ORDERING & APPROVAL INTEGRATION TEST');
  console.log('================================================================\n');

  try {
    // 1. Init Database & Engine
    console.log('--- [1. INITIALIZING DATABASE & SEEDING] ---');
    await DbService.init();
    BillingEngine.start();
    assert(true, 'DbService and BillingEngine initialized');

    // 2. Product Categories & Catalog Verification
    console.log('\n--- [2. PRODUCT CATALOG & CATEGORIES] ---');
    const categories = DbService.getCategories();
    assert(categories.length >= 3, `Categories seeded (${categories.length} categories found: ${categories.map(c => c.name).join(', ')})`);

    const products = DbService.getProducts();
    assert(products.length >= 10, `Product catalog seeded (${products.length} products found)`);

    const mieGoreng = products.find(p => p.name.includes('Mie Goreng'));
    assert(mieGoreng !== undefined && mieGoreng.unitPrice === 10000, 'Product details verified (Mie Goreng Jumbo = Rp 10.000)');

    // 3. Product Catalog Management (CRUD)
    console.log('\n--- [3. PRODUCT CATALOG MANAGEMENT (CRUD)] ---');
    const newProd = DbService.saveProduct({
      categoryId: 1,
      name: 'Nasi Gila Spesial Test',
      unitPrice: 15000,
      costPrice: 8000,
      stock: 10,
      alertStock: 2,
      unitName: 'Porsi'
    });
    assert(newProd.id !== undefined && newProd.unitPrice === 15000, `New product created: ${newProd.name} (ID: ${newProd.id})`);

    DbService.saveProduct({
      id: newProd.id,
      categoryId: 1,
      name: 'Nasi Gila Spesial Test (Updated)',
      unitPrice: 16000,
      stock: 12
    });
    const updatedProd = DbService.getProducts().find(p => p.id === newProd.id);
    assert(updatedProd?.unitPrice === 16000 && updatedProd?.stock === 12, 'Product price and stock updated successfully');

    DbService.deleteProduct(newProd.id);
    const deletedProd = DbService.getProducts().find(p => p.id === newProd.id);
    assert(deletedProd === undefined, 'Test product deleted successfully');

    // 3b. Orders from a booth PC are repriced from the catalog
    console.log('\n--- [3b. CLIENT ORDER PRICING FROM CATALOG] ---');
    const cheat = DbService.priceClientOrder([{ id: mieGoreng!.id, name: 'Mie Goreng', price: 1, quantity: 2 }, { productId: mieGoreng!.id, quantity: 1 }]);
    assert(cheat.success === true && cheat.totalPrice === 30000 && cheat.items[0].unitPrice === 10000 && cheat.items[0].quantity === 3,
      'Client price ignored and duplicate lines merged (3 x Rp 10.000 = Rp 30.000)');
    assert(DbService.priceClientOrder([{ id: 999999, quantity: 1 }]).success === false, 'Unknown product rejected');
    assert(DbService.priceClientOrder([{ id: mieGoreng!.id, quantity: 0 }]).success === false, 'Zero quantity rejected');
    assert(DbService.priceClientOrder([{ id: mieGoreng!.id, quantity: 1.5 }]).success === false, 'Fractional quantity rejected');
    assert(DbService.priceClientOrder([]).success === false && DbService.priceClientOrder('x').success === false, 'Empty or malformed order rejected');

    // 4. Client Order Submission & Pending Status
    console.log('\n--- [4. CLIENT ORDER SUBMISSION & PENDING FLOW] ---');
    const testPcId = 'PC-POS-01';
    DbService.addWorkstation({ name: testPcId, ip: '192.168.1.150', pricePerHour: 4000 });

    const order1 = DbService.createOrder({
      pcId: testPcId,
      pcName: testPcId,
      username: 'Budi_Gamer',
      items: [
        { productId: mieGoreng!.id, name: mieGoreng!.name, unitPrice: 10000, amount: 2 },
        { productId: 5, name: 'Es Teh Manis Dingin', unitPrice: 3000, amount: 1 }
      ],
      totalPrice: 23000,
      note: 'Jangan terlalu pedas ya bang'
    });

    assert(order1.id !== undefined && order1.orderStatus === 0, `Order created: ${order1.orderCode} (Status: 0 / Pending)`);
    assert(order1.totalPrice === 23000, 'Order total price calculated correctly (Rp 23.000)');

    // Check item logs in DB
    const itemLogs = db.select().from(schema.orderItemLogs).where(eq(schema.orderItemLogs.orderLogId, order1.id)).all();
    assert(itemLogs.length === 2, `Order item details recorded in SQLite OrderItemLogs (${itemLogs.length} items)`);

    // Update BillingEngine pending order badge
    BillingEngine.setPendingOrder(testPcId, order1);
    const liveGrid = BillingEngine.getLiveWorkstations();
    const pcCard = liveGrid.find(w => w.name === testPcId);
    assert(pcCard?.hasPendingOrder === true, 'Workstation card displays hasPendingOrder: true badge');
    assert(pcCard?.pendingOrderSummary?.includes('23.000'), `Workstation card displays pending summary: ${pcCard?.pendingOrderSummary}`);

    // 5. Order Approval - Payment Method: BAYAR TUNAI (CASH)
    console.log('\n--- [5. CASHIER APPROVAL - BAYAR TUNAI (CASH)] ---');
    const initialMieStock = DbService.getProducts().find(p => p.id === mieGoreng!.id)!.stock;

    const approveCashRes = DbService.approveOrder({
      orderLogId: order1.id,
      payMethod: 'cash',
      staff: 'Kasir_Test'
    });

    assert(approveCashRes.success === true, 'Order approval returned success');
    assert(approveCashRes.order?.orderStatus === 1, 'Order status updated to 1 (Approved)');
    assert(approveCashRes.order?.payStatus === 1, 'Payment status set to 1 (Paid Cash)');

    // Stock deduction check
    const postMieStock = DbService.getProducts().find(p => p.id === mieGoreng!.id)!.stock;
    assert(postMieStock === initialMieStock - 2, `Stock deducted correctly: ${initialMieStock} -> ${postMieStock}`);

    // Clear pending order on engine
    BillingEngine.clearPendingOrder(testPcId, order1.id);
    const updatedGrid = BillingEngine.getLiveWorkstations();
    const pcCardAfter = updatedGrid.find(w => w.name === testPcId);
    assert(pcCardAfter?.hasPendingOrder === false, 'Pending order badge cleared after approval');

    // 6. Order Approval - Payment Method: POTONG SALDO MEMBER
    console.log('\n--- [6. CASHIER APPROVAL - POTONG SALDO MEMBER] ---');
    const memberName = `pos_member_${Date.now()}`;
    const testMember = DbService.createMember({
    password: "test1234",
      username: memberName,
      firstName: 'Agus',
      lastName: 'Member',
      money: 50000,
      groupName: 'VIP'
    });

    const order2 = DbService.createOrder({
      pcId: testPcId,
      pcName: testPcId,
      username: memberName,
      items: [
        { productId: 3, name: 'Nasi Goreng Spesial', unitPrice: 12000, amount: 1 },
        { productId: 7, name: 'Kopi Hitam Panas / Dingin', unitPrice: 4000, amount: 2 }
      ],
      totalPrice: 20000,
      note: 'Kopi manis dikit'
    });

    const approveSaldoRes = DbService.approveOrder({
      orderLogId: order2.id,
      payMethod: 'saldo',
      staff: 'Kasir_Test'
    });

    assert(approveSaldoRes.success === true, 'Member saldo order approved');
    assert(approveSaldoRes.order?.payStatus === 2, 'PayStatus set to 2 (Deducted From Balance)');

    // Verify member balance deducted in DB
    const updatedMember = DbService.getMembers().find(m => m.id === testMember.id);
    assert(updatedMember?.money === 30000, `Member balance deducted in DB: Rp 50.000 -> Rp ${updatedMember?.money.toLocaleString('id-ID')}`);

    // 7. Order Approval - Payment Method: MASUK TAGIHAN SESI (TAB)
    console.log('\n--- [7. CASHIER APPROVAL - MASUK TAGIHAN SESI (TAB)] ---');
    const order3 = DbService.createOrder({
      pcId: testPcId,
      pcName: testPcId,
      username: 'Guest_Tab',
      items: [
        { productId: 4, name: 'Roti Bakar Coklat Keju', unitPrice: 8000, amount: 1 }
      ],
      totalPrice: 8000
    });

    const approveTabRes = DbService.approveOrder({
      orderLogId: order3.id,
      payMethod: 'tab' as any,
      staff: 'Kasir_Test'
    });

    assert(approveTabRes.success === false, `Tab payment refused: ${approveTabRes.message}`);
    const tabGrid = BillingEngine.getLiveWorkstations().find(w => w.name === testPcId) as any;
    assert(tabGrid?.serviceFee === undefined, 'No hidden service fee kept on the workstation');

    // 8. Low Stock Alert Warning
    console.log('\n--- [8. LOW STOCK ALERT WARNING] ---');
    // Set stock of silverqueen to 4 (alertStock is 3) and order 2 pcs -> resulting stock 2 (<= alertStock)
    const chitato = DbService.getProducts().find(p => p.name.includes('Chitato'))!;
    DbService.saveProduct({ id: chitato.id, stock: 4, alertStock: 3 });

    const orderStockTest = DbService.createOrder({
      pcId: testPcId,
      pcName: testPcId,
      username: 'Snack_Buyer',
      items: [
        { productId: chitato.id, name: chitato.name, unitPrice: chitato.unitPrice, amount: 2 }
      ],
      totalPrice: chitato.unitPrice * 2
    });

    const approveStockRes = DbService.approveOrder({
      orderLogId: orderStockTest.id,
      payMethod: 'cash',
      staff: 'Kasir_Test'
    });

    assert(approveStockRes.lowStockWarnings.length > 0, `Low stock warning triggered: "${approveStockRes.lowStockWarnings[0]}"`);

    // 9. Order Rejection Flow
    console.log('\n--- [9. ORDER REJECTION FLOW] ---');
    const orderReject = DbService.createOrder({
      pcId: testPcId,
      pcName: testPcId,
      username: 'Guest_Reject',
      items: [
        { productId: 1, name: 'Mie Goreng Jumbo + Telur', unitPrice: 10000, amount: 1 }
      ],
      totalPrice: 10000
    });

    const rejectRes = DbService.rejectOrder({
      orderLogId: orderReject.id,
      reason: 'Dapur tutup untuk restock',
      staff: 'Kasir_Test'
    });

    assert(rejectRes.success === true, 'Order rejection returned success');
    assert(rejectRes.order?.orderStatus === 2, 'Order status set to 2 (Rejected)');
    assert(rejectRes.order?.note === 'Dapur tutup untuk restock', 'Rejection reason saved in note');

    // 10. Order History Query
    console.log('\n--- [10. ORDER HISTORY LOGS] ---');
    const history = DbService.getOrders(10);
    assert(history.length >= 4, `Order history logs queried (${history.length} records found)`);

    // 11. Cleanup Test Records
    console.log('\n--- [11. CLEANUP TEST DATA] ---');
    BillingEngine.deleteWorkstation(testPcId);
    DbService.deleteMember(testMember.id);
    BillingEngine.stop();
    assert(true, 'Test workstation and member cleaned up');

  } catch (err: any) {
    console.error('POS Order Test Exception:', err.stack || err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`📊 POS ORDER TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  try {
    app.exit(failed > 0 ? 1 : 0);
  } catch {
    process.exit(failed > 0 ? 1 : 0);
  }
}

app.whenReady().then(runPosOrderIntegrationTests);
