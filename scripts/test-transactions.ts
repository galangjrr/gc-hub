// Checks transaction classification and cash totals against the notes the engine really writes.
import assert from 'node:assert/strict';
import { classifyTransaction, summarizeCash, txTimestamp, isoDayStart } from '../src/shared/transactions';

const rows = [
  { note: 'GCNET Sesi paket dimulai [paket: 2 Jam], [harga: 8.000]', price: 8000 },
  { note: 'GCNET Paket terbeli, [paket: 1 Jam], [harga: 4.000]', price: 4000 },
  { note: 'Pembayaran Sesi Pasca-Bayar [PC-01] - Selesai', price: 6500 },
  { note: 'Penjualan F&B Tunai (2 item) - PC-03', price: 15000 },
  { note: 'Penjualan F&B Potong Saldo (1 item) - PC-04', price: 7000 },
  { note: 'Top Up Saldo Member [Rp 50.000]', price: 50000 },
  { note: 'Pemakaian Saldo Member [budi] (60m) - Selesai', price: 5000 },
  { note: 'Refund Sisa Waktu [30m] - Penalti 0% (Tunai Kasir)', price: -2000 },
  { note: 'Batal Antrian Paket [1 Jam] - Refund 100% (Kredit Saldo Member)', price: -4000 },
  { note: 'GCNET Sesi paket dimulai [paket: Booking 3 Jam], [harga: 12.000] Lunas transfer online', price: 12000 },
  { note: 'Handover Shift: A -> B. Modal Kas: Rp 200.000 (Selisih: Rp 0).', price: 200000 },
];

assert.deepEqual(classifyTransaction(rows[0].note, 8000), { kind: 'billing', source: 'cash' });
assert.deepEqual(classifyTransaction(rows[4].note, 7000), { kind: 'fnb', source: 'balance' });
assert.deepEqual(classifyTransaction(rows[5].note, 50000), { kind: 'topup', source: 'cash' });
assert.deepEqual(classifyTransaction(rows[6].note, 5000), { kind: 'billing', source: 'balance' });
assert.deepEqual(classifyTransaction(rows[8].note, -4000), { kind: 'refund', source: 'balance' });
assert.deepEqual(classifyTransaction(rows[9].note, 12000), { kind: 'billing', source: 'transfer' });
assert.equal(classifyTransaction(rows[10].note, 200000).kind, 'handover');

const s = summarizeCash(rows);
assert.equal(s.billing, 18500);
assert.equal(s.fnb, 15000);
assert.equal(s.topup, 50000);
assert.equal(s.cashIn, 83500);
assert.equal(s.cashOut, 2000, 'refund to member balance is not drawer cash');
assert.equal(s.net, 81500);
assert.equal(s.fromBalance, 12000);
assert.equal(s.transfer, 12000, 'booking paid online is revenue outside the drawer');
assert.equal(s.count, 10, 'handover row is not a transaction');

assert.equal(txTimestamp('27/9/2026', '14:05:09'), new Date(2026, 8, 27, 14, 5, 9).getTime());
assert.equal(txTimestamp('bukan tanggal'), null);
assert.equal(txTimestamp('27/9/2026', '14.05.09'), new Date(2026, 8, 27, 14, 5, 9).getTime(), 'id-ID time uses dots');
assert.equal(isoDayStart('2026-09-27'), new Date(2026, 8, 27).getTime());
assert.equal(isoDayStart('27/9/2026'), null);

console.log('test-transactions: ok');
