import { app } from 'electron';
import { DbService } from '../src/server/db/dbService';
import { BillingEngine } from '../src/server/engine/billingEngine';

async function runStressTest() {
  console.log("=========================================");
  console.log("?? GCNET PERSONAL (POSTPAID) STRESS TEST");
  console.log("=========================================\n");

  await DbService.init();
  DbService.addWorkstation({ name: 'PC-STRESS', ip: '192.168.1.99', pricePerHour: 4000 });
  DbService.updateWorkstationState('PC-STRESS', 'idle', { username: null });

  // Mock network bridge
  const { ServerNetworkBridge } = require('../src/server/network/serverNetwork');
  ServerNetworkBridge.getConnectedClients = () => [{ pcId: 'PC-STRESS', pcName: 'PC-STRESS' }];

  BillingEngine.start();
  const pcId = 'PC-STRESS';

  // 1. Login Personal (Pascabayar)
  console.log("[TEST 1] Login Personal (Pascabayar/Open Time) Rp 4.000/Jam");
  let res = BillingEngine.startSession(pcId, { username: 'GuestPersonal', userType: 'guest', billingType: 'postpaid', pricePerHour: 4000 });
  console.log(`-> Hasil: ${res ? 'Berhasil' : 'Gagal'}`);
  let session = BillingEngine.getSession(pcId);
  console.log(`-> State: Sisa ${Math.ceil(session!.remainingSeconds / 60)}m | Elapsed: ${session!.elapsedSeconds}s\n`);

  // 2. Time Skip 30 Menit (Blok 1 Jam)
  console.log("[TEST 2] Time Skip: Main 30 Menit");
  session!.startTime = Date.now() - (30 * 60 * 1000);
  // Pancing tick manual untuk ngehitung totalCost secara live
  BillingEngine['tick'](); 
  console.log(`-> Tagihan Sementara (Blok Pembulatan 1 Jam): Rp ${session!.totalCost}\n`);

  // 3. Time Skip 65 Menit (Masuk jam ke-2)
  console.log("[TEST 3] Time Skip: Main 65 Menit (Masuk jam ke-2)");
  session!.startTime = Date.now() - (65 * 60 * 1000);
  BillingEngine['tick'](); 
  console.log(`-> Tagihan Sementara (Blok Pembulatan 2 Jam): Rp ${session!.totalCost}\n`);

  // 4. Ubah Sesi Personal ke Paket (Ubah ke Paket 2 Jam Rp 8000)
  console.log("[TEST 4] Ubah Sesi Personal ke Paket 2 Jam (Rp 8000)");
  let rep = BillingEngine.replacePackage(pcId, 120, 8000, 'Paket 2 Jam');
  console.log(`-> Hasil: ${rep.success ? 'Berhasil' : 'Gagal'} | Pesan: ${rep.message}`);
  session = BillingEngine.getSession(pcId);
  console.log(`-> State Baru: Billing Type: ${session!.billingType} | Sisa Waktu: ${Math.ceil(session!.remainingSeconds / 60)}m | Total Cost: Rp ${session!.totalCost}\n`);

  // 5. Time Skip lagi: 130 Menit (Harusnya habis / Stop Session)
  console.log("[TEST 5] Time Skip 130 Menit (Melampaui jatah 2 Jam)");
  session!.startTime = Date.now() - (130 * 60 * 1000);
  session!.remainingSeconds = 0; // Simulate expiration
  BillingEngine['tick']();
  
  const closedSession = BillingEngine.getSession(pcId);
  console.log(`-> Sesi PC-STRESS masih aktif? ${closedSession ? 'Ya' : 'Tidak (Dihentikan Otomatis)'}\n`);

  console.log("--- BUKTI PENCATATAN TRANSAKSI (DB SQLITE) ---");
  const txs = DbService.getTransactions(10);
  txs.forEach((tx, i) => {
    console.log(`${i+1}. [${tx.time}] Uang Masuk: Rp ${tx.price} | Durasi: ${tx.timeUsed} | Ket: ${tx.note}`);
  });
  console.log("----------------------------------------------\n");

  DbService.deleteWorkstation('PC-STRESS');
  console.log("=========================================");
  console.log("? STRESS TEST PERSONAL SELESAI");
  console.log("=========================================\n");

  process.exit(0);
}

app.whenReady().then(runStressTest);
