// Global billing rules from Pengaturan > Tarif > Aturan Billing, checked against the real engine.
import { app } from 'electron';
import { DbService } from '../src/server/db/dbService';
import { BillingEngine } from '../src/server/engine/billingEngine';
import { ServerNetworkBridge } from '../src/server/network/serverNetwork';
import { classifyTransaction } from '../src/shared/transactions';

let failed = 0;
const check = (cond: boolean, name: string, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${!cond && detail ? ` -> ${detail}` : ''}`);
  if (!cond) failed++;
};

const live = (pc: string) => BillingEngine.getLiveWorkstations().find(w => w.name === pc);
const halfHourRate = { firstHourPrice: 4000, nextHoursPrice: 3500, accumulationMinutes: 30, name: 'Uji 30m' };
let n = 0;
const newPc = () => {
  const name = `PC-RULE-${++n}`;
  DbService.addWorkstation({ name, ip: `10.0.1.${n}` });
  return name;
};

app.whenReady().then(async () => {
  await DbService.init();

  // --- Pembulatan kasir ---
  for (const [step, expected] of [['100', 5800], ['500', 6000], ['1000', 6000]] as const) {
    DbService.setSetting('cashierRoundingStep', step);
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'postpaid', rateConfig: halfHourRate });
    BillingEngine.simulateSessionElapsed(pc, 61);
    const shown = live(pc)?.personalBill?.total;
    BillingEngine.stopSession(pc, 'Selesai');
    const held = BillingEngine.findUnpaidWorkstation(pc)?.unpaidAmount;
    check(shown === expected && held === expected, `pembulatan ${step}: tagihan 61 menit tampil dan ditahan Rp ${expected}`, `tampil=${shown} ditahan=${held}`);
  }
  DbService.setSetting('cashierRoundingStep', 'rusak');
  {
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'postpaid', rateConfig: halfHourRate });
    BillingEngine.simulateSessionElapsed(pc, 61);
    check(live(pc)?.personalBill?.total === 5800, 'pembulatan rusak jatuh ke Rp 100');
    BillingEngine.stopSession(pc, 'Selesai', 0, true);
  }

  // Refund cash rounds down to the step
  for (const [step, expected] of [['100', 2700], ['1000', 2000]] as const) {
    DbService.setSetting('cashierRoundingStep', step);
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'package', durationMinutes: 60, price: 4000, pricePerHour: 4000, packageName: 'Uji 1 Jam' });
    BillingEngine.simulateSessionElapsed(pc, 1); // 59 menit sisa x Rp 66,67 x 70% = Rp 2.753
    const res = BillingEngine.refundSession(pc, { penaltyPercent: 30 });
    check(res.success && res.refundAmount === expected, `refund pembulatan ${step}: Rp 2.753 jadi Rp ${expected}`, JSON.stringify(res));
  }

  // --- Penalti refund 0% berarti refund penuh, bukan jatuh ke 50% ---
  DbService.setSetting('cashierRoundingStep', '100');
  for (const [setting, expected] of [['0', 3900], ['50', 1900], ['', 1900]] as const) {
    DbService.setSetting('refundPenaltyPercent', setting);
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'package', durationMinutes: 60, price: 4000, pricePerHour: 4000, packageName: 'Uji 1 Jam' });
    BillingEngine.simulateSessionElapsed(pc, 1);
    const res = BillingEngine.refundSession(pc, {});
    check(res.success && res.refundAmount === expected, `penalti tersimpan "${setting}": refund Rp ${expected}`, JSON.stringify(res));
  }

  // --- Refund hanya dari uang yang benar-benar dibayar ---
  DbService.setSetting('refundPenaltyPercent', '0');
  {
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'member_uji', userType: 'member', billingType: 'member', durationMinutes: 120, price: 0, pricePerHour: 4000 });
    BillingEngine.simulateSessionElapsed(pc, 10);
    const res = BillingEngine.refundSession(pc, { customAmount: 5000 });
    check(!res.success && !!BillingEngine.getSession(pc), 'refund sesi saldo member ditolak, sesi tetap jalan', JSON.stringify(res));
  }
  {
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'package', durationMinutes: 120, price: 0, pricePerHour: 4000, packageName: 'Voucher Gratis' });
    const res = BillingEngine.refundSession(pc, {});
    check(!res.success && /tidak dibayar/.test(res.message), 'refund sesi gratis ditolak (tidak ada uang yang masuk)', JSON.stringify(res));
  }
  {
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'package', durationMinutes: 60, price: 4000, pricePerHour: 4000, packageName: 'Uji 1 Jam' });
    const res = BillingEngine.refundSession(pc, { customAmount: 99999 });
    check(res.success && res.refundAmount === 4000, 'refund dibatasi uang yang dibayar: minta Rp 99.999 jadi Rp 4.000', JSON.stringify(res));
  }
  {
    DbService.setSetting('allowStackedPackages', 'true');
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'package', durationMinutes: 60, price: 4000, pricePerHour: 4000, packageName: 'Uji 1 Jam' });
    BillingEngine.addStackedPackage(pc, 60, 4000, 'Antrian');
    const res = BillingEngine.refundSession(pc, { refundMode: 'queued_only', customAmount: 8000 });
    const s = BillingEngine.getSession(pc)!;
    check(res.success && res.refundAmount === 4000 && s.remainingSeconds === 3600 && s.totalCost === 4000,
      'batal antrian: refund maksimal harga antrian, sisa paket aktif tidak ikut terpotong', JSON.stringify({ res, rem: s.remainingSeconds, cost: s.totalCost }));
  }
  {
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'package', durationMinutes: 60, price: 4000, pricePerHour: 4000, packageName: 'Uji 1 Jam' });
    BillingEngine.addStackedPackage(pc, 60, 4000, 'Antrian');
    BillingEngine.simulateSessionElapsed(pc, 30);
    const res = BillingEngine.refundSession(pc, {});
    check(res.success && res.refundAmount === 6000, 'refund penuh dengan antrian: sisa 30 menit aktif Rp 2.000 + antrian Rp 4.000', JSON.stringify(res));
  }
  DbService.setSetting('refundPenaltyPercent', '50');

  // --- Paket bertumpuk ---
  const queued = (pc: string) => (BillingEngine.getSession(pc)?.stackedPackages || []).filter(p => p.status === 'Not Used').length;
  DbService.setSetting('allowStackedPackages', 'true');
  {
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'package', durationMinutes: 60, price: 4000, packageName: 'Uji 1 Jam' });
    const res = BillingEngine.addStackedPackage(pc, 60, 4000, 'Uji Tambah');
    const s = BillingEngine.getSession(pc)!;
    check(res.success && queued(pc) === 1 && s.initialTotalSeconds === 3600, 'stacking nyala: paket kedua masuk antrian, paket aktif tetap 60 menit');
  }
  DbService.setSetting('allowStackedPackages', 'false');
  {
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'package', durationMinutes: 60, price: 4000, packageName: 'Uji 1 Jam' });
    BillingEngine.simulateSessionElapsed(pc, 10);
    const res = BillingEngine.addStackedPackage(pc, 30, 2000, 'Uji Tambah');
    const s = BillingEngine.getSession(pc)!;
    const w = live(pc)!;
    check(res.success && queued(pc) === 0 && s.initialTotalSeconds === 90 * 60 && s.remainingSeconds === 80 * 60 && s.totalCost === 6000,
      'stacking mati: 30 menit langsung digabung ke paket aktif, biaya ikut', JSON.stringify({ q: queued(pc), init: s.initialTotalSeconds, rem: s.remainingSeconds, cost: s.totalCost }));
    check(w.remainingSeconds === 80 * 60, 'stacking mati: kartu PC langsung menampilkan sisa 80 menit', String(w.remainingSeconds));
  }
  {
    // Antrian lama tetap jalan kalau setting dimatikan belakangan; tambahan baru digabung ke paket yang berjalan
    DbService.setSetting('allowStackedPackages', 'true');
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'package', durationMinutes: 60, price: 4000, packageName: 'Uji 1 Jam' });
    BillingEngine.addStackedPackage(pc, 60, 4000, 'Antrian Lama');
    DbService.setSetting('allowStackedPackages', 'false');
    BillingEngine.addStackedPackage(pc, 30, 2000, 'Uji Tambah');
    const running = BillingEngine.getSession(pc)!.stackedPackages!.find(p => p.status === 'In Use')!;
    check(queued(pc) === 1 && running.minutes === 90 && running.price === 6000, 'stacking dimatikan belakangan: antrian lama utuh, paket berjalan jadi 90 menit');
  }
  DbService.setSetting('allowStackedPackages', 'true');

  // --- Sesi personal (pascabayar) tidak menerima paket ---
  for (const stacking of ['true', 'false']) {
    DbService.setSetting('allowStackedPackages', stacking);
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'postpaid', rateConfig: halfHourRate });
    const before = { ...BillingEngine.getSession(pc)! };
    const add = BillingEngine.addStackedPackage(pc, 60, 4000, 'Uji Tambah');
    const ext = BillingEngine.extendSession(pc, 30, 2000);
    const rep = BillingEngine.replacePackage(pc, 120, 7000, 'Uji Ganti');
    const s = BillingEngine.getSession(pc)!;
    check(!add.success && !ext.success && !rep.success && /tarif personal/.test(add.message)
      && s.totalCost === before.totalCost && s.initialTotalSeconds === before.initialTotalSeconds && !(s.stackedPackages || []).length,
      `pascabayar (antrian ${stacking === 'true' ? 'nyala' : 'mati'}): tambah, perpanjang, dan ganti paket ditolak tanpa mengubah sesi`);
  }
  DbService.setSetting('allowStackedPackages', 'true');

  // --- Toleransi auto-cutoff ---
  // tick() only counts PCs whose client is connected, so pretend every test PC is online.
  (ServerNetworkBridge as any).getConnectedClients = () => DbService.getWorkstations().map(w => ({ pcId: w.name, pcName: w.name }));
  const tick = () => (BillingEngine as any).tick(false);
  for (const grace of ['0', '30']) {
    DbService.setSetting('autoCutoffToleranceSec', grace);
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'package', durationMinutes: 1, price: 1000, packageName: 'Uji 1 Menit' });
    BillingEngine.simulateSessionElapsed(pc, 1); // tepat 00:00
    tick();
    const aliveAtZero = !!BillingEngine.getSession(pc);
    if (grace === '0') {
      check(!aliveAtZero, 'toleransi 0: PC langsung dikunci di 00:00');
      continue;
    }
    check(aliveAtZero && BillingEngine.getSession(pc)!.remainingSeconds === 0, 'toleransi 30: di 00:00 sesi masih jalan dengan sisa 0');
    BillingEngine.getSession(pc)!.startTime -= 29_000;
    tick();
    check(!!BillingEngine.getSession(pc), 'toleransi 30: lewat 29 detik masih jalan');
    BillingEngine.getSession(pc)!.startTime -= 1_000;
    tick();
    check(!BillingEngine.getSession(pc), 'toleransi 30: lewat 30 detik PC dikunci');
  }
  {
    DbService.setSetting('autoCutoffToleranceSec', '30');
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'package', durationMinutes: 1, price: 1000, packageName: 'Uji 1 Menit' });
    BillingEngine.addStackedPackage(pc, 30, 2000, 'Antrian');
    BillingEngine.simulateSessionElapsed(pc, 1);
    tick();
    const s = BillingEngine.getSession(pc);
    check(!!s && s.remainingSeconds === 30 * 60 && s.packageName === 'Antrian', 'toleransi tidak menunda paket antrian: langsung pindah ke paket berikutnya');
  }
  {
    DbService.setSetting('autoCutoffToleranceSec', '30');
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'member_uji', userType: 'member', billingType: 'member', durationMinutes: 1, price: 0, pricePerHour: 4000 });
    BillingEngine.simulateSessionElapsed(pc, 1);
    tick();
    check(!BillingEngine.getSession(pc), 'toleransi tidak berlaku untuk member: saldo tidak dipotong lewat 00:00');
  }
  DbService.setSetting('autoCutoffToleranceSec', '999');
  {
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'tamu', billingType: 'package', durationMinutes: 1, price: 1000, packageName: 'Uji 1 Menit' });
    BillingEngine.simulateSessionElapsed(pc, 1);
    BillingEngine.getSession(pc)!.startTime -= 60_000;
    tick();
    check(!BillingEngine.getSession(pc), 'toleransi dibatasi 60 detik walau tersimpan 999');
  }
  DbService.setSetting('autoCutoffToleranceSec', '0');

  // --- Booking lunas online: omzet, bukan uang laci ---
  {
    const pc = newPc();
    BillingEngine.startSession(pc, { username: 'booker_lunas', billingType: 'package', durationMinutes: 60, price: 4000, packageName: 'Booking Uji', paidOnline: true });
    const paidRow = DbService.getTransactions(20).find(r => r.username === 'booker_lunas');
    check(!!paidRow && classifyTransaction(paidRow.note, paidRow.price).source === 'transfer', 'booking lunas tercatat sebagai transfer', paidRow?.note);
    const pc2 = newPc();
    BillingEngine.startSession(pc2, { username: 'booker_tunai', billingType: 'package', durationMinutes: 60, price: 4000, packageName: 'Booking Uji' });
    const cashRow = DbService.getTransactions(20).find(r => r.username === 'booker_tunai');
    check(!!cashRow && classifyTransaction(cashRow.note, cashRow.price).source === 'cash', 'booking belum bayar tercatat tunai', cashRow?.note);
  }

  BillingEngine.stop();
  console.log(failed ? `${failed} gagal` : 'semua lulus');
  app.exit(failed ? 1 : 0);
});
