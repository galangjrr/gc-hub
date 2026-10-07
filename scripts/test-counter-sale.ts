// Walk-in sale at the cashier (POS tab): catalog prices, stock checked and deducted, sale recorded.
import { app } from 'electron';
import { DbService } from '../src/server/db/dbService';

let failed = 0;
const check = (cond: boolean, name: string, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${!cond && detail ? ` -> ${detail}` : ''}`);
  if (!cond) failed++;
};

app.whenReady().then(async () => {
  await DbService.init();
  const categoryId = DbService.getCategories()[0]?.id ?? 1;
  const teh = DbService.saveProduct({ categoryId, name: 'Uji Es Teh', unitPrice: 3000, stock: 5, alertStock: 2, unitName: 'gelas', enabled: true });
  const mati = DbService.saveProduct({ categoryId, name: 'Uji Nonaktif', unitPrice: 1000, stock: 10, alertStock: 1, unitName: 'pcs', enabled: false });
  const stockOf = (id: number) => DbService.getProducts().find(p => p.id === id)?.stock;
  const txCount = () => DbService.getTransactions(5000).length;

  const before = txCount();
  const sale = DbService.counterSale({ items: [{ productId: teh.id, quantity: 2, unitPrice: 1 }], staff: 'Kasir Uji' });
  const last = DbService.getTransactions(1)[0];
  check(sale.success && sale.total === 6000, 'harga dari katalog, bukan dari layar: 2 x Rp 3.000', JSON.stringify(sale));
  check(stockOf(teh.id) === 3, 'stok berkurang 2', String(stockOf(teh.id)));
  check(txCount() === before + 1 && last.price === 6000 && last.staff === 'Kasir Uji', 'transaksi tunai tercatat atas nama kasir', JSON.stringify(last));

  const low = DbService.counterSale({ items: [{ productId: teh.id, quantity: 1 }] });
  check(low.success && (low.lowStockWarnings || []).some(w => w.includes('Uji Es Teh')), 'peringatan stok menipis ikut dikembalikan', JSON.stringify(low));

  const over = DbService.counterSale({ items: [{ productId: teh.id, quantity: 3 }] });
  check(!over.success && /tinggal 2/.test(over.message) && stockOf(teh.id) === 2, 'jual melebihi stok ditolak, stok utuh', JSON.stringify(over));

  const split = DbService.counterSale({ items: [{ productId: teh.id, quantity: 2 }, { productId: teh.id, quantity: 1 }] });
  check(!split.success && stockOf(teh.id) === 2, 'baris kembar dijumlah sebelum cek stok', JSON.stringify(split));

  const disabled = DbService.counterSale({ items: [{ productId: mati.id, quantity: 1 }] });
  check(!disabled.success, 'produk nonaktif ditolak', JSON.stringify(disabled));

  for (const bad of [[], [{ productId: teh.id, quantity: 0 }], [{ productId: teh.id, quantity: 1.5 }], [{ productId: 999999, quantity: 1 }], 'bukan array']) {
    const res = DbService.counterSale({ items: bad });
    check(!res.success, `input tidak valid ditolak: ${JSON.stringify(bad)}`);
  }
  check(txCount() === before + 2, 'penjualan yang ditolak tidak mencatat transaksi', String(txCount() - before));

  // Booth orders go through the same approval: stock checked, no double approval
  const booth = DbService.createOrder({ pcId: 'PC-UJI', username: 'tamu', items: [{ productId: teh.id, name: 'Uji Es Teh', unitPrice: 3000, quantity: 5 }] });
  const tooMuch = DbService.approveOrder({ orderLogId: booth.id, payMethod: 'cash', staff: 'Kasir Uji' });
  check(!tooMuch.success && /tinggal 2/.test(tooMuch.message) && stockOf(teh.id) === 2, 'pesanan bilik melebihi stok ditolak, stok utuh', JSON.stringify(tooMuch));
  const ok = DbService.createOrder({ pcId: 'PC-UJI', username: 'tamu', items: [{ productId: teh.id, name: 'Uji Es Teh', unitPrice: 3000, quantity: 1 }] });
  const first = DbService.approveOrder({ orderLogId: ok.id, payMethod: 'cash', staff: 'Kasir Uji' });
  const txAfterFirst = txCount();
  const second = DbService.approveOrder({ orderLogId: ok.id, payMethod: 'cash', staff: 'Kasir Uji' });
  check(first.success && !second.success && stockOf(teh.id) === 1 && txCount() === txAfterFirst, 'klik setujui dua kali tidak memotong stok dan mencatat uang dua kali', JSON.stringify(second));
  const lateReject = DbService.rejectOrder({ orderLogId: ok.id, reason: 'uji' });
  check(!lateReject.success, 'pesanan yang sudah disetujui tidak bisa ditolak');

  // Kelola Produk: validated form, category by name, restock
  const added = DbService.saveProductChecked({ name: 'Uji Kopi Susu', categoryName: 'Uji Kopi', unitPrice: 5000, stock: 10 });
  const cat = DbService.getCategories().find(c => c.name === 'Uji Kopi');
  check(added.success && !!cat && added.product?.categoryId === cat!.id && added.product?.unitName === 'pcs', 'produk baru: kategori baru dibuat otomatis dari namanya', JSON.stringify(added));
  const again = DbService.saveProductChecked({ name: 'uji kopi susu', categoryName: 'uji kopi', unitPrice: 6000, stock: 1 });
  check(!again.success && /Sudah ada produk/.test(again.message), 'nama produk kembar ditolak (huruf besar kecil sama)', JSON.stringify(again));
  const sameCat = DbService.saveProductChecked({ name: 'Uji Kopi Hitam', categoryName: 'uji kopi', unitPrice: 4000, stock: 0 });
  check(sameCat.success && sameCat.product?.categoryId === cat!.id && DbService.getCategories().filter(c => c.name.toLowerCase() === 'uji kopi').length === 1, 'kategori yang sudah ada dipakai ulang, tidak dobel');
  for (const [bad, why] of [
    [{ name: '', unitPrice: 1000 }, 'nama kosong'],
    [{ name: 'X', unitPrice: -1 }, 'harga minus'],
    [{ name: 'X', unitPrice: 1500.5 }, 'harga pecahan'],
    [{ name: 'X', unitPrice: 1000, stock: -3 }, 'stok minus'],
    [{ name: 'X', unitPrice: 'abc' }, 'harga bukan angka'],
    [{ id: 999999, name: 'X', unitPrice: 1000 }, 'id tidak ada'],
  ] as const) {
    check(!DbService.saveProductChecked(bad).success, `produk ditolak: ${why}`);
  }
  const edited = DbService.saveProductChecked({ id: added.product!.id, name: 'Uji Kopi Susu', categoryName: 'Uji Kopi', unitPrice: 5500, stock: 10, enabled: false });
  check(edited.success && edited.product?.unitPrice === 5500 && edited.product?.enabled === false, 'ubah harga dan nonaktifkan produk');
  const restock = DbService.restockProduct(added.product!.id, 5, undefined, 'Kasir Uji');
  check(restock.success && stockOf(added.product!.id) === 15, 'tambah stok 5 jadi 15', JSON.stringify(restock));
  for (const q of [0, -2, 1.5, NaN]) check(!DbService.restockProduct(added.product!.id, q, undefined, 'Kasir Uji').success, `tambah stok ${q} ditolak`);
  check(stockOf(added.product!.id) === 15, 'stok tidak berubah oleh input tidak valid');

  console.log(failed ? `${failed} gagal` : 'semua lulus');
  app.exit(failed ? 1 : 0);
});
