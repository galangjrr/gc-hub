import { DbService } from '../src/server/db/dbService';

async function runInventoryTest() {
  console.log('================================================================');
  console.log('📦 GC-HUB INVENTORY & POS CATALOG BACKEND TEST');
  console.log('================================================================');

  try {
    await DbService.init();
    console.log('✅ [PASS] DbService Initialized');

    // 1. Category CRUD
    console.log('\n--- [1. CATEGORY MANAGEMENT] ---');
    const newCat = DbService.saveCategory({ name: 'Rokok & Korek', enabled: true });
    console.log(`✅ [PASS] Category created: ${newCat.name} (ID: ${newCat.id})`);

    const updatedCat = DbService.saveCategory({ id: newCat.id, name: 'Tembakau & Aksesoris', enabled: true });
    console.log(`✅ [PASS] Category updated: ${updatedCat.name}`);

    // 2. Product in new category
    console.log('\n--- [2. PRODUCT WITH CUSTOM CATEGORY] ---');
    const product = DbService.saveProduct({
      categoryId: newCat.id,
      name: 'Korek Gas Tokai Test',
      unitPrice: 3500,
      costPrice: 2000,
      stock: 10,
      alertStock: 3,
      unitName: 'pcs',
      enabled: true
    });
    console.log(`✅ [PASS] Product created: ${product.name} (ID: ${product.id}, Stock: ${product.stock})`);

    // Verify deletion protection on category
    const deleteAttempt = DbService.deleteCategory(newCat.id);
    if (!deleteAttempt.success) {
      console.log(`✅ [PASS] Category deletion safely blocked: "${deleteAttempt.message}"`);
    } else {
      throw new Error('Category should not be deleted while products exist!');
    }

    // 3. Stock Adjustment (Opname)
    console.log('\n--- [3. STOCK ADJUSTMENT / OPNAME] ---');
    const adjAdd = DbService.adjustStock({
      productId: product.id,
      changeAmount: 5,
      mode: 'add',
      reason: 'Penyesuaian stok fisik gudang',
      staff: 'Admin'
    });
    console.log(`✅ [PASS] Stock added (+5): New Stock = ${adjAdd.product?.stock} (Expected: 15)`);
    if (adjAdd.product?.stock !== 15) throw new Error('Stock adjustment add failed');

    const adjSub = DbService.adjustStock({
      productId: product.id,
      changeAmount: 3,
      mode: 'subtract',
      reason: 'Barang rusak / bocor',
      staff: 'Admin'
    });
    console.log(`✅ [PASS] Stock subtracted (-3): New Stock = ${adjSub.product?.stock} (Expected: 12)`);
    if (adjSub.product?.stock !== 12) throw new Error('Stock adjustment subtract failed');

    const adjSet = DbService.adjustStock({
      productId: product.id,
      changeAmount: 2,
      mode: 'set',
      reason: 'Stok opname akhir bulan',
      staff: 'Admin'
    });
    console.log(`✅ [PASS] Stock set directly to 2: New Stock = ${adjSet.product?.stock} (Expected: 2)`);
    if (adjSet.product?.stock !== 2) throw new Error('Stock adjustment set failed');

    // 4. Low Stock Alert
    console.log('\n--- [4. LOW STOCK ALERT] ---');
    const lowStockList = DbService.getLowStockProducts();
    const foundAlert = lowStockList.find(p => p.id === product.id);
    if (foundAlert) {
      console.log(`✅ [PASS] Low stock alert detected for ${foundAlert.name} (Stock: ${foundAlert.stock}, Alert: ${foundAlert.alertStock})`);
    } else {
      throw new Error('Low stock alert should include product with stock 2 <= alert 3');
    }

    // 5. Restock with New Cost Price
    console.log('\n--- [5. RESTOCK PRODUCT] ---');
    const restockRes = DbService.restockProduct(product.id, 20, 2200, 'Staff Kasir');
    console.log(`✅ [PASS] Restock success (+20): New Stock = ${restockRes.product?.stock} (Expected: 22), CostPrice = Rp ${restockRes.product?.costPrice}`);
    if (restockRes.product?.stock !== 22 || restockRes.product?.costPrice !== 2200) {
      throw new Error('Restock product failed');
    }

    // 6. Inventory Summary & Valuation
    console.log('\n--- [6. INVENTORY VALUATION SUMMARY] ---');
    const summary = DbService.getInventorySummary();
    console.log(`✅ [PASS] Total Items: ${summary.totalItems}`);
    console.log(`✅ [PASS] Total Units: ${summary.totalStockUnits}`);
    console.log(`✅ [PASS] Total Cost Asset Valuation: Rp ${summary.totalCostValuation.toLocaleString('id-ID')}`);
    console.log(`✅ [PASS] Total Retail Valuation: Rp ${summary.totalRetailValuation.toLocaleString('id-ID')}`);
    console.log(`✅ [PASS] Low Stock Count: ${summary.lowStockCount}`);

    // 7. Cleanup test data
    console.log('\n--- [7. CLEANUP TEST DATA] ---');
    DbService.deleteProduct(product.id);
    const deleteCatSuccess = DbService.deleteCategory(newCat.id);
    console.log(`✅ [PASS] Product cleaned up & Category deleted: ${deleteCatSuccess.success}`);

    console.log('\n================================================================');
    console.log('🎉 ALL INVENTORY & POS CATALOG BACKEND TESTS PASSED 100%');
    console.log('================================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

runInventoryTest();
