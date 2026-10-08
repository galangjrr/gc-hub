// Uji migration 004 & 005 di Postgres asli (PGlite/WASM) tanpa perlu Supabase.
// Tabel dasar dibuat sesuai docs/GC_NET_HUB_CONTRACT.md; net.http_post di-stub untuk menangkap webhook.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'fs';
import { createHash, createHmac } from 'crypto';

let failed = 0;
function assert(condition, name) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failed++;
}
async function expectError(db, sql, params, code, name) {
  try {
    if (params.length) await db.query(sql, params); else await db.exec(sql);
    assert(false, `${name} (tidak ada error, harusnya ${code})`);
  } catch (err) {
    assert(String(err.message).includes(code), `${name} -> ${code}`);
  }
}

const BASE_SCHEMA = `
  CREATE SCHEMA extensions;
  CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
  CREATE TABLE pcs (id TEXT PRIMARY KEY, name TEXT, status TEXT DEFAULT 'available', expected_empty_time TIMESTAMPTZ, image TEXT, specs JSONB);
  CREATE TABLE pakets (id TEXT PRIMARY KEY, name TEXT, price INT, duration_minutes INT, fixed_start_time TEXT, fixed_end_time TEXT, days TEXT[], is_custom BOOLEAN);
  CREATE TABLE bookings (id TEXT PRIMARY KEY, pc_id TEXT NOT NULL REFERENCES pcs(id), paket_id TEXT REFERENCES pakets(id), player_name TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now(), ss_bukti TEXT);
  CREATE TABLE logs (id TEXT PRIMARY KEY, player_name TEXT, pc_name TEXT, paket_name TEXT, price INT, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, status TEXT, reason TEXT);
`;

const NET_STUB = `
  CREATE SCHEMA net;
  CREATE TABLE net.sent (id BIGSERIAL PRIMARY KEY, url TEXT, body_text TEXT, headers JSONB);
  CREATE FUNCTION net.http_post(url TEXT, body JSONB DEFAULT '{}', params JSONB DEFAULT '{}', headers JSONB DEFAULT '{}', timeout_milliseconds INT DEFAULT 5000)
  RETURNS BIGINT LANGUAGE sql AS $$ INSERT INTO net.sent (url, body_text, headers) VALUES (url, body::text, headers) RETURNING id $$;
`;

async function freshDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(BASE_SCHEMA);
  return db;
}

const m004 = readFileSync(new URL('../supabase/migrations/004_booking_api.sql', import.meta.url), 'utf8');
const m005 = readFileSync(new URL('../supabase/migrations/005_booking_guards.sql', import.meta.url), 'utf8');
const m009 = readFileSync(new URL('../supabase/migrations/009_webhook_retry.sql', import.meta.url), 'utf8');
const CREATE = `SELECT public.api_create_booking($1, 'test', $2, $3, $4, $5, $6, $7, $8, $9, $10) AS b`;

