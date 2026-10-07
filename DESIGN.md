# Design System: GC Hub — Denah Bilik

Cetak biru visual untuk dua app: **Server Kasir** (`src/server`) dan **Client Kiosk** (`src/client`).
Semua layar wajib patuh ke dokumen ini. Token kode ada di `tailwind.config.js` dan var `--gc-*` di
`src/shared/index.css`; kalau nilai di sini berubah, ubah di dua tempat itu juga.

## 1. Visual Theme & Atmosphere

Denah lantai warnet dilihat dari meja kasir malam hari: gelap petrol yang tenang, bilik PC tersusun
rapi seperti denah, dan warna hanya muncul kalau ada yang perlu diperhatikan. Kasir harus bisa
membaca status 30 PC sekilas dari jarak satu meter tanpa membaca angka.

- **Density:** Cockpit Dense (8) untuk Server Kasir. Daily App Balanced (5) untuk Client Kiosk.
- **Variance:** Predictable (3). Ini alat kerja harian, bukan pameran. Grid rapi, posisi tombol tetap.
- **Motion:** Static Restrained (3). Gerak hanya untuk memberi tahu perubahan status, tidak ada
  animasi dekoratif yang makan CPU di PC kasir kentang.
- App jalan offline di LAN: font dibundel lokal, tidak ada CDN, tidak ada gambar remote.

## 2. Color Palette & Roles

