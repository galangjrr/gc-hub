# GC Hub

Sistem billing dan manajemen warnet untuk Windows. Satu aplikasi Electron dengan dua mode:

- **Server**: dipasang di PC kasir. Billing engine, database SQLite, POS, laporan, remote PC, sync ke Supabase.
- **Client**: dipasang di tiap PC bilik. Layar kunci, login member atau voucher, kapsul sisa waktu, proteksi sistem.

Server dan client ngobrol lewat WebSocket di LAN. Billing tetap jalan penuh walau internet putus.

## Struktur

```
src/
  main/       Electron main process, dipakai dua mode. Mode dipilih lewat VITE_APP_MODE
  preload/    Jembatan IPC aman antara main dan UI
  server/     UI kasir, database, billing engine, WebSocket server, sync Supabase
  client/     UI layar kunci, WebSocket client, proteksi sistem
  shared/     Protokol, tipe, aturan billing, tema, CSS, komponen UI bersama
supabase/     Migration dan Edge Function booking API
drizzle/      Migration SQLite
scripts/      Test suite, runner dev, packaging, signing
public/       Logo yang ikut ke build
icons/        Ikon aplikasi
docs/         Booking API, design system, kontrak sync
```

## Menjalankan

Butuh Node.js 20 dan Windows.

```bash
npm install
npm run electron:server   # mode server, UI di port 5174
npm run electron:client   # mode client, UI di port 5175
```

Client membaca alamat server dari `client-config.json` di folder kerja. File ini dibuat otomatis saat pertama jalan.

## Test

```bash
npm test          # typecheck plus semua suite
npm run typecheck
```

## Build

```bash
npm run dist:release
```

Hasil build masuk ke `release/`.

## Konfigurasi Supabase

URL dan key Supabase diisi lewat halaman Pengaturan di aplikasi server, bukan di kode. Jangan commit key apa pun. Setup booking API ada di [docs/BOOKING_API.md](docs/BOOKING_API.md).

Panduan visual ada di [DESIGN.md](DESIGN.md).
