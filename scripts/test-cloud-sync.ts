// Uji SupabaseSyncService dengan client Supabase palsu (tanpa jaringan).
import { app } from 'electron';
import { sqlite } from '../src/server/db/index';
import { DbService } from '../src/server/db/dbService';
import { SupabaseSyncService, cloudPcId, localPcName, type CloudRemoteCommand } from '../src/server/services/supabaseSyncService';
import type { Workstation } from '../src/shared/types';

let failed = 0;
function assert(condition: boolean, name: string) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failed++;
}

type Call = { table: string; op: string; values?: any; filters: any[][]; opts?: any };
const calls: Call[] = [];
let online = true;
let permanentFailOnce: string | null = null; // op tabel yang gagal permanen sekali
let cloudPcs: any[] = [];

function exec(state: Call) {
  if (state.table !== '__channel') calls.push(structuredClone(state));
  if (!online) return { data: null, error: { message: 'fetch failed' } };
  if (permanentFailOnce && `${state.table}.${state.op}` === permanentFailOnce) {
    permanentFailOnce = null;
    return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
  }
  if (state.op === 'select' && state.table === 'pcs') return { data: cloudPcs, error: null };
  return { data: [], error: null };
}

const fakeClient: any = {
  from(table: string) {
    const state: Call = { table, op: 'select', filters: [] };
    const b: any = {
      select() { return b; },
      insert(v: any) { state.op = 'insert'; state.values = v; return b; },
      update(v: any) { state.op = 'update'; state.values = v; return b; },
      upsert(v: any, o: any) { state.op = 'upsert'; state.values = v; state.opts = o; return b; },
      eq(c: string, v: any) { state.filters.push(['eq', c, v]); return b; },
      neq(c: string, v: any) { state.filters.push(['neq', c, v]); return b; },
      in(c: string, v: any) { state.filters.push(['in', c, v]); return b; },
      order() { return b; },
      limit() { return b; },
      then(resolve: any) { resolve(exec(state)); },
    };
    return b;
  },
  channel() {
    const ch: any = { on() { return ch; }, subscribe() { calls.push({ table: '__realtime', op: 'subscribe', filters: [] }); return ch; } };
    return ch;
  },
  removeChannel() {},
};

const ws = (name: string, state: Workstation['state'], remainingSeconds = 0): Workstation =>
  ({ id: 1, name, ip: '', mac: '', state, remainingSeconds, timeUsedMinutes: 0, moneyUsed: 0, groupName: 'Reguler' });

// Tunggu sampai semua flush (termasuk yang dipicu enqueue) selesai
const drain = async () => {
  for (let i = 0; i < 5; i++) {
    await SupabaseSyncService.flushOutbox();
    await new Promise(r => setTimeout(r, 10));
  }
};
const outbox = () => sqlite.prepare('SELECT kind, payload, attempts, dead FROM CloudOutbox ORDER BY id').all() as any[];

