import { app } from 'electron';
import { eq } from 'drizzle-orm';
import { db } from '../src/server/db/index';
import * as schema from '../src/server/db/schema';
import { DbService } from '../src/server/db/dbService';
import { hashPassword, verifyPassword } from '../src/server/db/password';

let failed = 0;
function assert(condition: boolean, name: string) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failed++;
}

async function run() {
  await DbService.init();

  const h = hashPassword('rahasia1');
  assert(h.startsWith('scrypt$') && !h.includes('rahasia1'), 'hash tidak menyimpan plaintext');
  assert(verifyPassword('rahasia1', h).ok, 'password benar lolos');
  assert(!verifyPassword('salah', h).ok, 'password salah ditolak');
  assert(verifyPassword('lama', 'lama').needsRehash, 'plaintext lama lolos dan minta rehash');

  const uname = `tpw_${Date.now()}`;
  let threw = false;
  try { DbService.createMember({ username: uname + 'x', password: '12' }); } catch { threw = true; }
  assert(threw, 'member baru tanpa password valid ditolak');

  const m = DbService.createMember({ username: uname, password: 'kunci123', money: 10000 });
  assert(!DbService.verifyMemberLogin(uname, 'ngasal').success, 'login member password salah ditolak');
  assert(DbService.verifyMemberLogin(uname.toUpperCase(), 'kunci123').success, 'login member benar, username case-insensitive');

  // Member lama plaintext di-upgrade ke hash saat login sukses
  db.update(schema.userAccounts).set({ passwordHash: 'plain99' }).where(eq(schema.userAccounts.id, m.id)).run();
  assert(DbService.verifyMemberLogin(uname, 'plain99').success, 'member plaintext lama tetap bisa login');
  const row = db.select().from(schema.userAccounts).where(eq(schema.userAccounts.id, m.id)).get();
  assert(!!row?.passwordHash.startsWith('scrypt$'), 'password lama otomatis di-hash');

  // Member tanpa password ditolak
  db.update(schema.userAccounts).set({ passwordHash: '' }).where(eq(schema.userAccounts.id, m.id)).run();
  assert(!DbService.verifyMemberLogin(uname, '').success && !DbService.verifyMemberLogin(uname, 'apa').success, 'member tanpa password ditolak');

  // Employee
  const e = DbService.createEmployee({ name: `emp_${Date.now()}`, password: 'kasir1' });
  const erow = db.select().from(schema.employees).where(eq(schema.employees.id, e.employee!.id)).get();
  assert(!!erow?.passwordHash.startsWith('scrypt$'), 'password employee di-hash');
  assert(DbService.verifyEmployeeLogin({ username: e.employee!.name, password: 'kasir1' }).success, 'login employee benar');
  assert(!DbService.verifyEmployeeLogin({ username: e.employee!.name, password: 'x' }).success, 'login employee salah ditolak');

  DbService.deleteMember(m.id);
  DbService.deleteEmployee(e.employee!.id);
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  app.exit(failed ? 1 : 0);
}

app.whenReady().then(run).catch(err => { console.error(err); app.exit(1); });
