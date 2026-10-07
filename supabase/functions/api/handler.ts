// GC Hub Booking API v1: logika HTTP murni (Web Request/Response), tanpa ketergantungan Deno.
// Akses data lewat interface ApiDb supaya bisa diuji di Node dengan Postgres asli (scripts/test-booking-api.ts).

export interface ApiKeyRecord {
  id: string;
  name: string;
  scopes: string[];
  revoked_at: string | null;
}

export interface IdempotencyRecord {
  request_hash: string;
  status_code: number; // 0 = masih diproses
  response: unknown;
}

export interface CreateBookingArgs {
  apiKeyId: string;
  source: string;
  type: 'queue' | 'slot';
  pcId: string | null;
  paketId: string;
  playerName: string;
  scheduledAt: string | null;
  paymentStatus: 'unpaid' | 'paid';
  phone: string | null;
  externalRef: string | null;
  paymentRef: string | null;
}

export interface ApiDb {
  findKeyByHash(hash: string): Promise<ApiKeyRecord | null>;
  hit(keyId: string): Promise<boolean>;
  /** null = klaim berhasil (request baru). Selain itu = request dengan key yang sama sudah pernah ada. */
  claimIdempotency(keyId: string, idemKey: string, requestHash: string): Promise<IdempotencyRecord | null>;
  completeIdempotency(keyId: string, idemKey: string, statusCode: number, response: unknown): Promise<void>;
  releaseIdempotency(keyId: string, idemKey: string): Promise<void>;
  availability(paketId: string | null, at: string | null): Promise<unknown>;
  listPakets(): Promise<unknown[]>;
  createBooking(args: CreateBookingArgs): Promise<unknown>;
  getBooking(keyId: string, id: string): Promise<unknown | null>;
  cancelBooking(keyId: string, id: string, reason: string | null): Promise<unknown>;
}

/** Error bisnis dari fungsi SQL (RAISE EXCEPTION '<KODE>'). */
export class BusinessError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

const BUSINESS_ERRORS: Record<string, { status: number; message: string }> = {
  INVALID_PLAYER_NAME: { status: 400, message: 'player_name wajib 1-60 karakter.' },
  INVALID_BOOKING_TYPE: { status: 400, message: 'type harus queue atau slot.' },
  INVALID_PAYMENT_STATUS: { status: 400, message: 'payment_status harus unpaid atau paid.' },
  PC_REQUIRED: { status: 400, message: 'pc_id wajib untuk booking antre (type queue).' },
  SCHEDULE_REQUIRED: { status: 400, message: 'scheduled_at wajib untuk booking jam (type slot).' },
  PC_NOT_FOUND: { status: 422, message: 'PC tidak ditemukan.' },
  PAKET_NOT_FOUND: { status: 422, message: 'Paket tidak ditemukan.' },
  SCHEDULE_OUT_OF_RANGE: { status: 422, message: 'scheduled_at harus antara 10 menit sampai 7 hari dari sekarang.' },
  PC_MAINTENANCE: { status: 409, message: 'PC sedang maintenance.' },
  PC_QUEUE_FULL: { status: 409, message: 'PC ini sudah punya antrean. Pilih PC lain atau booking jam tertentu.' },
  SLOT_FULL: { status: 409, message: 'Semua PC sudah dibooking di jam tersebut.' },
  PC_SLOT_TAKEN: { status: 409, message: 'PC ini sudah dibooking di jam tersebut.' },
  CONFLICT: { status: 409, message: 'Booking bentrok dengan booking lain. Coba lagi.' },
  BOOKING_NOT_FOUND: { status: 404, message: 'Booking tidak ditemukan.' },
  BOOKING_NOT_CANCELLABLE: { status: 409, message: 'Hanya booking berstatus pending yang bisa dibatalkan.' },
};

/** Ubah error database (pesan RAISE atau unique violation) jadi BusinessError bila dikenali. */
export function toBusinessError(err: { message?: string; code?: string } | null | undefined): BusinessError | null {
  if (!err) return null;
  const code = Object.keys(BUSINESS_ERRORS).find(c => err.message === c || err.message?.startsWith(`${c}`));
  if (code) return new BusinessError(code);
  if (err.code === '23505') return new BusinessError('CONFLICT');
  return null;
}

const MAX_BODY_BYTES = 10_000;

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

