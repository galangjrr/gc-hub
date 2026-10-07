// Uji Edge Function booking API end-to-end: handler asli + Postgres asli (PGlite) + migration 004/005.
// Hanya lapisan supabase-js di supabase/functions/api/index.ts yang tidak ikut teruji (dicek via deno check).
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'fs';
import path from 'path';
import { createHandler, toBusinessError, type ApiDb } from '../supabase/functions/api/handler';

let failed = 0;
function assert(condition: boolean, name: string) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failed++;
}

const root = process.cwd();
const sql = (f: string) => readFileSync(path.join(root, 'supabase/migrations', f), 'utf8');

async function setupDb() {
  const pg = new PGlite({ extensions: { pgcrypto } });
  await pg.exec(`
    CREATE SCHEMA extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TABLE pcs (id TEXT PRIMARY KEY, name TEXT, status TEXT DEFAULT 'available', expected_empty_time TIMESTAMPTZ, image TEXT, specs JSONB);
    CREATE TABLE pakets (id TEXT PRIMARY KEY, name TEXT, price INT, duration_minutes INT, fixed_start_time TEXT, fixed_end_time TEXT, days TEXT[], is_custom BOOLEAN);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, pc_id TEXT NOT NULL REFERENCES pcs(id), paket_id TEXT REFERENCES pakets(id), player_name TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now(), ss_bukti TEXT);
    INSERT INTO pcs (id, name, status) VALUES ('pc-01','PC-01','occupied'), ('pc-02','PC-02','available');
    INSERT INTO pakets (id, name, price, duration_minutes) VALUES ('p1','Paket 1 Jam',4000,60), ('p3','Paket 3 Jam',10000,180);
  `);
  await pg.exec(sql('004_booking_api.sql'));
  await pg.exec(sql('005_booking_guards.sql'));
  return pg;
}

function pgliteDb(pg: PGlite): ApiDb {
  const one = async <T>(q: string, p: unknown[] = []) => (await pg.query<T>(q, p)).rows[0];
  const rpc = async (q: string, p: unknown[]) => {
    try {
      return (await one<{ r: unknown }>(q, p)).r;
    } catch (err: any) {
      throw toBusinessError({ message: err.message, code: err.code }) ?? err;
    }
  };
  return {
    findKeyByHash: async hash => (await one<any>(`SELECT id, name, scopes, revoked_at FROM api_keys WHERE key_hash = $1`, [hash])) ?? null,
    hit: async id => (await one<{ ok: boolean }>(`SELECT api_hit($1) AS ok`, [id])).ok,
    claimIdempotency: async (keyId, k, hash) => {
      const inserted = await one(`INSERT INTO api_idempotency (api_key_id, idem_key, request_hash) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1`, [keyId, k, hash]);
      if (inserted) return null;
      return (await one<any>(`SELECT request_hash, status_code, response FROM api_idempotency WHERE api_key_id = $1 AND idem_key = $2`, [keyId, k])) ?? null;
    },
    completeIdempotency: async (keyId, k, status, response) => {
      await pg.query(`UPDATE api_idempotency SET status_code = $3, response = $4 WHERE api_key_id = $1 AND idem_key = $2`, [keyId, k, status, JSON.stringify(response)]);
    },
    releaseIdempotency: async (keyId, k) => {
      await pg.query(`DELETE FROM api_idempotency WHERE api_key_id = $1 AND idem_key = $2`, [keyId, k]);
    },
    availability: (paketId, at) => rpc(`SELECT api_availability($1, $2) AS r`, [paketId, at]),
    listPakets: async () => (await pg.query(`SELECT id, name, price, duration_minutes FROM pakets ORDER BY price`)).rows,
    createBooking: a => rpc(`SELECT api_create_booking($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS r`,
      [a.apiKeyId, a.source, a.type, a.pcId, a.paketId, a.playerName, a.scheduledAt, a.paymentStatus, a.phone, a.externalRef, a.paymentRef]),
    getBooking: async (keyId, id) => {
      const owned = await one(`SELECT 1 FROM bookings WHERE id = $1 AND api_key_id = $2`, [id, keyId]);
      return owned ? rpc(`SELECT api_booking_json($1) AS r`, [id]) : null;
    },
    cancelBooking: (keyId, id, reason) => rpc(`SELECT api_cancel_booking($1, $2, $3) AS r`, [keyId, id, reason]),
  };
}

