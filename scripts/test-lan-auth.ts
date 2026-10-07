import WebSocket from 'ws';
import { ServerNetworkBridge } from '../src/server/network/serverNetwork';
import { OpCode, Packet } from '../src/shared/protocol';
import { signPacket, verifyPacket, MAX_SKEW_MS } from '../src/shared/lanAuth';

const SECRET = 'test-lan-secret-123';
const PORT = 7999;
let failed = 0;
function assert(condition: boolean, name: string) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failed++;
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

function open(): Promise<{ ws: WebSocket; inbox: Packet[]; closed: () => boolean }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const inbox: Packet[] = [];
    let isClosed = false;
    ws.on('message', d => inbox.push(JSON.parse(d.toString())));
    ws.on('close', () => { isClosed = true; });
    ws.on('open', () => resolve({ ws, inbox, closed: () => isClosed }));
    ws.on('error', reject);
  });
}

async function run() {
  // Unit: sign/verify
  const p: Packet = { op: OpCode.HEARTBEAT, ts: Date.now(), pcId: 'PC-01', payload: { a: 1 } };
  const s = await signPacket(SECRET, p);
  assert(await verifyPacket(SECRET, s), 'tanda tangan valid diterima');
  assert(!(await verifyPacket('kunci-lain', s)), 'kunci beda ditolak');
  assert(!(await verifyPacket(SECRET, { ...s, payload: { a: 2 } })), 'payload diubah ditolak');
  assert(!(await verifyPacket(SECRET, s, p.ts + MAX_SKEW_MS + 1)), 'paket kadaluarsa ditolak');
  assert(!(await verifyPacket(SECRET, { ...p })), 'paket tanpa tanda tangan ditolak');

  // Integrasi: server WS asli
  const registered: string[] = [];
  ServerNetworkBridge.on(OpCode.CLIENT_REGISTER, c => registered.push(c.pcId));
  ServerNetworkBridge.setLanSecret(SECRET);
  ServerNetworkBridge.start(PORT);
  await wait(300);

  const reg = (pcId: string): Packet => ({ op: OpCode.CLIENT_REGISTER, ts: Date.now(), pcId, payload: { pcId, pcName: pcId, mac: '', ip: '' } });

  const rogue = await open();
  rogue.ws.send(JSON.stringify(reg('PC-ROGUE')));
  await wait(300);
  assert(!registered.includes('PC-ROGUE'), 'register tanpa tanda tangan tidak diproses');
  assert(rogue.closed(), 'koneksi tanpa tanda tangan diputus server');

  const good = await open();
  good.ws.send(JSON.stringify(await signPacket(SECRET, reg('PC-GOOD'))));
  await wait(300);
  assert(registered.includes('PC-GOOD'), 'register bertanda tangan diterima');
  const init = good.inbox.find(x => x.op === OpCode.SERVER_CONFIG_INIT);
  assert(!!init && await verifyPacket(SECRET, init), 'balasan server ikut bertanda tangan valid');

  // Paket bertanda tangan tapi payload diubah setelah register: dibuang, koneksi tetap hidup
  const tampered = await signPacket(SECRET, { op: OpCode.HEARTBEAT, ts: Date.now(), pcId: 'PC-GOOD' });
  const before = good.inbox.length;
  good.ws.send(JSON.stringify({ ...tampered, payload: { hack: true } }));
  await wait(300);
  assert(good.inbox.length === before && !good.closed(), 'paket palsu dari client terdaftar dibuang tanpa balasan');

  good.ws.send(JSON.stringify(await signPacket(SECRET, { op: OpCode.HEARTBEAT, ts: Date.now(), pcId: 'PC-GOOD' })));
  await wait(300);
  assert(good.inbox.length === before + 1, 'heartbeat valid dibalas');

  good.ws.close();
  ServerNetworkBridge.stop();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
