# 🎨 GC-HUB MODERN UX COPYWRITING & TERMINOLOGY GUIDELINES
> **Design Philosophy:** Gaya bahasa modern, ramah, dan ringkas seperti aplikasi **Gojek / Grab**, dengan pemisahan tegas:
> - **UI Tampilan Layar:** Bahasa Indonesia modern sehari-hari (conversational & clear UX microcopy).
> - **Codebase & Engineering:** 100% Bahasa Inggris baku (English naming conventions).

---

## 🏛️ 1. Prinsip Pemisahan (UI Display vs Engineering)

| Domain | Bahasa | Contoh Baku | DILARANG |
|---|---|---|---|
| **Kode & DB (Backend)** | English | `session.remainingSeconds`, `workstation.status`, `OrderLogs` | `session.sisaWaktu`, `TabelOrder` |
| **API & IPC Protocol** | English | `SESSION_BEGIN`, `AUTH_REQUEST`, `TEMP_LOCK_REQUEST` | `MULAI_SESI`, `REQUEST_KUNCI` |
| **Tampilan UI Kasir & Klien** | Bahasa Indonesia Modern | *"Mulai Main"*, *"Sisa Waktu"*, *"Isi Saldo"*, *"Tagihan Belum Lunas"* | *"Initiate Workstation Connection"* |

---

## 📱 2. Kamus Microcopy UI (Gojek / Grab Style)

### A. Navigasi & Tab Utama
| Tab / View | Microcopy Tampilan | Deskripsi UX |
|---|---|---|
| Workstations | **Bilik Komputer** / **Komputer** | Daftar status PC warnet |
| Members | **Member & Akun** | Manajemen user & pelanggan |
| Transactions | **Riwayat Transaksi** | Jurnal & mutasi kas kasir |
| System Logs | **Catatan Aktivitas** | Log audit & aktivitas sistem |

### B. Status Bilik PC (Workstation Card Badges)
| Status Enum | Label Tampilan UI | Warna Token | Pesan UX Ringkas |
|---|---|---|---|
| `AVAILABLE` | **Tersedia** | `text-[#76b900]` | Siap dipakai main |
| `ONLINE` | **Sedang Main** | `text-[#2997ff]` | Sesi aktif berjalan |
| `SUSPENDED` | **Terkunci (AFK)** | `text-[#f4b400]` | Ditinggal sementara (PIN) |
| `DISCONNECTED`| **Offline** (`-x-`) | `text-[#777d84]` | PC mati atau terputus |

### C. Sidebar Kasir & Tagihan
| Engineering Field | Label Display UI | Format Nilai |
|---|---|---|
| `packageName` | **Paket Aktif** | *Paket 3 Jam, Prepaid Saldo* |
| `remainingSeconds` | **Sisa Waktu** | *01:24:10 (font tabular)* |
| `elapsedSeconds` | **Waktu Terpakai** | *00:35:50* |
| `pcBillingCost` | **Biaya Billing** | *Rp 12.000* |
| `serviceFee` | **Biaya F&B / Servis** | *Rp 8.000* |
| `totalCost` | **Total Biaya** | *Rp 20.000 (Kuning Tebal)* |
| `unpaidAmount` | **Tagihan Belum Lunas** | *Rp 8.000 (Merah Alert)* |

### D. Tombol Aksi Klien (Floating Widget & Lock Screen)
| Action / Event | Label Tombol UI | Dialog / Pop-up |
|---|---|---|
| Lock Screen Auth | **Masuk Akun** | Login member warnet |
| Voucher Code | **Pakai Voucher** | Input kode kupon instan |
| Order Food | **Pesan Makanan & Minuman** | Buka menu katalog F&B |
| Temporary Lock | **Kunci Layar (AFK)** | Masukkan PIN kunci sementara |
| Session Finish | **Selesai Main** | Konfirmasi checkout kasir |
| Top Up Balance | **Isi Saldo** | Form topup deposit member |

---

## 🚫 3. Aturan Ketat untuk AI (Copywriting Rules)
1. **Bahasa Manusiawi (Human-Centric):** Gunakan istilah akrab di telinga user/gamer warnet Indonesia (contoh: *"Selesai Main"* bukan *"Terminasi Sesi Billing"*).
2. **Tanpa Bahasa Kaku/Birokratis:** Hindari kata seperti *"Otorisasi Kredensial"* -> ganti dengan *"Masuk Akun"*.
3. **Engineering Murni Bahasa Inggris:** Seluruh nama variable, function, class, database column, types, dan enum di `src/` **100% Bahasa Inggris**.