async function run() {
  const db = await freshDb();
  await db.exec(NET_STUB);
  await db.exec(`
    INSERT INTO pcs (id, name, status) VALUES ('pc-01','PC-01','occupied'), ('pc-02','PC-02','available'), ('pc-03','PC-03','maintenance');
    INSERT INTO pakets (id, name, price, duration_minutes) VALUES ('p1','Paket 1 Jam',4000,60), ('p3','Paket 3 Jam',10000,180);
    INSERT INTO bookings (id, pc_id, paket_id, player_name, status) VALUES ('old-1','pc-01','p1','Lama','completed');
  `);

  // Simulasi remote_commands versi lama (migration 001) yang sudah ada di live
  await db.exec(`CREATE TABLE remote_commands (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workstation_id TEXT NOT NULL,
    command TEXT NOT NULL CHECK (command IN ('lock','unlock')), payload JSONB, status TEXT NOT NULL DEFAULT 'pending',
    created_by TEXT NOT NULL DEFAULT 'x', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), executed_at TIMESTAMPTZ);`);
  await db.exec(m004);
  await db.exec(m004); // idempoten: aman dijalankan ulang
  await db.query(`INSERT INTO remote_commands (workstation_id, command) VALUES ('PC-01', 'start_session')`);
  assert(true, 'remote_commands lama disamakan: start_session diterima');
  assert(true, 'migration 004 berjalan dan idempoten');
  await db.exec(m005);
  assert(true, 'migration 005 berjalan');
  await db.exec(m009);
  await db.exec(m009); // idempoten, dan tanpa pg_cron tetap jalan
  assert(true, 'migration 009 berjalan dua kali tanpa pg_cron');

  // API key
  const key = (await db.query(`SELECT public.api_create_key('GC Net Booking') AS k`)).rows[0].k;
  const keyRow = (await db.query(`SELECT * FROM api_keys`)).rows[0];
  assert(key.startsWith('gch_') && key.length === 52, 'api key berformat gch_ + 48 hex');
  assert(keyRow.key_hash === createHash('sha256').update(key).digest('hex'), 'hash tersimpan = SHA-256 key (sama dengan Edge Function)');
  assert(!JSON.stringify(keyRow).includes(key), 'key asli tidak tersimpan');
  const keyId = keyRow.id;
  const key2 = (await db.query(`SELECT public.api_create_key('Integrator Lain') AS k`)).rows[0].k;
  const keyId2 = (await db.query(`SELECT id FROM api_keys WHERE key_prefix = $1`, [key2.slice(0, 12)])).rows[0].id;

  // Rate limit
  await db.query(`UPDATE api_keys SET rate_limit_per_min = 3 WHERE id = $1`, [keyId]);
  const hits = [];
  for (let i = 0; i < 4; i++) hits.push((await db.query(`SELECT public.api_hit($1) AS ok`, [keyId])).rows[0].ok);
  assert(hits.join() === 'true,true,true,false', 'rate limit: request ke-4 dalam semenit ditolak');

  // Webhook endpoint untuk key 1
  const secret = 'rahasia-webhook';
  await db.query(`INSERT INTO webhook_endpoints (api_key_id, url, secret) VALUES ($1, 'https://example.com/hook', $2)`, [keyId, secret]);
  await expectError(db, `INSERT INTO webhook_endpoints (api_key_id, url) VALUES ($1, 'http://plain.example.com')`, [keyId], 'check', 'webhook wajib https');

  // Queue booking
  const q1 = (await db.query(CREATE, [keyId, 'queue', 'pc-01', 'p1', 'Budi', null, 'paid', '08123', 'EXT-1', 'QRIS-9'])).rows[0].b;
  assert(q1.id.startsWith('bk_') && q1.status === 'pending' && q1.type === 'queue', 'booking antre dibuat pending dengan id bk_');
  assert(q1.phone === '08123' && q1.external_ref === 'EXT-1', 'kontak tersimpan dan ikut di respons API');
  const pub = (await db.query(`SELECT * FROM bookings WHERE id = $1`, [q1.id])).rows[0];
  assert(!('phone' in pub), 'nomor HP tidak ada di tabel bookings yang bisa dibaca publik');

  await expectError(db, CREATE, [keyId, 'queue', 'pc-01', 'p1', 'Andi', null, 'unpaid', null, null, null], 'PC_QUEUE_FULL', 'antrean kedua di PC sama ditolak');
  await expectError(db, CREATE, [keyId, 'queue', 'pc-03', 'p1', 'Andi', null, 'unpaid', null, null, null], 'PC_MAINTENANCE', 'PC maintenance ditolak');
  await expectError(db, CREATE, [keyId, 'queue', 'pc-99', 'p1', 'Andi', null, 'unpaid', null, null, null], 'PC_NOT_FOUND', 'PC tidak ada ditolak');
  await expectError(db, CREATE, [keyId, 'queue', 'pc-02', 'zzz', 'Andi', null, 'unpaid', null, null, null], 'PAKET_NOT_FOUND', 'paket tidak ada ditolak');
  await expectError(db, CREATE, [keyId, 'queue', null, 'p1', 'Andi', null, 'unpaid', null, null, null], 'PC_REQUIRED', 'antre tanpa PC ditolak');
  await expectError(db, CREATE, [keyId, 'queue', 'pc-02', 'p1', '   ', null, 'unpaid', null, null, null], 'INVALID_PLAYER_NAME', 'nama kosong ditolak');
  await expectError(db, CREATE, [keyId, 'queue', 'pc-02', 'p1', 'Andi', null, 'lunas', null, null, null], 'INVALID_PAYMENT_STATUS', 'payment_status asing ditolak');

  // Guard DB (005) berlaku juga untuk insert langsung dari web
  await expectError(db, `INSERT INTO bookings (id, pc_id, paket_id, player_name, status) VALUES ('web-dup','pc-01','p1','Web','pending')`, [], 'uq_bookings_one_pending_queue_per_pc', 'insert web langsung tetap kena guard antrean');

  // Slot booking: kapasitas = 2 PC non-maintenance
  const at = new Date(Date.now() + 2 * 3600e3).toISOString();
  const s1 = (await db.query(CREATE, [keyId, 'slot', null, 'p1', 'Slot A', at, 'unpaid', null, null, null])).rows[0].b;
  assert(s1.type === 'slot' && s1.pc_id === null, 'booking jam tanpa PC diterima');
  await db.query(CREATE, [keyId2, 'slot', 'pc-02', 'p1', 'Slot B', at, 'unpaid', null, null, null]);
  await expectError(db, CREATE, [keyId, 'slot', null, 'p1', 'Slot C', at, 'unpaid', null, null, null], 'SLOT_FULL', 'slot ketiga di jam sama ditolak (kapasitas 2)');
  const overlapAt = new Date(Date.now() + 2.5 * 3600e3).toISOString();
  await expectError(db, CREATE, [keyId, 'slot', null, 'p1', 'Slot D', overlapAt, 'unpaid', null, null, null], 'SLOT_FULL', 'slot yang tumpang tindih sebagian juga ditolak');
  const laterAt = new Date(Date.now() + 4 * 3600e3).toISOString();
  const s3 = (await db.query(CREATE, [keyId, 'slot', 'pc-02', 'p1', 'Slot E', laterAt, 'unpaid', null, null, null])).rows[0].b;
  assert(s3.status === 'pending', 'slot di jam yang tidak bentrok diterima');
  await expectError(db, CREATE, [keyId, 'slot', 'pc-02', 'p3', 'Slot F', new Date(Date.now() + 3.5 * 3600e3).toISOString(), 'unpaid', null, null, null], 'PC_SLOT_TAKEN', 'PC spesifik yang sudah dibooking di jam itu ditolak');
  await expectError(db, CREATE, [keyId, 'slot', null, 'p1', 'Slot G', new Date(Date.now() + 60e3).toISOString(), 'unpaid', null, null, null], 'SCHEDULE_OUT_OF_RANGE', 'jadwal kurang dari 10 menit ditolak');
  await expectError(db, CREATE, [keyId, 'slot', null, 'p1', 'Slot H', new Date(Date.now() + 8 * 86400e3).toISOString(), 'unpaid', null, null, null], 'SCHEDULE_OUT_OF_RANGE', 'jadwal lebih dari 7 hari ditolak');
  await expectError(db, CREATE, [keyId, 'slot', null, 'p1', 'Slot I', null, 'unpaid', null, null, null], 'SCHEDULE_REQUIRED', 'slot tanpa jadwal ditolak');

  // Availability
  const av = (await db.query(`SELECT public.api_availability('p1', $1) AS a`, [at])).rows[0].a;
  const pc01 = av.pcs.find(p => p.id === 'pc-01');
  const pc02 = av.pcs.find(p => p.id === 'pc-02');
  assert(pc01.queue_open === false && pc02.queue_open === true, 'availability: status antrean per PC benar');
  assert(av.slot.capacity === 2 && av.slot.remaining === 0, 'availability: sisa kapasitas slot 0');
  assert(av.server_online === false, 'availability: server dianggap offline tanpa heartbeat');
  await db.query(`UPDATE branches SET last_seen_at = now() WHERE id = 'main'`);
  assert((await db.query(`SELECT public.api_availability() AS a`)).rows[0].a.server_online === true, 'availability: heartbeat baru = server online');

  // Cancel
  await expectError(db, `SELECT public.api_cancel_booking($1, $2, NULL)`, [keyId2, q1.id], 'BOOKING_NOT_FOUND', 'key lain tidak bisa membatalkan booking orang');
  const c = (await db.query(`SELECT public.api_cancel_booking($1, $2, 'ganti jadwal') AS b`, [keyId, q1.id])).rows[0].b;
  assert(c.status === 'cancelled' && c.cancel_reason === 'ganti jadwal' && c.completed_at, 'booking dibatalkan dengan alasan dan stempel waktu');
  await expectError(db, `SELECT public.api_cancel_booking($1, $2, NULL)`, [keyId, q1.id], 'BOOKING_NOT_CANCELLABLE', 'booking yang sudah batal tidak bisa dibatalkan lagi');
  const q2 = (await db.query(CREATE, [keyId, 'queue', 'pc-01', 'p1', 'Citra', null, 'unpaid', null, null, null])).rows[0].b;
  assert(q2.status === 'pending', 'setelah batal, antrean PC terbuka lagi');

  // Lifecycle dari GC Hub: active -> completed, reassign
  await db.query(`UPDATE bookings SET status = 'active' WHERE id = $1`, [q2.id]);
  const act = (await db.query(`SELECT started_at FROM bookings WHERE id = $1`, [q2.id])).rows[0];
  assert(!!act.started_at, 'status active mengisi started_at');
  const s4 = (await db.query(CREATE, [keyId, 'slot', 'pc-01', 'p1', 'Slot PC1', laterAt, 'unpaid', null, null, null])).rows[0].b;
  await expectError(db, `UPDATE bookings SET status = 'active' WHERE id = $1`, [s4.id], 'uq_bookings_one_active_per_pc', 'dua booking aktif di PC sama ditolak DB');

  // Webhook
  const sent = (await db.query(`SELECT * FROM net.sent ORDER BY id`)).rows;
  const events = sent.map(s => JSON.parse(s.body_text).event);
  assert(events.includes('booking.created') && events.includes('booking.cancelled') && events.includes('booking.started'), `webhook terkirim: ${events.join(', ')}`);
  const fromOtherKey = sent.some(s => JSON.parse(s.body_text).data.player_name === 'Slot B');
  assert(!fromOtherKey, 'webhook tidak membocorkan booking milik key lain');
  const sigOk = sent.every(s => s.headers['X-GCHub-Signature'] === 'sha256=' + createHmac('sha256', secret).update(s.body_text).digest('hex'));
  assert(sigOk, 'tanda tangan HMAC webhook bisa diverifikasi penerima');
  const deliveries = (await db.query(`SELECT count(*)::int AS n FROM webhook_deliveries`)).rows[0].n;
  assert(deliveries === sent.length, 'setiap kiriman tercatat di webhook_deliveries');

  // Webhook error tidak boleh menggagalkan update booking
  await db.exec(`CREATE OR REPLACE FUNCTION net.http_post(url TEXT, body JSONB DEFAULT '{}', params JSONB DEFAULT '{}', headers JSONB DEFAULT '{}', timeout_milliseconds INT DEFAULT 5000) RETURNS BIGINT LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'network down'; END $$;`);
  await db.query(`UPDATE bookings SET status = 'completed' WHERE id = $1`, [q2.id]);
  assert((await db.query(`SELECT status FROM bookings WHERE id = $1`, [q2.id])).rows[0].status === 'completed', 'webhook gagal tidak membatalkan perubahan booking');

  // Tanpa pg_net sama sekali, booking tetap jalan
  const db2 = await freshDb();
  await db2.exec(`INSERT INTO pcs (id, name) VALUES ('pc-01','PC-01'); INSERT INTO pakets (id, name, duration_minutes) VALUES ('p1','P',60);`);
  await db2.exec(m004);
  const k = (await db2.query(`SELECT id FROM api_keys WHERE false`)).rows; // tidak ada key: api_key_id NULL tetap boleh
  const noNet = (await db2.query(CREATE, [null, 'queue', 'pc-01', 'p1', 'Tanpa Net', null, 'unpaid', null, null, null])).rows[0].b;
  assert(noNet.status === 'pending' && k.length === 0, 'tanpa pg_net booking tetap dibuat');

  // 005 menolak jalan bila data lama sudah duplikat, dengan pesan yang jelas
  const db3 = await freshDb();
  await db3.exec(`INSERT INTO pcs (id, name) VALUES ('pc-01','PC-01'); INSERT INTO pakets (id, name) VALUES ('p1','P');
    INSERT INTO bookings (id, pc_id, paket_id, player_name, status) VALUES ('a','pc-01','p1','A','pending'), ('b','pc-01','p1','B','pending');`);
  await db3.exec(m004);
  await expectError(db3, m005, [], 'Rapikan dulu', 'migration 005 berhenti dengan instruksi jika ada duplikat lama');

  // 009: retry webhook. net._http_response di-stub; jawaban pg_net diisi manual per request_id.
  const db4 = await freshDb();
  await db4.exec(NET_STUB);
  await db4.exec(`CREATE TABLE net._http_response (id BIGINT PRIMARY KEY, status_code INT, timed_out BOOLEAN, error_msg TEXT);
    INSERT INTO pcs (id, name) VALUES ('pc-01','PC-01'), ('pc-02','PC-02'); INSERT INTO pakets (id, name, duration_minutes) VALUES ('p1','P',60);`);
  await db4.exec(m004);
  await db4.exec(m005);
  await db4.exec(m009);
  await db4.query(`SELECT public.api_create_key('Retry')`);
  const rKey = (await db4.query(`SELECT id FROM api_keys`)).rows[0].id;
  await db4.query(`INSERT INTO webhook_endpoints (api_key_id, url, secret) VALUES ($1, 'https://example.com/hook', 'rahasia-retry')`, [rKey]);
  const answer = (requestId, code, extra = '') => db4.exec(`INSERT INTO net._http_response (id, status_code, timed_out, error_msg) VALUES (${requestId}, ${code}, ${extra === 'timeout' ? 'true' : 'false'}, NULL)`);
  const delivery = async (bookingId) => (await db4.query(`SELECT * FROM webhook_deliveries WHERE booking_id = $1 ORDER BY id LIMIT 1`, [bookingId])).rows[0];
  const retry = async () => (await db4.query(`SELECT public.webhook_retry_pending() AS n`)).rows[0].n;
  const due = (id) => db4.query(`UPDATE webhook_deliveries SET next_retry_at = now() - interval '1 second' WHERE id = $1`, [id]);

  const r1 = (await db4.query(CREATE, [rKey, 'queue', 'pc-01', 'p1', 'Retry A', null, 'unpaid', null, null, null])).rows[0].b;
  let d1 = await delivery(r1.id);
  assert(d1.status === 'pending' && d1.attempts === 1 && d1.request_id !== null && d1.body?.event === 'booking.created', '009: kiriman pertama tercatat dengan body');
  assert(await retry() === 0 && (await delivery(r1.id)).status === 'pending', '009: belum ada jawaban pg_net, kiriman ditunggu');
  await answer(d1.request_id, 500);
  await retry();
  d1 = await delivery(r1.id);
  assert(d1.request_id === null && d1.last_error === 'HTTP 500' && new Date(d1.next_retry_at) > new Date(), '009: HTTP 500 dijadwalkan ulang, belum dikirim');
  assert(await retry() === 0, '009: belum jatuh tempo, tidak dikirim ulang');
  const sentBefore = (await db4.query(`SELECT count(*)::int AS n FROM net.sent`)).rows[0].n;
  await due(d1.id);
  assert(await retry() === 1, '009: jatuh tempo, dikirim ulang');
  const resent = (await db4.query(`SELECT * FROM net.sent ORDER BY id DESC LIMIT 1`)).rows[0];
  const first = (await db4.query(`SELECT * FROM net.sent ORDER BY id LIMIT 1`)).rows[0];
  assert((await db4.query(`SELECT count(*)::int AS n FROM net.sent`)).rows[0].n === sentBefore + 1, '009: tepat satu kiriman ulang');
  assert(resent.body_text === first.body_text, '009: body kiriman ulang identik, delivery_id sama');
  assert(resent.headers['X-GCHub-Signature'] === 'sha256=' + createHmac('sha256', 'rahasia-retry').update(resent.body_text).digest('hex'), '009: kiriman ulang bertanda tangan valid');
  d1 = await delivery(r1.id);
  assert(d1.attempts === 2 && d1.request_id === Number(resent.id), '009: percobaan bertambah, request_id baru');
  await answer(d1.request_id, 200);
  await retry();
  d1 = await delivery(r1.id);
  assert(d1.status === 'delivered' && d1.delivered_at && d1.last_error === null, '009: jawaban 2xx menandai terkirim');

  // Gagal terus: berhenti di 5 kiriman
  const r2 = (await db4.query(CREATE, [rKey, 'queue', 'pc-02', 'p1', 'Retry B', null, 'unpaid', null, null, null])).rows[0].b;
  let d2 = await delivery(r2.id);
  for (let i = 0; i < 10 && d2.status === 'pending'; i++) {
    if (d2.request_id !== null) await answer(d2.request_id, 0, 'timeout');
    await retry();
    d2 = await delivery(r2.id);
    if (d2.status === 'pending' && d2.request_id === null) { await due(d2.id); await retry(); d2 = await delivery(r2.id); }
  }
  assert(d2.status === 'failed' && d2.attempts === 5 && d2.last_error === 'Timeout', `009: berhenti setelah 5 kiriman (attempts ${d2.attempts}, ${d2.status})`);

  // pg_net melempar error saat kirim pertama: tetap tercatat lalu diulang
  await db4.exec(`CREATE OR REPLACE FUNCTION net.http_post(url TEXT, body JSONB DEFAULT '{}', params JSONB DEFAULT '{}', headers JSONB DEFAULT '{}', timeout_milliseconds INT DEFAULT 5000) RETURNS BIGINT LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'network down'; END $$;`);
  await db4.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [r2.id]);
  let d3 = (await db4.query(`SELECT * FROM webhook_deliveries WHERE event = 'booking.cancelled'`)).rows[0];
  assert(d3 && d3.request_id === null && d3.last_error.includes('network down') && d3.next_retry_at, '009: kiriman pertama yang error tetap dicatat untuk diulang');
  await db4.exec(NET_STUB.replace('CREATE SCHEMA net;', '').replace('CREATE TABLE net.sent', 'CREATE TABLE IF NOT EXISTS net.sent').replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'));
  await due(d3.id);
  assert(await retry() === 1, '009: setelah pg_net pulih, kiriman yang error dikirim ulang');

  // Tidak ada jawaban sama sekali lebih dari 10 menit dihitung gagal
  d3 = (await db4.query(`SELECT * FROM webhook_deliveries WHERE id = $1`, [d3.id])).rows[0];
  await db4.query(`UPDATE webhook_deliveries SET sent_at = now() - interval '11 minutes' WHERE id = $1`, [d3.id]);
  await retry();
  d3 = (await db4.query(`SELECT * FROM webhook_deliveries WHERE id = $1`, [d3.id])).rows[0];
  assert(d3.request_id === null && d3.last_error === 'Tidak ada jawaban dari pg_net', '009: tanpa jawaban 10 menit dijadwalkan ulang');

  // Endpoint dimatikan: kiriman yang tertunda dihentikan
  await db4.exec(`UPDATE webhook_endpoints SET active = false`);
  await due(d3.id);
  await retry();
  d3 = (await db4.query(`SELECT * FROM webhook_deliveries WHERE id = $1`, [d3.id])).rows[0];
  assert(d3.status === 'failed' && d3.last_error === 'Endpoint dinonaktifkan', '009: endpoint nonaktif menghentikan retry');

  // 010: fungsi trigger tidak bisa dipanggil anon, tapi trigger tetap jalan untuk anon
  const db5 = await freshDb();
  await db5.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT, raw_user_meta_data JSONB);
    CREATE TABLE public.members (id UUID PRIMARY KEY, email TEXT, username TEXT, full_name TEXT, phone TEXT);
    CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE raw_username TEXT;
    BEGIN
      raw_username := COALESCE(new.raw_user_meta_data->>'username', SPLIT_PART(new.email, '@', 1));
      INSERT INTO public.members (id, email, username, full_name, phone)
      VALUES (new.id, new.email, raw_username, COALESCE(new.raw_user_meta_data->>'full_name', raw_username), new.raw_user_meta_data->>'phone')
      ON CONFLICT (id) DO NOTHING;
      RETURN new;
    END; $$;
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    GRANT USAGE ON SCHEMA auth TO anon; GRANT INSERT ON auth.users TO anon;
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated;
  `);
  const m010 = readFileSync(new URL('../supabase/migrations/010_lock_trigger_functions.sql', import.meta.url), 'utf8');
  await db5.exec(m010);
  await db5.exec(m010); // idempoten, dan fungsi yang tidak ada (bookings_webhook_dispatch) dilewati
  const priv = (await db5.query(`SELECT has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE') AS anon_exec,
    has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') AS auth_exec,
    (SELECT proconfig FROM pg_proc WHERE proname = 'handle_new_user') AS cfg`)).rows[0];
  assert(!priv.anon_exec && !priv.auth_exec, '010: anon dan authenticated tidak bisa EXECUTE fungsi trigger');
  assert(JSON.stringify(priv.cfg).includes('search_path='), '010: handle_new_user punya search_path tetap');
  await db5.exec(`SET ROLE anon; INSERT INTO auth.users (email, raw_user_meta_data) VALUES ('budi@example.com', '{"full_name":"Budi"}'); RESET ROLE;`);
  const member = (await db5.query(`SELECT username, full_name FROM public.members`)).rows[0];
  assert(member?.username === 'budi' && member?.full_name === 'Budi', '010: signup oleh anon tetap membuat member lewat trigger');

  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
