# GC Hub Booking API v1

API publik untuk aplikasi booking (GC Net Booking atau pihak lain) yang ingin memasukkan booking ke billing GC Hub.

```
Aplikasi Booking  --HTTPS + API key-->  Supabase Edge Function "api"  -->  Postgres (bookings)
                                                                              |
GC Hub Server (LAN warnet)  <-- realtime + outbox (koneksi keluar saja) ------+
```

GC Hub Server tidak perlu IP publik atau port forwarding. Billing tetap jalan penuh saat internet putus; booking yang masuk selama offline muncul di menu **BOOKING** kasir begitu server tersambung lagi.

---

## 1. Setup sekali jalan

1. **Rotate service role key** lama di dashboard Supabase (key lama pernah ter-commit di repo).
2. Jalankan migration berurutan di SQL Editor atau `supabase db push`:
   - `supabase/migrations/004_booking_api.sql`
   - `supabase/migrations/005_booking_guards.sql` (jika gagal, pesan error berisi query untuk merapikan booking dobel lama)
   - `supabase/migrations/009_webhook_retry.sql` (retry webhook, ikut menyalakan pg_cron kalau tersedia)
3. Aktifkan extension **pg_net** (Database > Extensions) agar webhook terkirim. Tanpa pg_net, booking tetap jalan, hanya webhook yang tidak dikirim. Aktifkan juga **pg_cron** sebelum 009 kalau migration tidak bisa menyalakannya sendiri.
4. Deploy Edge Function:
   ```bash
   supabase functions deploy api --no-verify-jwt
   ```
   `--no-verify-jwt` wajib karena autentikasi memakai API key GC Hub, bukan JWT Supabase.
5. Buat API key (hasilnya hanya tampil sekali, simpan di env aplikasi booking):
   ```sql
   SELECT public.api_create_key('GC Net Booking');
   -- key read-only:  SELECT public.api_create_key('Dashboard Partner', ARRAY['read']);
   ```
6. Di GC Hub Server: **Pengaturan > Cloud**, isi Project URL dan service role key yang baru, lalu restart aplikasi server.

Cabut key: `UPDATE api_keys SET revoked_at = now() WHERE key_prefix = 'gch_xxxxxxxx';`

Base URL: `https://<project-ref>.supabase.co/functions/v1/api/v1`

---

## 2. Aturan umum

| Hal | Aturan |
|---|---|
| Auth | Header `Authorization: Bearer gch_...` atau `X-API-Key: gch_...` |
| Scope | `read` untuk GET, `bookings:write` untuk membuat/membatalkan |
| Rate limit | Default 60 request/menit per key. Lewat batas: `429` + `Retry-After: 60` |
| Idempotensi | `POST /bookings` wajib header `Idempotency-Key` (8-100 karakter, contoh UUID). Kirim ulang dengan key sama = respons sama, booking tidak dobel |
| Waktu | ISO 8601 **dengan zona waktu**, contoh `2026-09-25T19:00:00+07:00` |
| Error | `{"error": {"code": "PC_QUEUE_FULL", "message": "...", "field": "..."}}` |

Panggil API dari **server** aplikasi booking (Next.js route handler / server action), jangan dari browser. API key tidak boleh sampai ke pengguna.

---

## 3. Endpoint

### GET `/v1/availability`

Status semua PC, antrean, dan status online warnet. Tambahkan `?paket_id=p3&at=<ISO>` untuk cek sisa kapasitas booking jam tertentu.

```json
{
  "server_online": true,
  "server_last_seen_at": "2026-09-25T11:59:40Z",
  "pcs": [
    { "id": "pc-01", "name": "PC-01", "status": "occupied", "expected_empty_time": "2026-09-25T12:40:00Z", "queue_open": true },
    { "id": "pc-02", "name": "PC-02", "status": "available", "expected_empty_time": null, "queue_open": false }
  ],
  "slot": { "at": "2026-09-25T12:00:00Z", "minutes": 180, "capacity": 10, "booked": 3, "remaining": 7 }
}
```

`server_online: false` berarti kasir belum bisa memproses booking sekarang. Booking tetap diterima dan diproses saat server online.

### GET `/v1/pakets`

```json
{ "data": [ { "id": "p1", "name": "Paket 1 Jam", "price": 4000, "duration_minutes": 60, "fixed_start_time": null, "fixed_end_time": null, "days": null } ] }
```

### POST `/v1/bookings`

Dua mode, sesuai alur `docs/flowchart_booking_queue.html`:

- **`queue`**, antre di PC yang sedang dipakai. `pc_id` wajib. Satu antrean per PC.
- **`slot`**, datang jam tertentu. `scheduled_at` wajib (10 menit sampai 7 hari ke depan). `pc_id` opsional; kapasitas dihitung dari jumlah PC non-maintenance.

```http
POST /v1/bookings
Authorization: Bearer gch_...
Idempotency-Key: 5b2c0e9e-7f0a-4d1b-9f55-3c7c1f0a2e11
Content-Type: application/json

{
  "type": "queue",
  "pc_id": "pc-01",
  "paket_id": "p1",
  "player_name": "Budi",
  "phone": "081234567890",
  "payment_status": "paid",
  "payment_ref": "QRIS-2026-0925-001",
  "external_ref": "ORDER-77"
}
```

`201 Created`:

```json
{ "data": { "id": "bk_9f3a2c1b0d4e5f60", "type": "queue", "status": "pending", "pc_id": "pc-01", "paket_id": "p1",
  "player_name": "Budi", "scheduled_at": null, "payment_status": "paid", "phone": "081234567890", "external_ref": "ORDER-77",
  "cancel_reason": null, "created_at": "...", "started_at": null, "completed_at": null } }
```