function fail(status: number, code: string, message: string, extraHeaders?: Record<string, string>): Response {
  return json(status, { error: { code, message } }, extraHeaders);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function readApiKey(req: Request): string | null {
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.match(/^Bearer\s+(gch_[0-9a-f]{48})$/i)?.[1];
  const header = req.headers.get('x-api-key')?.trim();
  const key = bearer || header || null;
  return key && /^gch_[0-9a-f]{48}$/.test(key) ? key : null;
}

type Validated<T> = { ok: true; value: T } | { ok: false; field: string; message: string };

function optionalString(v: unknown, field: string, max: number, pattern?: RegExp): Validated<string | null> {
  if (v === undefined || v === null || v === '') return { ok: true, value: null };
  if (typeof v !== 'string' || v.trim().length > max) return { ok: false, field, message: `${field} maksimal ${max} karakter.` };
  if (pattern && !pattern.test(v.trim())) return { ok: false, field, message: `${field} tidak valid.` };
  return { ok: true, value: v.trim() };
}

function validateCreate(body: any, apiKey: ApiKeyRecord): Validated<CreateBookingArgs> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, field: 'body', message: 'Body harus objek JSON.' };

  const type = body.type ?? 'queue';
  if (type !== 'queue' && type !== 'slot') return { ok: false, field: 'type', message: 'type harus queue atau slot.' };

  if (typeof body.paket_id !== 'string' || !body.paket_id.trim() || body.paket_id.length > 64) {
    return { ok: false, field: 'paket_id', message: 'paket_id wajib diisi.' };
  }
  if (typeof body.player_name !== 'string' || body.player_name.trim().length < 1 || body.player_name.trim().length > 60) {
    return { ok: false, field: 'player_name', message: 'player_name wajib 1-60 karakter.' };
  }

  const pcId = optionalString(body.pc_id, 'pc_id', 64);
  if (!pcId.ok) return pcId;
  if (type === 'queue' && !pcId.value) return { ok: false, field: 'pc_id', message: 'pc_id wajib untuk booking antre (type queue).' };

  let scheduledAt: string | null = null;
  if (type === 'slot') {
    const t = typeof body.scheduled_at === 'string' ? Date.parse(body.scheduled_at) : NaN;
    if (!Number.isFinite(t) || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(body.scheduled_at)) {
      return { ok: false, field: 'scheduled_at', message: 'scheduled_at wajib ISO 8601 dengan zona waktu, contoh 2026-09-25T19:00:00+07:00.' };
    }
    scheduledAt = new Date(t).toISOString();
  }

  const paymentStatus = body.payment_status ?? 'unpaid';
  if (paymentStatus !== 'unpaid' && paymentStatus !== 'paid') {
    return { ok: false, field: 'payment_status', message: 'payment_status harus unpaid atau paid.' };
  }

  const phone = optionalString(body.phone, 'phone', 16, /^\+?[0-9]{8,15}$/);
  if (!phone.ok) return phone;
  const externalRef = optionalString(body.external_ref, 'external_ref', 100);
  if (!externalRef.ok) return externalRef;
  const paymentRef = optionalString(body.payment_ref, 'payment_ref', 100);
  if (!paymentRef.ok) return paymentRef;

  return {
    ok: true,
    value: {
      apiKeyId: apiKey.id,
      source: `api:${apiKey.name}`.slice(0, 80),
      type,
      pcId: pcId.value,
      paketId: body.paket_id.trim(),
      playerName: body.player_name.trim(),
      scheduledAt,
      paymentStatus,
      phone: phone.value,
      externalRef: externalRef.value,
      paymentRef: paymentRef.value,
    },
  };
}

function businessResponse(err: BusinessError): Response {
  const known = BUSINESS_ERRORS[err.code];
  return fail(known.status, err.code, known.message);
}

