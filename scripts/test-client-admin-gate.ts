// Booth admin gate in main: a server grant only counts for the nonce main issued, once, before it expires;
// the offline LAN key check locks out after 5 misses; the grant itself expires.
import { ClientAdminGate } from '../src/main/clientAdminGate';
import { ADMIN_GRANT_TTL_MS, signAdminGrant, signPacket, verifyAdminGrant } from '../src/shared/lanAuth';
import { OpCode } from '../src/shared/protocol';

const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
let failed = 0;
const check = (ok: boolean, name: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
};

async function run() {
  let now = 1_000_000;
  const clock = () => now;

  // Grant HMAC
  const grant = await signAdminGrant(KEY, 'ab'.repeat(16));
  check(await verifyAdminGrant(KEY, 'ab'.repeat(16), grant), 'grant valid diterima');
  check(!(await verifyAdminGrant('kunci-lain', 'ab'.repeat(16), grant)), 'grant dari kunci lain ditolak');
  check(!(await verifyAdminGrant(KEY, 'cd'.repeat(16), grant)), 'grant untuk nonce lain ditolak');
  check(!(await verifyAdminGrant(KEY, 'ab'.repeat(16), 'bukan-hex')), 'grant rusak ditolak');
  check(!(await verifyAdminGrant('', 'ab'.repeat(16), grant)), 'tanpa kunci tidak ada grant');
  const packet = await signPacket(KEY, { op: OpCode.ADMIN_AUTH, ts: now, payload: { success: true } });
  check(!(await verifyAdminGrant(KEY, 'ab'.repeat(16), packet.sig)), 'tanda tangan paket tidak bisa dipakai sebagai grant');

  // Online: nonce from main, grant from server
  const gate = new ClientAdminGate(clock);
  check(!gate.isGranted(), 'awal belum ada izin admin');
  check(!(await gate.acceptServerGrant(KEY, grant)).success, 'grant tanpa challenge ditolak');
  let nonce = gate.challenge();
  check(/^[0-9a-f]{32}$/.test(nonce), 'nonce 32 hex');
  check(!(await gate.acceptServerGrant(KEY, await signAdminGrant('kunci-lain', nonce))).success, 'grant kunci lain ditolak');
  check(!(await gate.acceptServerGrant(KEY, await signAdminGrant(KEY, nonce))).success, 'nonce sekali pakai, gagal sekali langsung hangus');
  nonce = gate.challenge();
  const good = await signAdminGrant(KEY, nonce);
  check((await gate.acceptServerGrant(KEY, good)).success && gate.isGranted(), 'grant valid membuka izin admin');
  gate.revoke();
  check(!gate.isGranted(), 'revoke menutup izin');
  check(!(await gate.acceptServerGrant(KEY, good)).success, 'grant lama tidak bisa diulang');
  nonce = gate.challenge();
  now += 31_000;
  check(!(await gate.acceptServerGrant(KEY, await signAdminGrant(KEY, nonce))).success, 'nonce kedaluwarsa ditolak');

  nonce = gate.challenge();
  await gate.acceptServerGrant(KEY, await signAdminGrant(KEY, nonce));
  now += ADMIN_GRANT_TTL_MS - 1;
  check(gate.isGranted(), 'izin masih hidup sebelum TTL');
  now += 2;
  check(!gate.isGranted(), 'izin habis setelah TTL');

  // Offline: LAN key
  const off = new ClientAdminGate(clock);
  check(!off.checkLanKey('', KEY).success, 'PC tanpa kunci tidak bisa verifikasi offline');
  check(!off.checkLanKey(KEY, '   ').success, 'kunci kosong ditolak');
  check(off.checkLanKey(KEY, `  ${KEY} `).success && off.isGranted(), 'kunci benar membuka izin, spasi diabaikan');
  off.revoke();
  for (let i = 0; i < 5; i++) off.checkLanKey(KEY, 'salah');
  check(!off.checkLanKey(KEY, KEY).success && !off.isGranted(), '5 salah mengunci, kunci benar pun ditolak');
  now += 60_001;
  check(off.checkLanKey(KEY, KEY).success, 'setelah 60 detik kunci benar diterima lagi');
  for (let i = 0; i < 4; i++) off.checkLanKey(KEY, 'salah');
  off.checkLanKey(KEY, KEY);
  off.checkLanKey(KEY, 'salah');
  check(off.checkLanKey(KEY, KEY).success, 'kunci benar mereset hitungan salah');

  console.log(failed ? `\n${failed} FAIL` : '\nSemua lulus');
  process.exit(failed ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
