import { app } from 'electron';
import { DbService } from '../src/server/db/dbService';
import { BillingEngine } from '../src/server/engine/billingEngine';
import { isPackageOnSale } from '../src/shared/packageRules';
import type { BillingPackage } from '../src/shared/types';

let failed = 0;
const check = (cond: boolean, name: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) failed++;
};

const at = (hh: number, mm = 0) => new Date(2026, 8, 27, hh, mm);
const night = { category: 'Happy Hour', happyHourStart: '22:00', happyHourEnd: '06:00' };
const morning = { category: 'Happy Hour', happyHourStart: '06:00', happyHourEnd: '12:00' };

// Window logic, including one that crosses midnight
check(isPackageOnSale(night, at(23)) && isPackageOnSale(night, at(5, 59)) && isPackageOnSale(night, at(22)), 'malam 22-06: dijual 22.00, 23.00, 05.59');
check(!isPackageOnSale(night, at(6)) && !isPackageOnSale(night, at(12)) && !isPackageOnSale(night, at(21, 59)), 'malam 22-06: tidak dijual 06.00, 12.00, 21.59');
check(isPackageOnSale(morning, at(6)) && isPackageOnSale(morning, at(11, 59)) && !isPackageOnSale(morning, at(12)) && !isPackageOnSale(morning, at(5, 59)), 'pagi 06-12: batas awal ikut, batas akhir tidak');
check(isPackageOnSale({ category: 'Happy Hour', happyHourStart: '10:00', happyHourEnd: '10:00' }, at(3)), 'jam mulai sama dengan selesai: dijual seharian');
check(isPackageOnSale({ category: 'Jam', happyHourStart: '22:00', happyHourEnd: '06:00' }, at(12)), 'paket non Happy Hour mengabaikan jam');
check(isPackageOnSale({ category: 'Happy Hour', happyHourStart: 'abc', happyHourEnd: '' }, at(12)), 'jam rusak tidak memblokir penjualan');

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const shift = (hours: number) => new Date(Date.now() + hours * 3600_000);

app.whenReady().then(async () => {
  await DbService.init();
  const base = DbService.getPackages();
  const packages: BillingPackage[] = [
    ...base,
    { id: 'hh-open', name: 'HH Sedang Buka', time: '2j 0m', minutes: 120, price: 5000, category: 'Happy Hour', happyHourStart: hhmm(shift(-1)), happyHourEnd: hhmm(shift(1)) },
    { id: 'ext-30', name: 'Tambah 30 Menit', time: '30m', minutes: 30, price: 2000, category: 'Tambah Waktu', isExtensionOnly: true },
    { id: 'hh-closed', name: 'HH Sedang Tutup', time: '2j 0m', minutes: 120, price: 5000, category: 'Happy Hour', happyHourStart: hhmm(shift(2)), happyHourEnd: hhmm(shift(3)) },
  ];
  DbService.savePackages(packages);

  for (const pc of ['PC-HH-1', 'PC-HH-2', 'PC-HH-3']) DbService.addWorkstation({ name: pc, ip: '10.0.0.1' });

  const startClosed = BillingEngine.startSession('PC-HH-1', { username: 'tamu', billingType: 'package', durationMinutes: 120, price: 5000, packageName: 'HH Sedang Tutup' });
  check(startClosed === false && !BillingEngine.getSession('PC-HH-1'), 'engine: mulai sesi dengan Happy Hour di luar jam ditolak');

  const startOpen = BillingEngine.startSession('PC-HH-2', { username: 'tamu', billingType: 'package', durationMinutes: 120, price: 5000, packageName: 'HH Sedang Buka' });
  check(startOpen === true, 'engine: mulai sesi dengan Happy Hour di dalam jam diterima');

  const stackClosed = BillingEngine.addStackedPackage('PC-HH-2', 120, 5000, 'HH Sedang Tutup');
  const queued = () => (BillingEngine.getSession('PC-HH-2')?.stackedPackages || []).filter(p => p.status === 'Not Used').length;
  check(!stackClosed.success && /hanya dijual pukul/.test(stackClosed.message) && queued() === 0, 'engine: tambah paket di luar jam ditolak dengan pesan jam jual');

  const stackOpen = BillingEngine.addStackedPackage('PC-HH-2', 120, 5000, 'HH Sedang Buka');
  check(stackOpen.success && queued() === 1, 'engine: tambah paket di dalam jam masuk antrian');

  const replaceClosed = BillingEngine.replacePackage('PC-HH-2', 180, 7000, 'HH Sedang Tutup');
  check(!replaceClosed.success && /hanya dijual pukul/.test(replaceClosed.message), 'engine: ganti ke paket di luar jam ditolak');

  const startExt = BillingEngine.startSession('PC-HH-3', { username: 'tamu', billingType: 'package', durationMinutes: 30, price: 2000, packageName: 'Tambah 30 Menit' });
  check(startExt === false, 'engine: paket khusus tambah waktu tetap tidak bisa membuka sesi');

  const custom = BillingEngine.startSession('PC-HH-3', { username: 'tamu', billingType: 'package', durationMinutes: 30, price: 2000, packageName: 'Voucher Lepas' });
  check(custom === true, 'engine: nama di luar katalog (voucher) tidak diblokir');

  BillingEngine.stop();
  console.log(failed ? `${failed} gagal` : 'semua lulus');
  app.exit(failed ? 1 : 0);
});
