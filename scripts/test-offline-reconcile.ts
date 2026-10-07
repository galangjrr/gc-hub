import { app } from 'electron';
import { DbService } from '../src/server/db/dbService';
import { BillingEngine } from '../src/server/engine/billingEngine';

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
  BillingEngine.stop();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  app.exit(failed ? 1 : 0);
}

app.whenReady().then(run).catch(err => { console.error(err); app.exit(1); });
