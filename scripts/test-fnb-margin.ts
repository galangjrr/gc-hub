// F&B cost and margin: cost entered on the product, recorded per item when the sale is approved,
// summed per range and cashier. Booths never receive the cost.
import { app } from 'electron';
import { DbService } from '../src/server/db/dbService';
import { todayIso } from '../src/shared/transactions';

let failed = 0;
const check = (cond: boolean, name: string, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${!cond && detail ? ` -> ${detail}` : ''}`);
  if (!cond) failed++;
};

app.whenReady().then(async () => {
  await DbService.init();
  const today = todayIso();

  // Cost on the product form
  const saved = DbService.saveProductChecked({ name: 'Uji Kopi', categoryName: 'Uji', unitPrice: 5000, costPrice: 2000, stock: 50 });
  check(saved.success && saved.product?.costPrice === 2000, 'harga modal tersimpan dari form produk', JSON.stringify(saved));
  const kopi = saved.product!;
  const keep = DbService.saveProductChecked({ id: kopi.id, name: 'Uji Kopi', categoryName: 'Uji', unitPrice: 5000, stock: 50 });
  check(keep.success && keep.product?.costPrice === 2000, 'ubah produk tanpa field modal tidak menghapus modal', JSON.stringify(keep.product));
  for (const bad of [-1, 1.5, 'abc', 20_000_000]) {
    check(!DbService.saveProductChecked({ id: kopi.id, name: 'Uji Kopi', categoryName: 'Uji', unitPrice: 5000, stock: 50, costPrice: bad }).success, `modal tidak valid ditolak: ${bad}`);
  }
  const roti = DbService.saveProductChecked({ name: 'Uji Roti', categoryName: 'Uji', unitPrice: 8000, stock: 20 }).product!;
  check((roti.costPrice || 0) === 0, 'produk tanpa modal tersimpan dengan modal 0');

  // Sales: 3 kopi at cost 2000, then cost changes to 2500 and 2 more are sold; 1 roti without cost
  check(DbService.counterSale({ items: [{ productId: kopi.id, quantity: 3 }], staff: 'Kasir A' }).success, 'jual 3 kopi');
  DbService.saveProductChecked({ id: kopi.id, name: 'Uji Kopi', categoryName: 'Uji', unitPrice: 5000, stock: 47, costPrice: 2500 });
  check(DbService.counterSale({ items: [{ productId: kopi.id, quantity: 2 }], staff: 'Kasir B' }).success, 'jual 2 kopi setelah modal naik');
  check(DbService.counterSale({ items: [{ productId: roti.id, quantity: 1 }], staff: 'Kasir A' }).success, 'jual 1 roti tanpa modal');
  // A rejected booth order never counts
  const rejected = DbService.createOrder({ pcId: 'PC-UJI', username: 'tamu', items: [{ productId: kopi.id, name: 'Uji Kopi', unitPrice: 5000, quantity: 4 }] });
  DbService.rejectOrder({ orderLogId: rejected.id, reason: 'uji' });

  const m = DbService.getFnbMargin(today, today)!;
  const kopiRow = m.items.find(i => i.name === 'Uji Kopi');
  const rotiRow = m.items.find(i => i.name === 'Uji Roti');
  check(kopiRow?.qty === 5 && kopiRow.costedRevenue === 25_000, 'omzet kopi 5 x 5.000, pesanan ditolak tidak dihitung', JSON.stringify(kopiRow));
  check(kopiRow?.cost === 3 * 2000 + 2 * 2500, 'modal memakai harga saat terjual, bukan harga sekarang', JSON.stringify(kopiRow));
  check(kopiRow?.profit === 25_000 - 11_000, 'laba kopi = omzet - modal', JSON.stringify(kopiRow));
  check(rotiRow?.uncostedQty === 1 && rotiRow.uncostedRevenue === 8000 && rotiRow.costedRevenue === 0 && rotiRow.profit === 0, 'item tanpa modal dipisah, tidak dihitung laba penuh', JSON.stringify(rotiRow));
  check(m.profit >= 14_000 && m.uncostedQty >= 1, 'total ikut menjumlah', JSON.stringify({ profit: m.profit, uncostedQty: m.uncostedQty }));

  const onlyB = DbService.getFnbMargin(today, today, 'Kasir B')!;
  const kopiB = onlyB.items.find(i => i.name === 'Uji Kopi');
  check(kopiB?.qty === 2 && kopiB.cost === 5000 && !onlyB.items.some(i => i.name === 'Uji Roti'), 'filter kasir', JSON.stringify(onlyB.items));
  check(DbService.getFnbMargin('2001-01-01', '2001-01-02')!.items.length === 0, 'rentang tanpa penjualan kosong');
  check(DbService.getFnbMargin(today, '2001-01-01') === null && DbService.getFnbMargin('kemarin', today) === null, 'rentang tidak valid ditolak');

  // The booth catalog never carries the cost
  const booth = DbService.getBoothProducts().find(p => p.id === kopi.id) as Record<string, unknown> | undefined;
  check(!!booth && !('costPrice' in booth) && booth.unitPrice === 5000, 'katalog bilik tanpa harga modal', JSON.stringify(booth));

  DbService.deleteProduct(kopi.id);
  DbService.deleteProduct(roti.id);
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  app.exit(failed ? 1 : 0);
}).catch(err => { console.error(err); app.exit(1); });
