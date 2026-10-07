import { app } from 'electron';
import { DbService } from '../src/server/db/dbService';
import { BillingEngine } from '../src/server/engine/billingEngine';

async function runStressTest() {
  console.log("=========================================");
  console.log("?? GCNET BILLING ENGINE STRESS TEST");
  console.log("=========================================\n");

  // 1. Initialize
  await DbService.init();
  
  // Seed Workstation
  DbService.addWorkstation({ name: 'PC-STRESS', ip: '192.168.1.99', pricePerHour: 4000 });
  DbService.updateWorkstationState('PC-STRESS', 'idle', { username: null });

  BillingEngine.start();

  const pcId = 'PC-STRESS';

  // 2. Tembak pake paket Tambah Waktu buat Login (Harus Gagal)
  console.log("[TEST 1] Coba Login pakai Paket Tambahan (10 Menit, Rp 1000)");
  let res = BillingEngine.startSession(pcId, { username: 'GuestStress', userType: 'guest', durationMinutes: 10, price: 1000, packageName: 'Tambah 10m', isExtensionOnly: true });
  console.log(`-> Hasil: ${res.success ? 'Berhasil' : 'Gagal'} | Pesan: ${res.message}\n`);

  // 3. Login Normal 1 Jam (Rp 4000)
  console.log("[TEST 2] Login Normal Paket 1 Jam (60 Menit, Rp 4000)");
  res = BillingEngine.startSession(pcId, { username: 'GuestStress', userType: 'guest', durationMinutes: 60, price: 4000, packageName: 'Paket 1 Jam', isExtensionOnly: false });
  console.log(`-> Hasil: ${res.success ? 'Berhasil' : 'Gagal'}`);
  let session = BillingEngine.getSession(pcId);
  console.log(`-> State: Sisa ${Math.ceil(session!.remainingSeconds / 60)}m | Total Harga: Rp ${session!.totalCost}\n`);

  // 4. Time Skip 45 Menit
  console.log("[TEST 3] Time Skip: Main 45 Menit (Sisa 15 Menit)");
  session!.elapsedSeconds = 45 * 60;
  session!.remainingSeconds = 15 * 60;
  console.log(`-> State: Terpakai ${Math.floor(session!.elapsedSeconds / 60)}m | Sisa ${Math.ceil(session!.remainingSeconds / 60)}m\n`);

  // 5. Ganti Paket ke 2 Jam (Rp 8000)
  console.log("[TEST 4] Ganti Paket (Upgrade) ke 2 Jam (120 Menit, Rp 8000)");
  res = BillingEngine.replacePackage(pcId, 120, 8000, 'Paket 2 Jam');
  console.log(`-> Hasil: ${res.success ? 'Berhasil' : 'Gagal'} | Pesan: ${res.message}`);
  session = BillingEngine.getSession(pcId);
  console.log(`-> State Baru: Sisa Waktu Aktif: ${Math.ceil(session!.remainingSeconds / 60)}m | Total Bayar Kasir: Rp ${session!.totalCost}\n`);

  // 6. Time Skip Total 90 Menit
  console.log("[TEST 5] Time Skip lagi: Total Main 90 Menit");
  session!.elapsedSeconds = 90 * 60;
  session!.remainingSeconds = 30 * 60;
  console.log(`-> State: Terpakai ${Math.floor(session!.elapsedSeconds / 60)}m | Sisa ${Math.ceil(session!.remainingSeconds / 60)}m\n`);

  // 7. Ganti Paket ke 1 Jam (Downgrade Nabrak Batas)
  console.log("[TEST 6] Ganti Paket (Downgrade) ke 1 Jam (60 Menit, Rp 4000)");
  res = BillingEngine.replacePackage(pcId, 60, 4000, 'Paket 1 Jam');
  console.log(`-> Hasil: ${res.success ? 'Berhasil' : 'Gagal'} | Pesan: ${res.message}`);
  session = BillingEngine.getSession(pcId);
  console.log(`-> State: Harga tetap Rp ${session!.totalCost} | Sisa Waktu tetap ${Math.ceil(session!.remainingSeconds / 60)}m\n`);

  // 8. Tumpuk Paket (Add Stacked)
  console.log("[TEST 7] Tambah Waktu 30 Menit (Rp 2000) & Tambah 1 Jam (Rp 4000)");
  BillingEngine.addStackedPackage(pcId, 30, 2000, 'Tambah 30m');
  console.log(`-> Tambah 30m: Berhasil`);
  BillingEngine.addStackedPackage(pcId, 60, 4000, 'Paket 1 Jam');
  console.log(`-> Tambah 1 Jam: Berhasil`);
  session = BillingEngine.getSession(pcId);
  console.log(`-> Total Bayar Sekarang: Rp ${session!.totalCost}`);
  console.log(`-> Jumlah Antrean Paket: ${session!.stackedPackages?.length || 0}`);
  
  if (session!.stackedPackages) {
    session!.stackedPackages.forEach((p, i) => {
      console.log(`   - Antrean ${i+1}: [${p.name}] ${p.minutesFormatted} (Rp ${p.price}) | Status: ${p.status}`);
    });
  }
  console.log("\n");

  console.log("--- BUKTI PENCATATAN TRANSAKSI (DB SQLITE) ---");
  const txs = DbService.getTransactions(10);
  txs.forEach((tx, i) => {
    console.log(`${i+1}. [${tx.time}] Uang Masuk: Rp ${tx.price} | Durasi: ${tx.timeUsed} | Ket: ${tx.note}`);
  });
  console.log("----------------------------------------------\n");

  DbService.deleteWorkstation('PC-STRESS');

  console.log("=========================================");
  console.log("? STRESS TEST SELESAI TANPA CRASH");
  console.log("=========================================\n");

  process.exit(0);
}

app.whenReady().then(runStressTest);
