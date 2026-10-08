import { app } from 'electron';
import { DbService } from '../src/server/db/dbService';
import { BillingEngine } from '../src/server/engine/billingEngine';
import { ServerNetworkBridge } from '../src/server/network/serverNetwork';

let failed = 0;
function assert(condition: boolean, name: string) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failed++;
}

async function run() {
  await DbService.init();
  BillingEngine.start();

  const pc = 'PC-TEST-OFFLINE';
  DbService.addWorkstation({ name: pc, ip: '192.168.1.250', pricePerHour: 4000 });
  BillingEngine.startSession(pc, { username: 'guest_off', billingType: 'package', durationMinutes: 60, price: 4000, packageName: 'Paket 1 Jam' });
  const s = BillingEngine.getSession(pc)!;
  const start0 = s.startTime;

  // Client memakai 600s saat server tidak menghitung (disconnect)
  BillingEngine.reconcileClientSnapshot(pc, { username: 'guest_off', elapsedSeconds: s.elapsedSeconds + 600, remainingSeconds: 3000 });
  assert(s.elapsedSeconds === 600, 'elapsed bertambah 600s');
  assert(start0 - s.startTime === 600_000, 'startTime digeser mundur 600s');

  // Snapshot palsu dengan elapsed lebih kecil tidak boleh mengembalikan waktu
  BillingEngine.reconcileClientSnapshot(pc, { username: 'guest_off', elapsedSeconds: 0, remainingSeconds: 3600 });
  assert(s.elapsedSeconds === 600, 'snapshot lebih kecil diabaikan');

  // Username beda diabaikan
  BillingEngine.reconcileClientSnapshot(pc, { username: 'orang_lain', elapsedSeconds: 99999 });
  assert(s.elapsedSeconds === 600, 'username beda diabaikan');

  // Input rusak diabaikan
  BillingEngine.reconcileClientSnapshot(pc, { username: 'guest_off', elapsedSeconds: NaN });
  assert(s.elapsedSeconds === 600, 'NaN diabaikan');

  // Logout saat offline menutup sesi di server
  BillingEngine.reconcileClientSnapshot(pc, { username: 'guest_off', elapsedSeconds: 700, ended: true });
  assert(BillingEngine.getSession(pc) === undefined, 'snapshot ended menutup sesi');

  BillingEngine.deleteWorkstation(pc);

  // Pemakaian offline melewati paket aktif: kelebihannya memotong paket antrian, bukan hilang
  console.log('Overflow offline ke paket antrian');
  const pc2 = 'PC-TEST-STACK';
  DbService.setSetting('allowStackedPackages', 'true');
  DbService.addWorkstation({ name: pc2, ip: '192.168.1.251', pricePerHour: 4000 });
  BillingEngine.startSession(pc2, { username: 'guest_stack', billingType: 'package', durationMinutes: 60, price: 4000, packageName: 'Paket A' });
  BillingEngine.addStackedPackage(pc2, 60, 4000, 'Paket B');
  BillingEngine.addStackedPackage(pc2, 60, 4000, 'Paket C');
  const s2 = BillingEngine.getSession(pc2)!;
  // Tick hanya menghitung PC yang tersambung; anggap client ini online
  (ServerNetworkBridge as any).getConnectedClients = () => [{ pcId: pc2, pcName: pc2 }];
  const tick = () => (BillingEngine as any).tick(false);

  // 90 menit dipakai saat server tidak menghitung: A habis, B terpakai 30 menit
  BillingEngine.reconcileClientSnapshot(pc2, { username: 'guest_stack', elapsedSeconds: 5400 });
  tick();
  assert(s2.packageName === 'Paket B', `paket B aktif: ${s2.packageName}`);
  assert(Math.abs(s2.elapsedSeconds - 1800) <= 1, `B sudah terpakai 30 menit: ${s2.elapsedSeconds}`);
  assert(Math.abs(s2.remainingSeconds - 1800) <= 1, `sisa B 30 menit: ${s2.remainingSeconds}`);
  assert(s2.stackedPackages!.filter(p => p.status === 'Not Used').length === 1, 'C masih antri');

  // Lompat dua paket sekaligus: sisa B 30 menit + C 60 menit, offline 100 menit = 10 menit lewat semua
  BillingEngine.reconcileClientSnapshot(pc2, { username: 'guest_stack', elapsedSeconds: s2.elapsedSeconds + 6000 });
  tick();
  assert(s2.packageName === 'Paket C', `paket C aktif setelah lompat B: ${s2.packageName}`);
  assert(s2.remainingSeconds === 0, `C juga habis: ${s2.remainingSeconds}`);
  assert(s2.stackedPackages!.every(p => p.status !== 'Not Used'), 'antrian kosong');
  tick();
  assert(BillingEngine.getSession(pc2) === undefined, 'semua paket habis, sesi auto-cutoff');
  BillingEngine.deleteWorkstation(pc2);

  // Durasi pause paket lama tidak boleh memberi waktu gratis di paket berikutnya
  console.log('Pause tidak terbawa ke paket antrian');
  const pc3 = 'PC-TEST-PAUSE';
  DbService.addWorkstation({ name: pc3, ip: '192.168.1.252', pricePerHour: 4000 });
  BillingEngine.startSession(pc3, { username: 'guest_pause', billingType: 'package', durationMinutes: 60, price: 4000, packageName: 'Paket A' });
  BillingEngine.addStackedPackage(pc3, 60, 4000, 'Paket B');
  const s3 = BillingEngine.getSession(pc3)!;
  s3.pausedDurationMs = 20 * 60 * 1000; // pernah dijeda 20 menit
  s3.startTime = Date.now() - (60 + 20) * 60 * 1000 - 120 * 1000; // A lewat 2 menit
  (ServerNetworkBridge as any).getConnectedClients = () => [{ pcId: pc3, pcName: pc3 }];
  tick();
  assert(s3.packageName === 'Paket B', 'paket B aktif');
  assert(s3.pausedDurationMs === 0, 'durasi pause direset');
  assert(Math.abs(s3.elapsedSeconds - 120) <= 1, `2 menit lebih dari A terpotong di B: ${s3.elapsedSeconds}`);
  tick();
  assert(Math.abs(s3.elapsedSeconds - 120) <= 1, `tick berikutnya tetap jalan dari 2 menit, bukan beku: ${s3.elapsedSeconds}`);
  BillingEngine.stopSession(pc3, 'tes selesai');
  BillingEngine.deleteWorkstation(pc3);

  BillingEngine.stop();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  app.exit(failed ? 1 : 0);
}

app.whenReady().then(run).catch(err => { console.error(err); app.exit(1); });
