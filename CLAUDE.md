# GC Hub: kontrak kerja

File ini dibaca otomatis oleh Claude Code, termasuk sesi cloud. Aturan di sini wajib diikuti.

GC Hub adalah billing warnet untuk Windows: satu aplikasi Electron dengan dua mode, **server** di PC kasir dan **client** di tiap PC bilik. Mode dipilih lewat `VITE_APP_MODE`.

## 1. Batas folder

| Folder | Isi | Boleh import dari |
|---|---|---|
| `src/server/` | UI kasir, SQLite, billing engine, WebSocket server, sync Supabase | `src/shared/` |
| `src/client/` | Layar kunci, kapsul waktu, WebSocket client, proteksi sistem | `src/shared/` |
| `src/shared/` | Protokol, tipe, aturan billing, tema, CSS, komponen UI bersama | `src/shared/` saja |
| `src/main/` | Electron main process, dipakai dua mode | `src/server/`, `src/shared/` |
| `src/preload/` | Satu-satunya jembatan main ke renderer | `src/shared/` |

- `src/server/` dan `src/client/` **tidak boleh saling import**. Yang dipakai dua sisi pindahkan ke `src/shared/`.
- Logika di `src/shared/*.ts` harus murni: tanpa Node, Electron, atau akses DB. Komponen React bersama ada di `src/shared/ui/`.

## 2. Kontrak server dan client

1. **Server adalah otoritas.** Sesi, sisa waktu, harga, saldo member, voucher, dan transaksi diputuskan dan disimpan di SQLite server. Billing engine ada di `src/server/engine/billingEngine.ts` dengan tick 1 detik. Client cuma menampilkan dan mengirim permintaan, tidak pernah menghitung harga atau mengubah saldo sendiri.
2. **Transport:** WebSocket JSON di LAN, port default `7894`. Bentuk paket adalah `Packet` di `src/shared/protocol.ts`.
3. **Opcode dan payload:** opcode baru wajib ditambah dulu di enum `OpCode`, dengan interface payload bertipe di `protocol.ts`. Kirim dan terima diimplementasikan di dua sisi dalam satu commit. Perintah remote memakai `OpCode.REMOTE_COMMAND`; action baru ditambah ke union `RemoteCommandPayload['action']`. Jangan pakai `any` untuk payload baru.
4. **Keamanan LAN:** kalau kunci LAN di-set, setiap paket ditandatangani HMAC SHA-256 lewat `src/shared/lanAuth.ts`, dan paket yang tanda tangannya salah ditolak. Kunci LAN disimpan terenkripsi DPAPI lewat `safeStorage` dan hanya admin yang bisa mengubah.
5. **Offline:** client menyimpan snapshot sesi lokal dan mengirimnya saat `CLIENT_REGISTER`, lalu server memotong waktu yang terpakai selama LAN putus. Billing harus tetap jalan tanpa internet. Supabase cuma replikasi dan booking, bukan sumber kebenaran.
6. **Main dan renderer:** renderer hanya bicara ke main lewat `window.electronAPI` dari `src/preload/index.ts`. Setiap handler IPC di main memvalidasi input dan mengecek peran admin untuk aksi sensitif. Renderer tidak pernah menerima Node API, service key Supabase, atau secret lain.
7. **Aturan billing bersama:** rumus yang dipakai engine sekaligus UI ada di `src/shared/personalBilling.ts`, `src/shared/packageRules.ts`, dan `src/shared/transactions.ts`. Ubah rumus hanya di sana. Engine tetap otoritas; UI cuma menyembunyikan yang bakal ditolak engine.
8. **Cloud:** skema Supabase dan alur sync ada di `docs/GC_NET_HUB_CONTRACT.md`. Booking API ada di `docs/BOOKING_API.md`.

## 3. Aturan kode

- Bikin cuma yang dibutuhkan sekarang. Pakai ulang helper yang sudah ada, lalu standard library, lalu dependensi yang sudah terpasang. Dependensi baru harus ada alasannya.
- Validasi input di awal fungsi dengan guard clause dan langsung return error. Hindari percabangan dalam.
- Query SQL wajib parameterized lewat Drizzle atau prepared statement. Jangan gabungkan input ke string SQL.
- Dilarang meninggalkan TODO, stub, atau kode setengah jadi.
- Penyederhanaan yang sengaja punya batas diberi komentar `ponytail:` berisi batasnya dan jalur upgrade-nya.
- Nama di kode, DB, dan protokol pakai bahasa Inggris. Teks yang tampil di UI pakai bahasa Indonesia sesuai `docs/UI_COPYWRITING_GLOSSARY.md`.
- Logika yang tidak sepele, seperti uang, waktu, auth, atau parser, wajib meninggalkan satu test di `scripts/test-*.ts` dan didaftarkan ke `npm test`.

## 4. Aturan UI

- `DESIGN.md` adalah satu-satunya acuan visual: token warna `--gc-*` di `src/shared/index.css`, font Geist, radius, dan spasi.
- Pakai primitive dari `src/shared/ui/primitives.tsx`, yaitu `Modal`, `Field`, `INPUT`, dan `BTN_*`, juga `ConfirmModal` dan `ErrorBoundary` di `src/shared/ui/`. Gabung class lewat `cn()` dari `src/shared/ui/utils.ts`, bukan template string.
- Ikon hanya dari `lucide-react`, tanpa emoji atau simbol teks.
- Setiap tampilan data wajib punya empat status: loading skeleton, kosong, error dengan tombol coba lagi, dan sukses.
- HTML semantik, bisa dipakai penuh dengan keyboard, dan fokus terlihat lewat `FOCUS`.

## 5. Keamanan

- Repo ini **public**. Jangan commit key, token, `.env`, database, sertifikat, atau `client-config.json`.
- URL dan key Supabase diisi lewat halaman Pengaturan di server, bukan di kode.
- DevTools dan menu bawaan Electron mati di luar mode dev. Jangan diaktifkan lagi.
- Jangan menyebut merek software billing lain, dan jangan memasukkan aset atau dokumen hasil analisis software pihak ketiga ke repo.

## 6. Git

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`, `style:`.
- Sesi cloud kerja di branch sendiri dan membuka PR. Jangan push langsung ke `main`.
- Satu PR untuk satu fitur atau satu perbaikan.

## 7. Verifikasi

Sebelum lapor selesai:

```bash
npm run typecheck
npm test            # suite lengkap, butuh Windows
```

**Di sesi cloud Linux:** jalankan `npm run typecheck`, build Vite, dan test yang berjalan lewat `node` atau `tsx`, yaitu `test:billing`, `test:personal`, `test:lan-auth`, `test:transactions`, `test:booking:sql`, dan `test:booking:api`. Test yang lewat `scripts/run-electron-test.mjs` butuh Electron di Windows; lewati dan sebutkan di PR bahwa test itu belum dijalankan. Fitur khusus Windows, seperti DPAPI, registry, process guard, dan input injector, tidak bisa diverifikasi di cloud.
