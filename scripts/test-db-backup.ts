import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { backupDatabase, listBackups } from '../src/server/db/index';

app.whenReady().then(async () => {
  const first = await backupDatabase();
  const again = await backupDatabase();
  const dailyOk = (first === null || fs.statSync(first).size > 0) && again === null;
  console.log(dailyOk ? 'PASS backup harian dibuat sekali per tanggal' : `FAIL first=${first} again=${again}`);

  const manual = await backupDatabase(true);
  const listed = manual ? listBackups().find(b => b.name === path.basename(manual)) : undefined;
  const manualOk = !!manual && fs.statSync(manual).size > 0 && listed?.kind === 'manual' && listed.sizeBytes > 0
    && listBackups().some(b => b.kind === 'harian');
  console.log(manualOk ? 'PASS backup manual tersimpan dan muncul di daftar' : `FAIL manual=${manual} listed=${JSON.stringify(listed)}`);
  if (manual) fs.rmSync(manual, { force: true }); // jangan tinggalkan backup tes di PC dev

  app.exit(dailyOk && manualOk ? 0 : 1);
});
