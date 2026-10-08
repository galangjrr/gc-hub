// Restore a backup from the app: stageRestore checks and prepares the file, the next start swaps it in.
// Phase 1 stages a restore, then starts this same script again as a second Electron process (phase 2)
// on the same database folder, which is exactly what a restart does.
import { app } from 'electron';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { sqlite, backupDatabase, listBackups, stageRestore, BACKUP_DIR } from '../src/server/db/index';

let failed = 0;
function assert(condition: boolean, name: string) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failed++;
}

const PENDING = path.join(process.env.GCHUB_DB_DIR || '', 'restore-pending.sqlite');
const setting = (key: string) => (sqlite.prepare('SELECT value FROM AppSettings WHERE key = ?').get(key) as { value: string } | undefined)?.value;

async function stage() {
  console.log('Tahap 1: siapkan pemulihan');
  sqlite.prepare('INSERT OR REPLACE INTO AppSettings (key, value) VALUES (?, ?)').run('restoreMarker', 'A');
  sqlite.prepare("INSERT INTO Workstations (pcId, name, state, currentUser, billingType, remainingSeconds) VALUES ('PC-R', 'PC-R', 'in_use', 'tamu', 'package', 1200)").run();
  const file = await backupDatabase(true);
  assert(!!file, 'backup sumber dibuat');
  const name = path.basename(file!);
  sqlite.prepare('UPDATE AppSettings SET value = ? WHERE key = ?').run('B', 'restoreMarker');

  assert(!(await stageRestore('../gcserver.sqlite', 'admin_tes')).success, 'nama dengan path ditolak');
  assert(!(await stageRestore('gcserver-2020-01-01.sqlite', 'admin_tes')).success, 'file yang tidak ada ditolak');
  fs.writeFileSync(path.join(BACKUP_DIR, 'gcserver-2020-01-02.sqlite'), 'bukan database');
  const corrupt = await stageRestore('gcserver-2020-01-02.sqlite', 'admin_tes');
  assert(!corrupt.success && !fs.existsSync(PENDING), `file rusak ditolak tanpa menyiapkan apa pun: ${corrupt.message}`);
  fs.rmSync(path.join(BACKUP_DIR, 'gcserver-2020-01-02.sqlite'), { force: true });

  const res = await stageRestore(name, 'admin_tes');
  assert(res.success && fs.existsSync(PENDING), `pemulihan disiapkan: ${res.message}`);
  assert(!fs.existsSync(`${PENDING}-wal`), 'file siap pakai tanpa -wal');
  const safety = listBackups().find(b => b.name === res.safetyBackup);
  assert(!!safety, `backup pengaman ada di daftar: ${res.safetyBackup}`);
  if (safety) {
    const copy = new Database(path.join(BACKUP_DIR, safety.name), { readonly: true });
    const v = (copy.prepare('SELECT value FROM AppSettings WHERE key = ?').get('restoreMarker') as { value: string }).value;
    copy.close();
    assert(v === 'B', 'backup pengaman berisi database sebelum dipulihkan');
  }
  assert(setting('restoreMarker') === 'B', 'database yang sedang jalan belum diganti sebelum restart');

  sqlite.close();
  console.log('Restart');
  const child = spawnSync(process.execPath, [process.argv[1]], {
    stdio: 'inherit',
    env: { ...process.env, GCHUB_RESTORE_PHASE: 'after-restart' }
  });
  assert(child.status === 0, 'tahap 2 lulus');
}

function verifyAfterRestart() {
  console.log('Tahap 2: setelah restart');
  assert(!fs.existsSync(PENDING), 'file pemulihan sudah dipasang');
  assert(setting('restoreMarker') === 'A', 'isi database kembali ke isi backup');
  const pc = sqlite.prepare("SELECT state, currentUser FROM Workstations WHERE pcId = 'PC-R'").get() as { state: string; currentUser: string | null };
  assert(pc.state === 'idle' && pc.currentUser === null, `sesi lama di backup tidak dilanjutkan: ${JSON.stringify(pc)}`);
  const log = sqlite.prepare("SELECT description FROM SystemLogs WHERE description LIKE 'admin_tes memulihkan%'").get();
  assert(!!log, 'pemulihan tercatat di log sistem');
}

app.whenReady().then(async () => {
  if (process.env.GCHUB_RESTORE_PHASE === 'after-restart') verifyAfterRestart();
  else await stage();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  app.exit(failed ? 1 : 0);
}).catch(err => { console.error(err); app.exit(1); });
