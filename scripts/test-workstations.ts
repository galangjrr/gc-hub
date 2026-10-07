// Adding PCs, client registration and the PC's member rate, checked against the real DB and engine.
import { app } from 'electron';
import { DbService } from '../src/server/db/dbService';
import { BillingEngine } from '../src/server/engine/billingEngine';
import { SystemService } from '../src/main/systemService';

let failed = 0;
const check = (cond: boolean, name: string, detail: unknown = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${!cond && detail !== '' ? ` -> ${JSON.stringify(detail)}` : ''}`);
  if (!cond) failed++;
};
const row = (name: string) => DbService.getWorkstations().find(w => w.name.toLowerCase() === name.toLowerCase());
const count = (name: string) => DbService.getWorkstations().filter(w => w.name.toLowerCase() === name.toLowerCase()).length;

app.whenReady().then(async () => {
  await DbService.init();

  // --- Tambah satu PC ---
  check(DbService.addWorkstation({ name: 'WS-A', ip: '192.168.1.300' }).success === false, 'IP tidak valid ditolak');
  check(DbService.addWorkstation({ name: 'WS-A', pricePerHour: 0 }).success === false, 'tarif 0 ditolak');
  check(DbService.addWorkstation({ name: 'WS-A', pricePerHour: 5000, groupName: 'VIP' }).success, 'PC tanpa IP diterima');
  check(row('WS-A')?.ip === '', 'IP kosong tetap kosong, tidak dikarang', row('WS-A')?.ip);
  check(row('WS-A')?.groupName === 'VIP' && row('WS-A')?.pricePerHour === 5000, 'grup dan tarif tersimpan', row('WS-A'));
  check(DbService.addWorkstation({ name: 'ws-a' }).success === false, 'nama kembar beda huruf ditolak');

  // --- Tambah rentang ---
  check(DbService.addWorkstationBatch('R-', 5, 2).success === false, 'rentang terbalik ditolak');
  check(DbService.addWorkstationBatch('R-', 1, 101).success === false, 'lebih dari 100 PC ditolak');
  check(DbService.addWorkstationBatch('!', 1, 3).success === false, 'awalan tidak valid ditolak');
  DbService.addWorkstation({ name: 'R-02' });
  const batch = DbService.addWorkstationBatch('R-', 1, 3, 'Area Reguler', 4500);
  check(batch.success && batch.added.join() === 'R-01,R-03' && batch.skipped.join() === 'R-02', 'rentang melewati nama yang sudah ada', batch);
  check(row('R-01')?.ip === '' && row('R-01')?.pricePerHour === 4500, 'rentang tanpa IP karangan', row('R-01'));
  const again = DbService.addWorkstationBatch('R-', 1, 3);
  check(!again.success && again.added.length === 0 && again.skipped.length === 3, 'rentang yang semuanya ada tidak sukses', again);

  // --- Client tersambung ---
  DbService.addWorkstation({ name: 'pc-77', pricePerHour: 6000 });
  DbService.upsertWorkstation('PC-77', 'PC-77', '10.0.0.77', 'AA:BB:CC:DD:EE:77');
  check(count('pc-77') === 1, 'client beda huruf tidak bikin baris kembar', count('pc-77'));
  check(row('PC-77')?.ip === '10.0.0.77' && row('PC-77')?.pricePerHour === 6000, 'IP diisi client, tarif PC tetap', row('PC-77'));

  // --- Tarif member PC bertahan setelah sesi ---
  BillingEngine.startSession('WS-A', { username: 'tamu', billingType: 'package', durationMinutes: 60, price: 0, pricePerHour: 3000, packageName: 'Uji' });
  check(row('WS-A')?.pricePerHour === 5000 && row('WS-A')?.sessionPricePerHour === 3000, 'sesi menulis tarif sesi, bukan tarif PC', row('WS-A'));
  (BillingEngine as any).activeSessions.clear();
  BillingEngine.resyncClient('WS-A');
  check(BillingEngine.getSession('WS-A')?.pricePerHour === 3000, 'pemulihan memakai tarif sesi', BillingEngine.getSession('WS-A')?.pricePerHour);
  BillingEngine.stopSession('WS-A', 'Uji selesai');
  check(row('WS-A')?.pricePerHour === 5000 && !row('WS-A')?.sessionPricePerHour, 'tarif PC tidak direset ke 4000 setelah sesi', row('WS-A'));

  // --- Ubah tarif dan grup PC ---
  const idOf = (name: string) => row(name)!.id;
  const bad = BillingEngine.updateWorkstationSettings([
    { id: idOf('R-01'), groupName: 'VIP', pricePerHour: 7000 },
    { id: idOf('R-03'), groupName: 'VIP', pricePerHour: 0 },
  ]);
  check(!bad.success && row('R-01')?.pricePerHour === 4500, 'satu baris salah, tidak ada yang tersimpan', { bad, r01: row('R-01') });
  check(!BillingEngine.updateWorkstationSettings([{ id: idOf('R-01'), groupName: '  ', pricePerHour: 5000 }]).success, 'grup kosong ditolak');
  check(!BillingEngine.updateWorkstationSettings([{ id: 999999, groupName: 'VIP', pricePerHour: 5000 }]).success, 'PC yang tidak ada ditolak');
  check(!BillingEngine.updateWorkstationSettings([]).success, 'daftar kosong ditolak');

  BillingEngine.startSession('R-03', { username: 'member_uji', userType: 'member', billingType: 'member', durationMinutes: 60, price: 0, pricePerHour: 4500 });
  const ok = BillingEngine.updateWorkstationSettings([
    { id: idOf('R-01'), groupName: ' VIP ', pricePerHour: 6500.4 },
    { id: idOf('R-03'), groupName: 'VIP', pricePerHour: 6500 },
  ]);
  check(ok.success && ok.updated === 2, 'dua PC diperbarui', ok);
  check(row('R-01')?.groupName === 'VIP' && row('R-01')?.pricePerHour === 6500, 'grup dirapikan dan tarif dibulatkan', row('R-01'));
  check(BillingEngine.getSession('R-03')?.pricePerHour === 4500, 'sesi yang jalan tetap memakai tarif awal', BillingEngine.getSession('R-03')?.pricePerHour);
  BillingEngine.stopSession('R-03', 'Uji selesai');
  check(row('R-03')?.pricePerHour === 6500, 'tarif baru bertahan setelah sesi berakhir', row('R-03'));

  // --- Wake-on-LAN ---
  const wol = await SystemService.sendWakeOnLan('00:00:00:00:00:00');
  check(!wol.success, 'WOL ke MAC placeholder ditolak', wol);

  BillingEngine.stop();
  console.log(failed ? `${failed} gagal` : 'semua lulus');
  app.exit(failed ? 1 : 0);
});