### Permukaan
- **Lantai Malam** (#0B1214) — `canvas`, lapisan terdalam: latar di balik panel, track scrollbar.
- **Petrol Gelap** (#0F1719) — `surface-1`, latar utama jendela, top bar, sidebar.
- **Petrol Panel** (#152023) — `surface-2`, panel, modal, kartu PC tersedia.
- **Petrol Angkat** (#1B2A2E) — `surface-3`, hover, input, baris terpilih.
- **Petrol Karbon** (#223337) — `surface-carbon`, chip, elemen yang ditekan.
- **Garis Denah** (#24363A) — `hairline`, border 1px struktural.
- **Garis Tegas** (#31474C) — `hairline-strong`, border hover dan pemisah penting.

### Teks
- **Kapur** (#E3ECEA) — `text-primary`, judul dan isi utama.
- **Kapur Redup** (#B4C3C1) — `text-secondary`, isi pendukung.
- **Abu Petrol** (#86999A) — `text-muted`, label, metadata, timestamp.
- **Abu Mati** (#5A6C6E) — `text-disabled`, elemen nonaktif.

### Aksen dan Status
- **Teal Bilik** (#4FB3A3) — `primary`, SATU-SATUNYA aksen: tombol utama, fokus, sesi berjalan.
  Hover #63C4B4, active #3D9587. Teks di atas teal selalu #0F1719, bukan putih.
- **Amber Tagihan** (#E0A526) — `warning`: sisa waktu 5 menit atau kurang, belum bayar, app aktif.
- **Bata** (#E0604F) — `error`: PC terkunci, gagal, aksi merusak.
- **Biru Kabut** (#6FA8C9) — `info`: hanya untuk ikon informasi netral, jangan jadi aksen tombol.

Tint status pakai alpha dari warna yang sama, misal latar kartu belum bayar = amber 12 persen,
bukan warna baru. Bayangan diwarnai petrol lewat `--gc-shadow`, tidak pernah hitam murni.

### Tema Terang dan Gelap
Gelap adalah default. Terang dipilih lewat menu gear top bar, disimpan per mesin di
`localStorage` (`gchub_theme`), dan dipasang sebelum render oleh `src/shared/theme.ts`
dengan `<html data-theme="light">`. Nama token sama di dua tema, hanya nilainya yang berganti:

| Token | Gelap | Terang |
| --- | --- | --- |
| canvas | #0B1214 | #E4ECEA |
| surface-1 | #0F1719 | #EEF3F2 |
| surface-2 | #152023 | #FFFFFF |
| surface-3 | #1B2A2E | #E8EFEE |
| surface-carbon | #223337 | #DCE6E4 |
| hairline / strong | #24363A / #31474C | #D3DFDD / #B7C8C5 |
| text-primary | #E3ECEA | #14211F |
| text-secondary | #B4C3C1 | #354A48 |
| text-muted | #86999A | #5A6F6D |
| text-disabled | #5A6C6E | #8A9C9A |
| primary / hover / dark | #4FB3A3 / #63C4B4 / #3D9587 | #2A7F72 / #236B60 / #1C574E |
| on-primary | #0F1719 | #FFFFFF |
| warning / error / info | #E0A526 / #E0604F / #6FA8C9 | #94660A / #B53D2C / #2F6F95 |

Semua pasangan teks utama lolos kontras WCAG AA 4.5:1 di dua tema.

**Aturan pakai supaya tema jalan:**
- Kelas token: `bg-surface-2`, `text-text-muted`, `border-hairline`, `bg-primary/10`.
- Inline style: `'rgb(var(--gc-primary))'` atau `'rgb(var(--gc-primary) / 0.15)'`.
- Dilarang hex mentah, `text-white`, `bg-black`, `zinc`, `slate`, `amber-400` dan warna Tailwind bawaan
  lain di komponen. Pengecualian: `text-white` di atas isi bata, dan overlay modal `bg-black/70`.

## 3. Typography Rules

- **Sans:** `Geist` variabel, dibundel di `src/shared/assets/fonts/Geist.woff2`. Semua UI.
- **Mono:** `Geist Mono` variabel (`GeistMono.woff2`). Wajib untuk semua angka yang berubah:
  jam, sisa waktu, rupiah, IP, kode voucher. Kelas `font-mono` plus `.tabular` supaya digit tidak goyang.
- **Skala server:** 11px label kapital tracking 0.06em, 13px isi, 15px judul kartu, 20px judul layar.
  Hierarki dari berat dan warna, bukan ukuran raksasa.
- **Skala kiosk:** 14px isi, 22px judul layar kunci, jam dan sisa waktu 56px mono. Widget sesi 13px isi,
  timer 32px mono.
- Isi paragraf maksimal 65 karakter per baris. Minimum 11px di mana pun.
- **Dilarang:** Inter, Nunito, font serif apa pun, font sistem default sebagai pilihan utama.

## 4. Component Stylings

- **Tombol:** rata tanpa glow. Radius 4px (`rounded-sm`), tinggi 32px padat atau 36px normal,
  layar kunci kiosk minimal 44px (widget sesi 36px, dipakai dengan mouse). Primer isi teal, sekunder `surface-2` plus hairline, ghost tanpa latar.
  Active: turun 1px (`active:translate-y-px`). Fokus keyboard: outline teal 2px offset 2px.
- **Kartu PC:** lihat bagian 5. Radius 6px (`rounded-md`), border 1px, tanpa bayangan di grid.
- **Panel dan Modal:** `surface-2`, border hairline, radius 6px, bayangan `shadow-modal` hanya di modal.
  Header modal: judul kiri, tombol tutup kanan, tanpa ikon dekoratif besar di tengah.
- **Input:** label di atas, error di bawah warna bata, latar `surface-3`, border hairline, fokus teal.
  Tidak ada floating label.
- **Tabel:** padat, baris 32px, pemisah hairline, angka rata kanan dan mono. Tanpa zebra warna-warni.
- **Badge:** chip kecil radius 2px, huruf 11px, latar tint 15 persen dari warna status.
- **Radius maksimum 6px.** `rounded-lg` ke atas dan `rounded-full` untuk kotak dilarang;
  `rounded-full` hanya untuk titik status dan avatar.

### Empat status UI wajib di setiap layar data
1. **Loading:** skeleton seukuran konten asli, blok `surface-3` dengan kedip opacity pelan. Tanpa spinner bulat.
2. **Kosong:** kalimat apa yang terjadi plus langkah mengisinya, misal "Belum ada PC. Tambah PC dari tombol di kanan atas."
3. **Error:** inline di tempat data, warna bata, sebut penyebab dan tombol coba lagi.
4. **Sukses:** data tampil; notifikasi aksi lewat toast kanan bawah, hilang sendiri 3 detik
   (client: lihat bagian 6 untuk toast di widget sesi).

## 5. Kartu PC — Anatomi Wajib

Dasar: anatomi kartu PC billing warnet klasik.
Kartu berorientasi orang dan waktu, bukan nomor.

```
┌──────────────────────────────┐
│ PC-Mokiya                ●   │  judul = nama PC apa adanya, titik = koneksi
│ [ikon tagihan] budi_gg       │  pemakai + ikon tipe: paket, prabayar, pascabayar, member
│ 01:24:10  sisa               │  waktu mono besar: sisa (paket) atau jalan (pascabayar)
│ Valorant                     │  app aktif, warna amber; kosong kalau tidak ada data
├──────────────────────────────┤
│ Rp 12.000          [2] [chat]│  kaki: biaya atau status + badge order F&B dan chat
└──────────────────────────────┘
```

Status dibaca dari warna seluruh kartu, bukan dari teks:

| Status | Latar | Border | Kaki |
| --- | --- | --- | --- |
| Sesi berjalan | teal 10% di atas `surface-2` | teal 40% | teal 15% |
| Sisa 5 menit atau kurang | amber 10% | amber | amber 15% |
| Belum bayar | `surface-2` | amber 2px | amber isi penuh, teks #0F1719 |
| Terkunci | bata 12% | bata 50% | bata 15% |
| Tersedia menyala | `surface-2` | hairline | ikon monitor, teks "Tersedia" muted |
| Mati atau offline | `canvas` | hairline | ikon monitor redup, teks "Mati" disabled |

- Komponen: `src/server/components/PcCard.tsx`, tinggi 148px, grid `minmax(176px, 1fr)` per grup PC.
- Kaki kartu adalah tombol info tagihan: paket aktif plus jumlah antre (`2 Jam +1`), atau untuk personal
  tagihan sekarang dan menit sampai naik (`Rp 4.000 · naik 13m`). Teks kaki pakai Geist dengan `.tabular`,
  bukan mono, supaya "Belum bayar Rp 11.000" muat. Klik membuka popover menempel di bawah kartu (bukan modal):
  tabel paket (Dibeli, Kedaluwarsa, status Dipakai/Antre/Selesai) atau rincian tarif personal dengan
  "Pukul HH.MM jadi Rp X". Esc atau klik di luar menutup.
- Badge pesanan F&B ikon burger warna amber, badge chat warna teal; keduanya tombol sendiri.
- Titik status berubah bata saat klien terputus tapi sesi masih jalan.
- Data yang tidak ada tidak diisi tebakan. Dilarang default palsu seperti app "Roblox" atau biaya Rp 4.000.
- Nama PC tidak dikapitalkan paksa, dipotong elipsis kalau panjang, nama lengkap di `title`.
- Kartu adalah `button` dengan `aria-label` berisi nama, status, dan waktu; bisa dipilih dengan Tab dan Enter.

## 6. Client Kiosk — Layar Kunci, Widget Sesi, Notifikasi

### Layar kunci (standby dan AFK)
- Kerangka bersama `src/client/components/LockLayout.tsx`: kolom kiri sepertiga layar (min 380px, max 480px)
  `surface-1` berisi logo, nama bilik, form; panel merek di kanan berisi video merek warnet, jam dan tanggal
  56px mono di kanan atas, info di kiri bawah, status koneksi kasir di kanan bawah. Bukan kotak login di tengah.
- Standby: tab Member dan Voucher bergaris bawah teal, error input inline di bawah field, tombol "Memeriksa..."
  selama menunggu server (lepas sendiri setelah 8 detik). Restart dan Matikan di kaki kolom dengan konfirmasi inline.
- AFK: panel kanan menampilkan sisa atau waktu terpakai sesi. Dikunci pemain = tab PIN dan Operator.
  Dikunci kasir = hanya buka lewat akun operator, label "dijeda kasir", timer beku.
- Tidak ada teks pengumuman karangan di layar kunci. Info warnet hanya dari data asli.

### Widget sesi (`src/client/components/FloatingCapsule.tsx`)
- **Selalu di bawah semua jendela, hanya di atas wallpaper.** Tidak pernah always-on-top, tidak ada tombol pin,
  tidak boleh menutupi game atau aplikasi lain dalam kondisi apa pun. Main process menurunkannya ke dasar
  z-order setiap kali ukurannya berubah dan setiap kali diaktifkan.
- Lebar tetap 340px (dikecilkan 240px), tinggi mengikuti isi; jendela Electron mengikuti ukuran widget.
- Isi utama: nama pemain, timer 32px mono (amber saat sisa 5 menit atau kurang), baris terpakai dan biaya,
  grid ubin 3 kolom tinggi 56px: Chat, Pesan, Suara, Kunci, Selesai; staf menambah Task Manager,
  Pengaturan, dan Tutup app. Mode teknisi, pengaturan, dan tutup app selalu minta akun admin.
- Menu Pesan hanya dari katalog server (`sync_catalog`); client mengirim id dan jumlah, harga dihitung server.
- Toast di dalam widget, di atas kepala widget: garis kiri 4px warna status, judul 13px semibold, tombol tutup.
  Info hilang 3 detik, peringatan dan error 8 detik, maksimal 3 bertumpuk.

### Notifikasi di atas game
- Karena widget ada di bawah, pesan penting selama main (sisa 5 dan 1 menit, pengumuman kasir, status pesanan)
  juga dikirim ke jendela notifikasi terpisah (`showCustomDesktopNotification` di `src/main/index.ts`):
  kecil di pojok kanan bawah, tidak bisa mengambil fokus, hilang sendiri. Hanya untuk pesan singkat,
  bukan interaksi.
- Tidak pernah menyuntik DLL atau hook grafis ke proses game (overlay ala Discord): berisiko ban anti-cheat
  untuk akun pemain.

## 7. Layout Principles

- Server: top bar 44px, nav rail kiri, area kerja, drawer inspektor kanan untuk PC terpilih.
  Grid kartu PC pakai CSS Grid `repeat(auto-fill, minmax(176px, 1fr))`, gap 8px.
- Spasi kelipatan 4px: 4, 8, 12, 16, 24, 32. Padding panel 16px, padat 12px.
- Client kiosk: lihat bagian 6.
- Jendela Electron minimal 1280x720; layout tidak boleh scroll horizontal di ukuran itu.
- Tinggi penuh pakai `h-full` di dalam root yang sudah 100vh; jangan `h-screen` di komponen dalam.

## 8. Motion & Interaction

- Transisi 120 sampai 180ms `ease-out`, hanya `opacity`, `transform`, `background-color`, `border-color`.
- Perubahan status kartu: warna transisi 180ms, tanpa goyang atau zoom.
- Loop yang boleh: titik koneksi berkedip pelan saat PC menunggu login, kedip kaki amber saat sisa 1 menit,
  dan video merek di panel kanan layar kunci. Hormati `prefers-reduced-motion` dengan mematikan ketiganya
  (video disembunyikan lewat kelas `.gc-lock-video`).
- Tanpa animasi masuk berjenjang di grid PC; grid harus langsung tampil saat dibuka kasir.

## 9. Anti-Patterns (Dilarang)

- Emoji di mana pun, termasuk teks toast dan pesan chat sistem.
- Aksen kedua: tidak ada hijau NVIDIA, biru BMW, garis tiga warna, sky blue `#38bdf8` sebagai tombol.
- Gradien ungu biru, glow neon, `shadow` berwarna aksen, teks gradien.
- Hitam murni `#000000` untuk latar atau teks di atas aksen.
- Tiga kartu sama besar sejajar sebagai hiasan dashboard.
- Radius besar `rounded-xl` ke atas; tombol kapsul untuk aksi biasa.
- Spinner bulat sebagai loading halaman.
- Data palsu atau angka bulat karangan di UI produksi.
- Copy klise: "Seamless", "Elevate", "Next-Gen", "Unleash".
- Kursor custom, animasi dekoratif yang jalan terus.
