# GC-Net-Hub Cloud Integration Contract
> **SSOT Kontrak Integrasi Linear:** [gc-net-hub](https://github.com/galangjrr/gc-net-hub.git) (Vercel: `https://gcnethub.vercel.app/`) <-> [gc-hub](file:///C:/Users/Galang/Documents/Project%20App/gc-hub/) (Desktop Electron Server & Client).

---

## 1. Pembagian Peran Arsitektur (Ecosystem Topology)
* **GC-Hub (Desktop Electron + SQLite):** Single Source of Truth (SSOT) lokal di PC server warnet. Mengendalikan hardware PC bilik, kiosk lock screen, 1-second billing tick, dan cash drawer offline.
* **GC-Net-Hub (Next.js App Router + Vercel + Supabase):** Portal booking online publik (`/data-booking`), Mobile Cashier Companion HP (`/kasir`), dan telemetri omzet remote (`/rekap`, `/log`).
* **Supabase PostgreSQL (Cloud Bridge):** Message broker dan database replikasi dua arah antara Electron Server dan Web Vercel.

---

## 2. Skema Tabel Supabase (SSOT Cloud Database)

### A. Tabel pcs (Status Real-Time PC Bilik)
- `id` (text PK): Station ID (contoh: "PC-01", "PC-02")
- `name` (text): Nama PC
- `status` (text): 'available' | 'occupied' | 'maintenance'
- `expected_empty_time` (timestamptz): Estimasi jam selesai billing (ISO 8601)
- `image` (text): URL foto bilik PC
- `specs` (jsonb): Hardware spec (cpu, gpu, ram, monitor, keyboard, games)

### B. Tabel pakets (Master Tarif & Paket)
- `id` (text PK): ID paket
- `name` (text): Nama paket (contoh: "Paket 2 Jam", "Paket Malam")
- `price` (integer): Harga paket (Rp)
- `duration_minutes` (integer): Durasi menit paket
- `fixed_start_time` (text): Jam mulai paket tetap ("22:00")
- `fixed_end_time` (text): Jam selesai paket tetap ("04:00")
- `days` (text[]): Hari aktif (["Sen", "Sel", "Rab"])
- `is_custom` (boolean): Flag paket kustom

### C. Tabel bookings (Queue Booking & Remote Trigger)
- `id` (text PK): ID unik booking
- `pc_id` (text FK pcs.id): PC yang dibooking
- `paket_id` (text FK pakets.id): Paket yang dipilih
- `player_name` (text): Nama pelanggan
- `status` (text): 'pending' | 'active' | 'completed' | 'cancelled'
- `created_at` (timestamptz): Timestamp booking
- `ss_bukti` (text): URL bukti bayar/transfer

### D. Tabel inventory (F&B Kasir)
- `id` (text PK): ID item
- `name` (text): Nama makanan/minuman
- `price` (integer): Harga jual
- `stock` (integer): Stok etalase
- `category` (text): 'food' | 'drink' | 'other' | 'staff_account'

### E. Tabel logs (Riwayat Transaksi Keuangan)
- `id` (text PK): ID log
- `player_name` (text): Nama user
- `pc_name` (text): Nama PC
- `paket_name` (text): Nama paket
- `price` (integer): Nominal uang masuk
- `start_time` (timestamptz): Waktu mulai
- `end_time` (timestamptz): Waktu selesai
- `status` (text): 'Selesai' | 'Batal'
- `reason` (text): Alasan jika Batal

### F. Tabel settings (Konfigurasi Warnet)
- `id` (text PK): Setting ID
- `userCounter` (integer): Auto-counter user
- `daily_pdf_revenue` (integer): Omzet harian sync

---

## 3. Dataflow & Event Realtime Sinkronisasi

1. **Sinkronisasi Status PC (GC-Hub -> Supabase):**
   Tiap ada perubahan sesi di Electron Desktop (Login, Logout, Tambah Jam), GC-Hub mengupdate baris terkait di tabel `pcs` (`status`, `expected_empty_time`).
2. **Booking Masuk (Web Vercel -> GC-Hub):**
   Customer submit booking di `gcnethub.vercel.app/data-booking` -> row insert ke `bookings` status `pending`.
   GC-Hub Electron Server mendengarkan Realtime WebSocket Supabase -> memainkan audio notifikasi kasir `newClientOrder.wav`.
3. **Eksekusi Kasir Mobile (HP -> GC-Hub):**
   Owner/kasir buka `/data-booking` atau `/kasir` di HP -> Approve booking -> Supabase update `status: 'active'`.
   GC-Hub Server menangkap update -> mengirim paket WebSocket lokal `AUTH_SUCCESS` ke PC bilik bersangkutan -> Lockscreen bilik terbuka otomatis.
4. **Offline Resilience Law:**
   Jika koneksi internet putus, GC-Hub tetap beroperasi normal dengan database lokal SQLite (`data/gcserver.sqlite`).
   Begitu koneksi internet pulih, GC-Hub melakukan sync rekonsiliasi ke Supabase.

---

## 5. Pembaruan Kontrak: Booking API v1 (migration 004 & 005)

Detail lengkap endpoint, error, dan webhook ada di `docs/BOOKING_API.md`.

### Tabel & kolom baru
- `bookings` + kolom: `branch_id`, `source`, `api_key_id`, `booking_type` ('queue' | 'slot'), `scheduled_at`, `payment_status` ('unpaid' | 'paid'), `cancel_reason`, `started_at`, `completed_at`, `updated_at`. `pc_id` boleh NULL untuk booking jam (slot). `id` punya default `bk_<hex>`.
- `booking_private` (phone, external_ref, payment_ref), hanya service role.
- `branches` (heartbeat GC Hub Server: `last_seen_at`, `online_pcs`, `app_version`).
- `api_keys`, `api_rate_windows`, `api_idempotency`, `webhook_endpoints`, `webhook_deliveries`, `remote_commands`.
- Guard DB (005): maksimal satu antrean `pending` dan satu booking `active` per PC. Insert langsung dari web yang melanggar akan ditolak (`23505`), tampilkan pesan "PC sudah dibooking" di GC Net Hub.

### Alur yang berubah di GC Hub Server
- GC Hub tidak lagi menghapus baris `pcs` yang tidak dikenalnya, dan tidak menimpa status `maintenance` yang diset dari web.
- Log omzet sesi selesai sekarang benar-benar dikirim ke `logs` (id `log-hub-<startMs>-<pc>`), lewat outbox offline.
- Booking `active` yang diset dari HP memulai sesi di PC yang dibooking; saat sesi selesai GC Hub mengubahnya ke `completed`.
- Perintah remote dari HP owner masuk lewat tabel `remote_commands` (command: lock, unlock, restart, shutdown, broadcast_chat, start_session, add_time, replace_package, stop_session, move_station).

### Rekomendasi untuk repo GC Net Hub
1. Pindahkan pembuatan booking dari insert langsung (anon key) ke `POST /v1/bookings` via server route Next.js.
2. Setelah itu hapus policy `"Public Insert bookings"` dan batasi `"Public Read bookings"`, karena saat ini siapa pun dengan anon key bisa membaca dan menyisipkan booking.
