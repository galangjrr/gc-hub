// Log screen query: SystemLogs between two local dates, newest first, capped, invalid ranges refused.
import { app } from 'electron';
import { sqlite } from '../src/server/db/index';
import { DbService } from '../src/server/db/dbService';
import { isoDayStart } from '../src/shared/transactions';

let failed = 0;
const check = (cond: boolean, name: string, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${!cond && detail ? ` -> ${detail}` : ''}`);
  if (!cond) failed++;
};

app.whenReady().then(async () => {
  await DbService.init();
  const day = isoDayStart('2025-03-10')!;
  const insert = sqlite.prepare('INSERT INTO SystemLogs (eventTime, eventType, description, level) VALUES (?, 1, ?, ?)');
  insert.run(day - 1, 'uji: sehari sebelumnya', 0);
  insert.run(day, 'uji: tepat tengah malam', 0);
  insert.run(day + 12 * 3600_000, 'uji: siang', 1);
  insert.run(day + 24 * 3600_000 - 1, 'uji: sedetik sebelum ganti hari', 2);
  insert.run(day + 24 * 3600_000, 'uji: hari berikutnya', 0);

  const one = DbService.getSystemLogsRange('2025-03-10', '2025-03-10')!;
  const texts = one.rows.map(r => r.description);
  check(texts.join('|') === 'uji: sedetik sebelum ganti hari|uji: siang|uji: tepat tengah malam', 'satu hari, batas inklusif, terbaru dulu', texts.join('|'));
  check(one.rows[0].level === 2 && one.rows[1].level === 1 && !one.truncated, 'tingkat ikut terbaca, tidak terpotong');
  check(DbService.getSystemLogsRange('2025-03-09', '2025-03-11')!.rows.length === 5, 'rentang tiga hari');
  check(DbService.getSystemLogsRange('2025-03-11', '2025-03-10') === null, 'awal setelah akhir ditolak');
  check(DbService.getSystemLogsRange('kemarin', '2025-03-10') === null, 'tanggal rusak ditolak');

  const many = sqlite.prepare('INSERT INTO SystemLogs (eventTime, eventType, description, level) VALUES (?, 0, ?, 0)');
  sqlite.transaction(() => { for (let i = 0; i < 2100; i++) many.run(isoDayStart('2025-04-01')! + i, `uji massal ${i}`); })();
  const big = DbService.getSystemLogsRange('2025-04-01', '2025-04-01')!;
  check(big.truncated && big.rows.length === 2000 && big.rows[0].description === 'uji massal 2099', 'lebih dari batas: dipotong, yang terbaru tetap tampil');

  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  app.exit(failed ? 1 : 0);
}).catch(err => { console.error(err); app.exit(1); });