async function run() {
  await DbService.init();
  const originalLinks = DbService.getSetting('cloud_booking_sessions');
  DbService.setSetting('cloud_booking_sessions', '{}');

  // Helper id
  assert(cloudPcId('PC-01') === 'pc-01' && cloudPcId('05') === 'pc-05', 'cloudPcId memetakan nama lokal ke id cloud');
  assert(localPcName('pc-03', [{ name: 'PC-01' }, { name: 'PC-03' }]) === 'PC-03', 'localPcName memetakan id cloud ke nama lokal');

  // Startup: reset status basi SEBELUM subscribe realtime
  const connected = await SupabaseSyncService.init({ client: fakeClient, appVersion: '9.9.9', getOnlinePcs: () => 7 });
  sqlite.exec('DELETE FROM CloudOutbox');
  const resetIdx = calls.findIndex(c => c.table === 'pcs' && c.op === 'update' && c.values?.status === 'available');
  const subIdx = calls.findIndex(c => c.table === '__realtime');
  assert(connected && resetIdx >= 0 && resetIdx < subIdx, 'reset status PC terjadi sebelum subscribe realtime');
  const hb = calls.find(c => c.table === 'branches');
  assert(hb?.values?.online_pcs === 7 && hb?.values?.app_version === '9.9.9', 'heartbeat mengirim versi & jumlah PC online');
  assert(SupabaseSyncService.getStatus().online, 'status online setelah heartbeat sukses');

  // Diff status PC
  cloudPcs = [
    { id: 'pc-01', name: 'PC-01', status: 'available', expected_empty_time: null },
    { id: 'pc-02', name: 'PC-02', status: 'maintenance', expected_empty_time: null },
    { id: 'pc-09', name: 'PC-09', status: 'available', expected_empty_time: null },
  ];
  calls.length = 0;
  await SupabaseSyncService.syncWorkstations([ws('PC-01', 'in_use', 1800), ws('PC-02', 'idle'), ws('PC-03', 'idle')]);
  const writes = calls.filter(c => c.table === 'pcs' && c.op !== 'select');
  assert(writes.some(c => c.op === 'update' && c.filters[0][2] === 'pc-01' && c.values.status === 'occupied'), 'PC aktif dikirim occupied + jam selesai');
  assert(!writes.some(c => c.filters.some(f => f[2] === 'pc-02')), 'status maintenance dari web tidak ditimpa');
  assert(writes.some(c => c.op === 'insert' && c.values.id === 'pc-03'), 'PC baru ditambahkan ke cloud');
  assert(!calls.some(c => c.op === 'delete'), 'tidak pernah menghapus baris pcs (foto/spesifikasi aman)');

  const pc01Write = writes.find(c => c.filters[0]?.[2] === 'pc-01')!;
  cloudPcs[0] = { ...cloudPcs[0], status: 'occupied', expected_empty_time: pc01Write.values.expected_empty_time };
  cloudPcs.push({ id: 'pc-03', name: 'PC-03', status: 'available', expected_empty_time: null });
  calls.length = 0;
  await SupabaseSyncService.syncWorkstations([ws('PC-01', 'in_use', 1795), ws('PC-02', 'idle'), ws('PC-03', 'idle')]);
  assert(calls.filter(c => c.table === 'pcs' && c.op !== 'select').length === 0, 'sync kedua tanpa perubahan berarti = nol tulisan');

  // Filter echo realtime
  const commands: CloudRemoteCommand[] = [];
  SupabaseSyncService.setListeners({ onRemoteCommand: async cmd => { commands.push(cmd); return true; } });
  SupabaseSyncService.handlePcUpdate({ id: 'pc-01', name: 'PC-01', status: 'occupied', expected_empty_time: pc01Write.values.expected_empty_time });
  assert(commands.length === 0, 'pantulan tulisan GC Hub sendiri diabaikan');
  SupabaseSyncService.handlePcUpdate({ id: 'pc-01', name: 'PC-01', status: 'available', expected_empty_time: null });
  assert(commands.length === 1 && commands[0].command === 'stop_session' && commands[0].workstation_id === 'PC-01', 'stop dari web companion diteruskan jadi stop_session');
  SupabaseSyncService.handlePcUpdate({ id: 'pc-03', name: 'PC-03', status: 'available', expected_empty_time: null });
  assert(commands.length === 1, 'PC yang memang kosong tidak memicu stop');

  // Outbox saat offline, lalu online
  online = false;
  SupabaseSyncService.recordSessionLog({ playerName: 'Budi', pcName: 'PC-01', paketName: 'Paket 1 Jam', price: 4000, startTime: '2026-09-24T10:00:00.000Z', endTime: '2026-09-24T11:00:00.000Z', status: 'Selesai' });
  await drain();
  let rows = outbox();
  assert(rows.length === 1 && rows[0].attempts === 1, 'offline: log tetap di outbox dengan percobaan tercatat');
  assert(SupabaseSyncService.getStatus().pendingOutbox === 1, 'status menampilkan 1 item menunggu');

  online = true;
  sqlite.exec('UPDATE CloudOutbox SET nextAttemptAt = 0');
  calls.length = 0;
  await drain();
  const logUpsert = calls.find(c => c.table === 'logs');
  assert(outbox().length === 0 && logUpsert?.opts?.ignoreDuplicates === true && logUpsert.values[0].id === `log-hub-${Date.parse('2026-09-24T10:00:00.000Z')}-pc-01`, 'online: log terkirim dengan id stabil (retry tidak dobel)');

  // Urutan booking: active -> completed, pindah PC sebelum status
  online = false;
  SupabaseSyncService.markBookingStarted('bk_one', 'PC-03', 'pc-03', 'pc-01');
  assert(SupabaseSyncService.isBookingLinked('bk_one'), 'booking tertaut ke PC (tersimpan di SQLite)');
  assert(SupabaseSyncService.markSessionEnded('PC-03') === 'bk_one' && !SupabaseSyncService.isBookingLinked('bk_one'), 'sesi selesai melepas tautan booking');
  online = true;
  sqlite.exec('UPDATE CloudOutbox SET nextAttemptAt = 0');
  calls.length = 0;
  await drain();
  const bookingOps = calls.filter(c => c.table === 'bookings').map(c => c.values.pc_id ? `pc:${c.values.pc_id}` : c.values.status);
  assert(bookingOps.join(',') === 'pc:pc-03,active,completed', `urutan kirim terjaga: ${bookingOps.join(',')}`);

  // Booking lama di PC yang sama diselesaikan otomatis
  calls.length = 0;
  SupabaseSyncService.markBookingStarted('bk_a', 'PC-01', 'pc-01', 'pc-01');
  SupabaseSyncService.markBookingStarted('bk_b', 'PC-01', 'pc-01', 'pc-01');
  await drain();
  const seq = calls.filter(c => c.table === 'bookings').map(c => `${c.filters[0][2]}:${c.values.status}`);
  assert(seq.join(',') === 'bk_a:active,bk_a:completed,bk_b:active', `booking lama di PC sama ditutup dulu: ${seq.join(',')}`);
  SupabaseSyncService.markSessionEnded('PC-01');
  await drain();

  // Error permanen jadi dead letter, antrean lanjut
  permanentFailOnce = 'bookings.update';
  SupabaseSyncService.rejectBooking('bk_dup', 'uji');
  SupabaseSyncService.recordSessionLog({ playerName: 'Citra', pcName: 'PC-02', paketName: 'Paket', price: 2000, startTime: '2026-09-24T12:00:00.000Z', endTime: '2026-09-24T12:30:00.000Z', status: 'Selesai' });
  await drain();
  rows = outbox();
  assert(rows.length === 1 && rows[0].dead === 1 && SupabaseSyncService.getStatus().deadOutbox === 1, 'error permanen dipindah ke dead letter');
  assert(calls.some(c => c.table === 'logs' && c.values[0].player_name === 'Citra'), 'item setelah dead letter tetap terkirim');

  // Mode lokal: tanpa cloud tidak ada antrean yang menumpuk
  SupabaseSyncService.disconnect();
  sqlite.exec('DELETE FROM CloudOutbox');
  SupabaseSyncService.recordSessionLog({ playerName: 'X', pcName: 'PC-01', paketName: 'P', price: 1, startTime: '2026-09-24T12:00:00.000Z', endTime: '2026-09-24T12:30:00.000Z', status: 'Selesai' });
  assert(outbox().length === 0, 'mode lokal: tidak ada item outbox');

  DbService.setSetting('cloud_booking_sessions', originalLinks || '{}');
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  app.exit(failed ? 1 : 0);
}

app.whenReady().then(run).catch(err => { console.error(err); app.exit(1); });