`phone`, `external_ref`, `payment_ref` disimpan di tabel terpisah (`booking_private`) yang tidak bisa dibaca publik.

### GET `/v1/bookings/{id}`

Hanya booking yang dibuat oleh API key yang sama. Booking milik key lain = `404`.

### POST `/v1/bookings/{id}/cancel`

Body opsional `{"reason": "Tidak jadi datang"}`. Hanya status `pending`.

### Status booking

```
pending --(kasir mulai sesi / disetujui dari HP)--> active --(sesi selesai)--> completed
   \--(dibatalkan pelanggan / ditolak kasir)--> cancelled
```

---

## 4. Kode error

| HTTP | code | Arti |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Field tidak valid, lihat `field` |
| 400 | `IDEMPOTENCY_KEY_REQUIRED`, `INVALID_JSON` | Header/body salah |
| 401 | `UNAUTHORIZED` | Key tidak ada, salah, atau dicabut |
| 403 | `FORBIDDEN_SCOPE` | Key tidak punya scope yang dibutuhkan |
| 404 | `BOOKING_NOT_FOUND`, `NOT_FOUND` | Booking/endpoint tidak ada |
| 409 | `PC_QUEUE_FULL` | PC sudah punya antrean |
| 409 | `SLOT_FULL`, `PC_SLOT_TAKEN` | Jam tersebut penuh / PC itu sudah dibooking |
| 409 | `PC_MAINTENANCE` | PC sedang maintenance |
| 409 | `BOOKING_NOT_CANCELLABLE` | Booking sudah aktif/selesai/batal |
| 409 | `IDEMPOTENCY_IN_PROGRESS` | Request kembar masih diproses, coba lagi sebentar |
| 422 | `PC_NOT_FOUND`, `PAKET_NOT_FOUND` | Referensi tidak ada |
| 422 | `SCHEDULE_OUT_OF_RANGE` | Jadwal di luar 10 menit sampai 7 hari |
| 422 | `IDEMPOTENCY_MISMATCH` | Idempotency-Key dipakai ulang dengan body berbeda |
| 429 | `RATE_LIMITED` | Terlalu banyak request |

Error bisnis (4xx) ikut disimpan untuk idempotensi: retry dengan key yang sama mengembalikan error yang sama. Error `500` tidak disimpan, jadi aman di-retry.

---

## 5. Webhook

Daftarkan endpoint (URL wajib `https`):

```sql
INSERT INTO webhook_endpoints (api_key_id, url)
SELECT id, 'https://booking.example.com/api/gchub-webhook' FROM api_keys WHERE name = 'GC Net Booking'
RETURNING secret;   -- simpan secret ini di aplikasi penerima
```

Untuk aplikasi milik sendiri yang perlu tahu semua booking (termasuk dari web), set `include_all_sources = true`.

Event: `booking.created`, `booking.started`, `booking.completed`, `booking.cancelled`, `booking.reassigned`.

```json
{ "event": "booking.started", "occurred_at": "...", "delivery_id": "uuid",
  "data": { "id": "bk_...", "type": "queue", "status": "active", "pc_id": "pc-03", "previous_pc_id": "pc-01", "...": "..." } }
```

Verifikasi di penerima (Node):

```ts
import { createHmac, timingSafeEqual } from 'crypto';

export function isValidGcHubWebhook(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader || '');
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Gunakan body mentah persis seperti diterima, jangan hasil `JSON.stringify` ulang. Balas dengan status 2xx; status lain, timeout 5 detik, atau error jaringan dihitung gagal.

**Retry** (migration 009): kiriman gagal diulang setelah 1, 4, 16, lalu 64 menit, maksimal 5 kiriman. Body kiriman ulang identik, termasuk `delivery_id`, jadi pakai `delivery_id` untuk mengabaikan kiriman ganda. Job pg_cron `gchub-webhook-retry` menjalankan `public.webhook_retry_pending()` tiap menit. Status tiap kiriman ada di `webhook_deliveries` (`status` = `pending`, `delivered`, atau `failed`, plus `attempts` dan `last_error`):

```sql
SELECT event, booking_id, status, attempts, last_error, sent_at FROM webhook_deliveries ORDER BY id DESC LIMIT 20;
```

Untuk rekonsiliasi setelah penerima lama mati, tetap panggil `GET /v1/bookings/{id}`.

---

## 6. Sisi kasir (GC Hub Server)

- Booking baru memicu bunyi notifikasi dan tombol **BOOKING** di top bar menyala.
- Di modal antrean kasir bisa **Mulai Sesi** di PC mana pun yang kosong, **Alihkan ke PC ini**, atau **Tolak** dengan alasan.
- Booking yang disetujui dari HP (status `active`) langsung memulai sesi di PC yang dibooking. Kalau PC masih dipakai, kasir mendapat notifikasi untuk memilih PC lain.
- Durasi dan harga sesi mengikuti paket booking. Saat sesi berakhir, booking otomatis `completed` dan omzet tercatat di tabel `logs`.
- Semua perubahan ke cloud lewat outbox SQLite (`CloudOutbox`): offline aman, urutan terjaga, retry otomatis.

---

## 7. Menjalankan test

```bash
npm run test:booking:sql   # migration 004/005 di Postgres asli (PGlite)
npm run test:booking:api   # Edge Function handler end-to-end
npm run check:edge         # type-check index.ts dengan Deno
npm run test:cloud-sync    # outbox, heartbeat, diff PC, filter echo (GC Hub Server)
```