export function createHandler(db: ApiDb) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // Supabase meneruskan /api/v1/... (kadang dengan prefix /functions/v1); buang prefix lalu ambil setelah /v1
    const bare = url.pathname.replace(/^\/functions\/v1/, '').replace(/^\/api(?=\/)/, '');
    const path = bare.match(/^\/v1(\/.*)?$/)?.[1]?.replace(/\/+$/, '') || '';

    const rawKey = readApiKey(req);
    if (!rawKey) return fail(401, 'UNAUTHORIZED', 'Sertakan API key: Authorization: Bearer gch_...');
    const apiKey = await db.findKeyByHash(await sha256Hex(rawKey));
    if (!apiKey || apiKey.revoked_at) return fail(401, 'UNAUTHORIZED', 'API key tidak valid atau sudah dicabut.');

    if (!(await db.hit(apiKey.id))) {
      return fail(429, 'RATE_LIMITED', 'Terlalu banyak request. Coba lagi sebentar.', { 'Retry-After': '60' });
    }

    const need = (scope: string) => (apiKey.scopes.includes(scope) ? null : fail(403, 'FORBIDDEN_SCOPE', `API key tidak punya scope ${scope}.`));

    try {
      // GET /v1/availability?paket_id=&at=
      if (path === '/availability') {
        if (req.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Gunakan GET.');
        const denied = need('read');
        if (denied) return denied;
        const at = url.searchParams.get('at');
        if (at !== null && !Number.isFinite(Date.parse(at))) return fail(400, 'VALIDATION_ERROR', 'at harus ISO 8601.');
        return json(200, await db.availability(url.searchParams.get('paket_id'), at ? new Date(at).toISOString() : null));
      }

      // GET /v1/pakets
      if (path === '/pakets') {
        if (req.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Gunakan GET.');
        const denied = need('read');
        if (denied) return denied;
        return json(200, { data: await db.listPakets() });
      }

      // POST /v1/bookings
      if (path === '/bookings') {
        if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Gunakan POST.');
        const denied = need('bookings:write');
        if (denied) return denied;

        const idemKey = req.headers.get('idempotency-key')?.trim() || '';
        if (!/^[\w.:-]{8,100}$/.test(idemKey)) {
          return fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Header Idempotency-Key wajib (8-100 karakter, contoh UUID).');
        }

        const text = await req.text();
        if (text.length > MAX_BODY_BYTES) return fail(413, 'PAYLOAD_TOO_LARGE', 'Body terlalu besar.');
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          return fail(400, 'INVALID_JSON', 'Body bukan JSON yang valid.');
        }

        const requestHash = await sha256Hex(text);
        const previous = await db.claimIdempotency(apiKey.id, idemKey, requestHash);
        if (previous) {
          if (previous.request_hash !== requestHash) {
            return fail(422, 'IDEMPOTENCY_MISMATCH', 'Idempotency-Key ini sudah dipakai untuk body yang berbeda.');
          }
          if (previous.status_code === 0) {
            return fail(409, 'IDEMPOTENCY_IN_PROGRESS', 'Request dengan Idempotency-Key ini masih diproses.');
          }
          return json(previous.status_code, previous.response, { 'Idempotent-Replayed': 'true' });
        }

        const finish = async (status: number, payload: unknown): Promise<Response> => {
          await db.completeIdempotency(apiKey.id, idemKey, status, payload);
          return json(status, payload);
        };

        const v = validateCreate(body, apiKey);
        if (!v.ok) return finish(400, { error: { code: 'VALIDATION_ERROR', message: v.message, field: v.field } });

        try {
          return await finish(201, { data: await db.createBooking(v.value) });
        } catch (err) {
          if (err instanceof BusinessError) {
            const known = BUSINESS_ERRORS[err.code];
            return finish(known.status, { error: { code: err.code, message: known.message } });
          }
          await db.releaseIdempotency(apiKey.id, idemKey); // error server: boleh dicoba ulang dengan key sama
          throw err;
        }
      }

      // GET /v1/bookings/:id  |  POST /v1/bookings/:id/cancel
      const match = path.match(/^\/bookings\/([\w-]{1,64})(\/cancel)?$/);
      if (match) {
        const [, id, cancel] = match;
        if (cancel) {
          if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Gunakan POST.');
          const denied = need('bookings:write');
          if (denied) return denied;
          let reason: string | null = null;
          const text = await req.text();
          if (text) {
            try {
              const body = JSON.parse(text);
              reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 200) : null;
            } catch {
              return fail(400, 'INVALID_JSON', 'Body bukan JSON yang valid.');
            }
          }
          return json(200, { data: await db.cancelBooking(apiKey.id, id, reason) });
        }

        if (req.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Gunakan GET.');
        const denied = need('read');
        if (denied) return denied;
        const booking = await db.getBooking(apiKey.id, id);
        return booking ? json(200, { data: booking }) : businessResponse(new BusinessError('BOOKING_NOT_FOUND'));
      }

      return fail(404, 'NOT_FOUND', 'Endpoint tidak ditemukan. Lihat docs/BOOKING_API.md.');
    } catch (err) {
      if (err instanceof BusinessError) return businessResponse(err);
      console.error('[booking-api] unexpected error', err);
      return fail(500, 'INTERNAL_ERROR', 'Terjadi kesalahan server.');
    }
  };
}
