// Rename a PC from the cashier: real WebSocket server, a fake booth that saves the name (or refuses,
// or stays silent) and registers again under the new name, like ClientView does.
import { app } from 'electron';
import WebSocket from 'ws';
import { DbService } from '../src/server/db/dbService';
import { BillingEngine } from '../src/server/engine/billingEngine';
import { ServerNetworkBridge } from '../src/server/network/serverNetwork';
import { initPcRename, requestPcRename } from '../src/server/network/pcRename';
import { OpCode, Packet } from '../src/shared/protocol';

const PORT = 7998;
let failed = 0;
function assert(condition: boolean, name: string) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failed++;
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

type BoothMode = 'save' | 'refuse' | 'silent';

/** A booth that answers rename_pc the way ClientView does: reply first, then register under the new name. */
function booth(name: string, mode: BoothMode): Promise<{ ws: WebSocket; renameRequests: string[]; send: (p: Packet) => void }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const renameRequests: string[] = [];
    const send = (p: Packet) => ws.send(JSON.stringify(p));
    const register = (id: string) => send({ op: OpCode.CLIENT_REGISTER, ts: Date.now(), pcId: id, payload: { pcId: id, pcName: id, mac: '', ip: '' } });
    ws.on('message', raw => {
      const p = JSON.parse(raw.toString()) as Packet;
      if (p.op !== OpCode.REMOTE_COMMAND || p.payload?.action !== 'rename_pc') return;
      const newName = p.payload.params.name;
      renameRequests.push(newName);
      if (mode === 'silent') return;
      send({ op: OpCode.REMOTE_COMMAND, ts: Date.now(), pcId: name, payload: { action: 'rename_pc_result', params: { name: newName, success: mode === 'save', message: mode === 'refuse' ? 'disk penuh' : undefined } } });
      if (mode === 'save') register(newName);
    });
    ws.on('open', () => { register(name); setTimeout(() => resolve({ ws, renameRequests, send }), 200); });
    ws.on('error', reject);
  });
}

const rowsNamed = (name: string) => DbService.getWorkstations().filter(w => w.name.toLowerCase() === name.toLowerCase()).length;

async function run() {
  await DbService.init();
  BillingEngine.start();
  initPcRename();
  ServerNetworkBridge.on(OpCode.CLIENT_REGISTER, c => DbService.upsertWorkstation(c.pcId, c.pcName, c.ip, c.mac));
  ServerNetworkBridge.start(PORT);
  await wait(300);

  console.log('Ganti nama berhasil');
  const b1 = await booth('PC-RN-01', 'save');
  const ok = await requestPcRename('PC-RN-01', 'PC-VIP-01');
  await wait(300);
  assert(ok.success, `berhasil: ${ok.message}`);
  assert(rowsNamed('PC-VIP-01') === 1 && rowsNamed('PC-RN-01') === 0, 'baris DB pindah nama, tidak dobel setelah register ulang');
  assert(ServerNetworkBridge.getConnectedClients().some(c => c.pcId === 'PC-VIP-01'), 'booth tersambung dengan nama baru');

  console.log('Ditolak sebelum dikirim ke PC');
  DbService.addWorkstation({ name: 'PC-RN-02', pricePerHour: 4000 });
  const taken = await requestPcRename('PC-VIP-01', 'pc-rn-02');
  assert(!taken.success && b1.renameRequests.length === 1, `nama milik PC lain ditolak: ${taken.message}`);
  assert(!(await requestPcRename('PC-VIP-01', 'PC/01')).success, 'karakter tidak valid ditolak');
  assert(!(await requestPcRename('PC-RN-02', 'PC-RN-09')).success, 'PC yang tidak tersambung ditolak');
  BillingEngine.startSession('PC-VIP-01', { username: 'tamu', billingType: 'package', durationMinutes: 60, price: 4000, packageName: 'Paket 1 Jam' });
  const busy = await requestPcRename('PC-VIP-01', 'PC-VIP-02');
  assert(!busy.success && rowsNamed('PC-VIP-01') === 1, `PC yang sedang dipakai ditolak: ${busy.message}`);
  BillingEngine.stopSession('PC-VIP-01', 'tes');

  console.log('Booth gagal menyimpan');
  const b3 = await booth('PC-RN-03', 'refuse');
  const refused = await requestPcRename('PC-RN-03', 'PC-RN-33');
  assert(!refused.success && rowsNamed('PC-RN-03') === 1 && rowsNamed('PC-RN-33') === 0, `nama dikembalikan: ${refused.message}`);

  console.log('Jawaban palsu');
  b3.send({ op: OpCode.REMOTE_COMMAND, ts: Date.now(), pcId: 'PC-RN-03', payload: { action: 'rename_pc_result', params: { name: 'PC-VIP-01', success: true } } });
  await wait(300);
  assert(rowsNamed('PC-RN-03') === 1, 'jawaban tanpa permintaan server diabaikan');

  console.log('Booth diam (tunggu 10 detik)');
  const b4 = await booth('PC-RN-04', 'silent');
  const silent = await requestPcRename('PC-RN-04', 'PC-RN-44');
  assert(!silent.success && b4.renameRequests.length === 1 && rowsNamed('PC-RN-04') === 1 && rowsNamed('PC-RN-44') === 0, `waktu habis, nama dikembalikan: ${silent.message}`);

  [b1, b3, b4].forEach(b => b.ws.close());
  for (const name of ['PC-VIP-01', 'PC-RN-02', 'PC-RN-03', 'PC-RN-04']) BillingEngine.deleteWorkstation(name);
  ServerNetworkBridge.stop();
  BillingEngine.stop();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  app.exit(failed ? 1 : 0);
}

app.whenReady().then(run).catch(err => { console.error(err); app.exit(1); });