async function run() {
  const pg = await setupDb();
  const key = (await pg.query<{ k: string }>(`SELECT api_create_key('GC Net Booking') AS k`)).rows[0].k;
  const otherKey = (await pg.query<{ k: string }>(`SELECT api_create_key('Integrator Lain') AS k`)).rows[0].k;
  const readOnly = (await pg.query<{ k: string }>(`SELECT api_create_key('Read Only', ARRAY['read']) AS k`)).rows[0].k;
  const revoked = (await pg.query<{ k: string }>(`SELECT api_create_key('Dicabut') AS k`)).rows[0].k;
  await pg.query(`UPDATE api_keys SET revoked_at = now() WHERE key_prefix = $1`, [revoked.slice(0, 12)]);

  const handle = createHandler(pgliteDb(pg));
  const BASE = 'http://localhost/api/v1';
  const call = async (method: string, p: string, opts: { key?: string; body?: unknown; idem?: string; raw?: string; base?: string } = {}) => {
    const headers: Record<string, string> = {};
    if (opts.key) headers.Authorization = `Bearer ${opts.key}`;
    if (opts.idem) headers['Idempotency-Key'] = opts.idem;
    const body = opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined);
    const res = await handle(new Request(`${opts.base ?? BASE}${p}`, { method, headers, body }));
    return { status: res.status, headers: res.headers, json: await res.json() as any };
  };

  // Auth
  assert((await call('GET', '/pakets')).status === 401, 'tanpa API key -> 401');
  assert((await call('GET', '/pakets', { key: 'gch_' + '0'.repeat(48) })).status === 401, 'key tidak dikenal -> 401');
  assert((await call('GET', '/pakets', { key: revoked })).status === 401, 'key dicabut -> 401');
  const viaHeader = await handle(new Request(`${BASE}/pakets`, { headers: { 'X-API-Key': key } }));
  assert(viaHeader.status === 200, 'header X-API-Key juga diterima');

  // Routing & path Supabase
  const pakets = await call('GET', '/pakets', { key });
  assert(pakets.status === 200 && pakets.json.data.length === 2, 'GET /v1/pakets -> daftar paket');
  const prefixed = await call('GET', '/pakets', { key, base: 'http://localhost/functions/v1/api/v1' });
  assert(prefixed.status === 200, 'path dengan prefix /functions/v1/api juga dikenali');
  assert((await call('GET', '/nggak-ada', { key })).status === 404, 'endpoint asing -> 404');
  assert((await call('DELETE', '/pakets', { key })).status === 405, 'method salah -> 405');

  // Scope
  const noScope = await call('POST', '/bookings', { key: readOnly, idem: 'idem-readonly-1', body: {} });
  assert(noScope.status === 403 && noScope.json.error.code === 'FORBIDDEN_SCOPE', 'key read-only tidak bisa membuat booking');

  // Validasi
  assert((await call('POST', '/bookings', { key, body: {} })).json.error.code === 'IDEMPOTENCY_KEY_REQUIRED', 'POST tanpa Idempotency-Key ditolak');
  assert((await call('POST', '/bookings', { key, idem: 'idem-badjson-1', raw: '{nope' })).json.error.code === 'INVALID_JSON', 'JSON rusak ditolak');
  const noPaket = await call('POST', '/bookings', { key, idem: 'idem-val-0001', body: { pc_id: 'pc-01', player_name: 'Budi' } });
  assert(noPaket.status === 400 && noPaket.json.error.field === 'paket_id', 'paket_id kosong -> 400 dengan nama field');
  const badPhone = await call('POST', '/bookings', { key, idem: 'idem-val-0002', body: { pc_id: 'pc-01', paket_id: 'p1', player_name: 'Budi', phone: '08-abc' } });
  assert(badPhone.json.error?.field === 'phone', 'nomor HP tidak valid ditolak');
  const noTz = await call('POST', '/bookings', { key, idem: 'idem-val-0003', body: { type: 'slot', paket_id: 'p1', player_name: 'Budi', scheduled_at: '2030-01-01T19:00:00' } });
  assert(noTz.json.error?.field === 'scheduled_at', 'scheduled_at tanpa zona waktu ditolak');

  // Buat booking + idempotensi
  const body = { pc_id: 'pc-01', paket_id: 'p1', player_name: 'Budi', phone: '081234567890', payment_status: 'paid', external_ref: 'ORDER-77' };
  const created = await call('POST', '/bookings', { key, idem: 'order-77-attempt', body });
  assert(created.status === 201 && created.json.data.status === 'pending' && created.json.data.phone === '081234567890', 'POST /v1/bookings -> 201 pending');
  const replay = await call('POST', '/bookings', { key, idem: 'order-77-attempt', body });
  assert(replay.status === 201 && replay.headers.get('Idempotent-Replayed') === 'true' && replay.json.data.id === created.json.data.id, 'retry dengan key sama mengembalikan booking yang sama');
  const mismatch = await call('POST', '/bookings', { key, idem: 'order-77-attempt', body: { ...body, player_name: 'Beda' } });
  assert(mismatch.status === 422 && mismatch.json.error.code === 'IDEMPOTENCY_MISMATCH', 'key sama dengan body beda -> 422');
  const count1 = (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM bookings WHERE player_name = 'Budi'`)).rows[0].n;
  assert(count1 === 1, 'hanya satu booking tersimpan walau request diulang');

  const full = await call('POST', '/bookings', { key: otherKey, idem: 'other-queue-1', body: { pc_id: 'pc-01', paket_id: 'p1', player_name: 'Andi' } });
  assert(full.status === 409 && full.json.error.code === 'PC_QUEUE_FULL', 'antrean PC penuh -> 409 PC_QUEUE_FULL');
  const fullReplay = await call('POST', '/bookings', { key: otherKey, idem: 'other-queue-1', body: { pc_id: 'pc-01', paket_id: 'p1', player_name: 'Andi' } });
  assert(fullReplay.status === 409 && fullReplay.headers.get('Idempotent-Replayed') === 'true', 'respons error bisnis juga di-replay konsisten');

  // Request kembar bersamaan: tetap satu booking
  const twin = { pc_id: 'pc-02', paket_id: 'p1', player_name: 'Kembar' };
  const [t1, t2] = await Promise.all([
    call('POST', '/bookings', { key, idem: 'twin-request-1', body: twin }),
    call('POST', '/bookings', { key, idem: 'twin-request-1', body: twin }),
  ]);
  const twinCount = (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM bookings WHERE player_name = 'Kembar'`)).rows[0].n;
  assert(twinCount === 1 && [t1.status, t2.status].includes(201), `request kembar bersamaan: 1 booking (status ${t1.status}/${t2.status})`);

  // Slot
  const at = new Date(Date.now() + 3 * 3600e3).toISOString();
  const slot = await call('POST', '/bookings', { key, idem: 'slot-booking-1', body: { type: 'slot', paket_id: 'p3', player_name: 'Slot', scheduled_at: at } });
  assert(slot.status === 201 && slot.json.data.type === 'slot', 'booking jam tertentu -> 201');
  const avail = await call('GET', `/availability?paket_id=p3&at=${encodeURIComponent(at)}`, { key });
  assert(avail.status === 200 && avail.json.slot.remaining === 1 && Array.isArray(avail.json.pcs), 'availability menampilkan sisa kapasitas slot');
  assert((await call('GET', '/availability?at=kemarin', { key })).status === 400, 'parameter at tidak valid -> 400');

  // Baca & batal
  const id = created.json.data.id;
  assert((await call('GET', `/bookings/${id}`, { key })).json.data.id === id, 'GET booking milik sendiri -> 200');
  assert((await call('GET', `/bookings/${id}`, { key: otherKey })).status === 404, 'booking milik key lain tidak terlihat -> 404');
  assert((await call('POST', `/bookings/${id}/cancel`, { key: otherKey, body: {} })).status === 404, 'key lain tidak bisa membatalkan -> 404');
  const cancelled = await call('POST', `/bookings/${id}/cancel`, { key, body: { reason: 'Tidak jadi datang' } });
  assert(cancelled.status === 200 && cancelled.json.data.status === 'cancelled', 'POST cancel -> cancelled');
  const again = await call('POST', `/bookings/${id}/cancel`, { key });
  assert(again.status === 409 && again.json.error.code === 'BOOKING_NOT_CANCELLABLE', 'batal dua kali -> 409');

  // Rate limit
  await pg.query(`UPDATE api_keys SET rate_limit_per_min = 2 WHERE key_prefix = $1`, [readOnly.slice(0, 12)]);
  await pg.query(`DELETE FROM api_rate_windows`);
  await call('GET', '/pakets', { key: readOnly });
  await call('GET', '/pakets', { key: readOnly });
  const limited = await call('GET', '/pakets', { key: readOnly });
  assert(limited.status === 429 && limited.headers.get('Retry-After') === '60', 'melewati batas -> 429 + Retry-After');

  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
