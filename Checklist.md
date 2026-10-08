# Checklist GC Hub

Update terakhir: 2026-10-08. Semua branch bagian 1, 2, kiosk, dan allowlist sudah digabung ke `main` lokal lewat `integrate/section-4`, belum di-push.

Persentase di bawah adalah estimasi, bukan hitungan otomatis. Centang item begitu selesai dan terverifikasi, lalu sesuaikan angkanya.

## Ringkasan

| Area | Progress |
|---|---|
| Server: billing engine | 100% |
| Server: UI kasir | 100% |
| Server: POS dan stok | 95% |
| Client: UI bilik | 100% |
| Kontrak server dan client | 90% |
| Penguncian Windows, gc-agent | 90% |
| Cloud dan booking | 85% |
| Siap rilis dan jual | 30% |
| Uji lapangan | 0% |
| **Total** | **sekitar 73%** |

Fitur sekitar 88%. Siap jual ke warnet lain sekitar 62%.

---

## 1. Server

### 1.1 Billing engine

- [x] Tick 1 detik di `src/server/engine/billingEngine.ts`, server jadi otoritas
- [x] Sesi prepaid, postpaid, paket waktu, saldo member
- [x] Tarif personal model parkir di `src/shared/personalBilling.ts`
- [x] Tarif per PC, tarif sesi disimpan di `sessionPricePerHour`
- [x] Happy hour ditegakkan lewat `src/shared/packageRules.ts`
- [x] Pembulatan kasir 100, 500, 1000
- [x] Paket bertumpuk bisa diatur, toleransi cutoff tengah malam
- [x] Alur belum bayar dan pelunasan `settleUnpaid`
- [x] Refund hanya dari uang yang benar benar dibayar, penalti persen
- [x] Booking lunas online masuk log sebagai transfer saat sesi mulai
- [x] Potong waktu yang terpakai selama LAN putus saat client register ulang
- [x] Voucher batch dan redeem
- [x] Overflow waktu offline memotong paket antrian, durasi pause lama tidak lagi terbawa ke paket berikutnya

### 1.2 Data dan keuangan

- [x] SQLite lewat Drizzle, query parameterized
- [x] Shift opsional, slot dari jam buka
- [x] Laporan transaksi dan omzet lewat `src/shared/transactions.ts`
- [x] Rekap shift hanya transaksi sejak shift buka
- [x] Koreksi transaksi admin only, jejak di `systemLogs`
- [x] Backup DB manual dan otomatis
- [x] Restore backup dari UI, dengan backup pengaman otomatis dan restart
- [x] Cek visual laporan transaksi dan omzet di app asli, tema gelap dan terang

### 1.3 Akses dan keamanan server

- [x] Login operator, peran kasir dan admin
- [x] Tarif, paket, pengaturan, staf hanya bisa diubah admin, dicek di main lewat `denyUnlessAdmin`
- [x] Kunci konsol server
- [x] Kunci LAN HMAC, disimpan DPAPI
- [x] Service key Supabase tidak pernah dikirim ke renderer
- [x] DevTools dan menu bawaan mati di luar dev

### 1.4 UI kasir

- [x] Tema terang dan gelap, token `--gc-*`, font Geist, patuh `DESIGN.md`
- [x] Denah bilik `PCGrid` dan `PcCard` dengan filter status dan grup
- [x] `InspectorDrawer` dengan aksi merusak lewat `ConfirmModal`
- [x] Pengaturan: Tarif dan Paket, Tarif per PC, Staf, Shift, Kunci LAN, Backup, Cloud
- [x] Modal: beli paket, member, voucher, refund, struk belum bayar, booking, broadcast, chat, volume, tambah PC
- [x] Remote: task manager, VNC, screenshot
- [x] Saklar kiosk per PC di `InspectorDrawer`
- [x] Editor allowlist exe per PC
- [x] Rename PC dari server lewat `rename_pc`, ikut pindah di cloud dan booking
- [x] Empat status UI diaudit di semua layar server; menu Log ditulis ulang supaya baca `SystemLogs`, denah PC dan member dapat status loading dan error
- [x] Inspector ikut data live, bukan potret saat PC diklik

### 1.5 POS dan stok

- [x] Jual counter `counterSale`, cek stok
- [x] Approve order dari bilik, tolak stok kurang dan approve dobel
- [x] Kelola produk, restock, katalog sinkron ke client
- [x] Bayar di depan saja, tunai atau saldo member
- [x] Harga modal per item dan laporan Laba F&B, modal tidak dikirim ke bilik
- [ ] Midtrans QRIS sebagai metode bayar baru, menunggu approval Midtrans

---

## 2. Client

### 2.1 UI bilik

- [x] Lock screen standby: login member, voucher, info PC, status kasir
- [x] Layar AFK dan kunci operator, timer beku saat pause
- [x] Kapsul sesi selalu di bawah jendela lain, tidak pernah topmost
- [x] Toast di kapsul, jendela notifikasi topmost untuk pesan penting saat main game
- [x] Peringatan sisa 5 menit dan 1 menit
- [x] Order F&B dari kapsul, harga dihitung ulang server
- [x] Pengaturan bilik, mode teknisi, tutup app lewat verifikasi admin `ADMIN_AUTH`
- [x] Lockout lokal 5 kali gagal per 60 detik saat offline
- [x] Saklar kiosk di panel admin bilik
- [x] Jendela notifikasi desktop pakai token, font Geist, ikon X lucide; klik toast di bilik tidak menarik fokus dari game

### 2.2 Proteksi di sisi Electron

- [x] Blok Win, Alt Tab, Alt F4, Ctrl Esc, F11, F12 saat terkunci
- [x] Taskkill loop untuk cmd, powershell, regedit, mmc, dan teman temannya saat terkunci
- [x] Fokus balik otomatis saat jendela kehilangan fokus
- [x] Hapus sisa policy HKCU dari build lama saat start
- [x] Kunci LAN client terenkripsi DPAPI
- [x] IPC `client:save-config`, `client:exit-app`, provisioning, dan alat teknisi dicek admin di main lewat grant server atau Kunci LAN
- [x] `system:apply-policies` dihapus karena tidak dipakai, `security:set-lockdown` cuma terima boolean
- [x] Hapus `src/client/security/test.ts` dan helper renderer lain yang mati
- [x] Kunci LAN tidak lagi dikirim ke renderer, tanda tangan paket lewat main

### 2.3 Helper native di `bin/`

- [x] `gc-input.exe` untuk remote input dan kirim jendela ke bawah
- [x] `gc-probe.exe` untuk jendela foreground, ganti PowerShell per tick
- [x] `gc-agent.exe` service LocalSystem

---

## 3. Kontrak server dan client

- [x] Paket WebSocket JSON di port 7894, bentuk `Packet` di `src/shared/protocol.ts`
- [x] Tanda tangan HMAC per paket, paket salah ditolak
- [x] Snapshot sesi offline dikirim saat `CLIENT_REGISTER`
- [x] Remote: shutdown, restart, volume, screenshot, VNC, pesan, chat, WOL, task manager, katalog, kiosk, allowlist exe
- [x] Telemetri client: proses, aplikasi aktif, status kiosk, mode allowlist
- [ ] `RemoteCommandPayload.params` masih `any`, pecah jadi payload bertipe per action
- [ ] Anti replay LAN masih jendela 5 menit, ditandai `ponytail:`

---

## 4. Penguncian Windows dan gc-agent

### 4.1 Sudah ada

- [x] Service LocalSystem, binary disalin ke `Program Files\GC Hub Agent`
- [x] Pipe dengan SDDL, isi permintaan tidak dipercaya, kill berdasar path exe asli
- [x] Policy HKLM: Task Manager, Run, Control Panel, Registry tools
- [x] Watchdog menghidupkan ulang client sebagai user yang login
- [x] Saklar kiosk atau maintenance, tahan reboot, gagal tertutup
- [x] Service stop selalu membersihkan policy
- [x] Allowlist exe lewat AppLocker, admin selalu bebas
- [x] Kiosk off dan perubahan allowlist di bilik wajib izin admin bilik atau perintah server bertanda tangan, dicek di main
- [x] Test Go agent lulus

### 4.2 1 Click Setup dan Revert

- [x] User standard `GC Net`, auto logon, ACL folder game, firewall, autostart
- [x] Setup kedua tidak menimpa snapshot asli, snapshot pindah ke `Program Files\GC Hub Setup`
- [x] Revert pakai agent di `Program Files` kalau `bin\gc-agent.exe` hilang, dan berhenti kalau agent gagal dicabut
- [x] Revert mengembalikan `DontShowUI`, `NoAutoRebootWithLoggedOnUsers`, dan ACL folder game
- [x] Sticky Keys dimatikan client di sesi `GC Net` lewat `gc-input`, bukan HKCU admin
- [x] Password `GC Net` acak per setup dan tidak kedaluwarsa
- [x] Cara admin login saat `ForceAutoLogon` aktif ada di `docs/BOOTH_SETUP.md`
- [ ] Uji 4.2 di PC bilik asli atau VM: setup dua kali, revert, revert ulang setelah gagal sebagian

### 4.3 Merge dan uji

- [x] Merge `fix/provision-revert` ke `main`
- [x] Merge tumpukan bagian 1 dan 2 berurutan: `fix/offline-stacked-overflow`, `feat/db-restore`, `feat/rename-pc-from-server`, `feat/product-cost`, `fix/ui-data-states`, `fix/client-ipc-admin-gate`, `fix/client-notification-window`
- [ ] Uji verifikasi admin di bilik asli: online lewat akun admin, offline lewat Kunci LAN, simpan pengaturan, Mode Teknisi, tutup app. Uji dev server dan client di satu PC sudah lulus
- [ ] Uji rename PC dengan bilik asli, termasuk web booking. Rename lewat LAN di uji dev sudah lulus
- [x] Merge `feat/kiosk-switch` ke `main`
- [x] Merge `feat/exe-allowlist` ke `main`
- [ ] Push `main` ke GitHub
- [ ] Uji di PC bilik asli: setup, kunci, maintenance, reboot, revert
- [ ] Uji AppLocker mode audit dulu seminggu sebelum enforce

---

## 5. Cloud dan booking

- [x] Sinkron status PC ke tabel `pcs`, tidak menimpa status `maintenance` dari web
- [x] Booking API v1, Edge Function `api` sudah deploy
- [x] Migration 004 sampai 008 sudah jalan
- [x] Policy public key di web booking dikunci
- [x] Web booking hidup dengan key baru: dicek 2026-10-08, `/api/data` dan `/api/pcs` jalan, bundle publik cuma berisi `sb_publishable_`
- [ ] `/api/data` publik berhenti mengirim `daily_pdf_revenue`: kode beres di GC Net Booking `760b259`, live setelah push dan deploy Vercel
- [ ] Webhook booking punya retry: migration `009_webhook_retry.sql` siap dan lulus test, tinggal dijalankan di SQL Editor Supabase

---

## 6. Siap rilis dan jual

- [ ] Upgrade Electron 29 yang sudah EOL
- [ ] Sertifikat code signing, script `cert:sign` sudah ada
- [ ] Auto update diuji ujung ke ujung lewat GitHub Releases
- [ ] Sistem lisensi atau subscription
- [ ] Installer server dan client untuk warnet lain
- [ ] Panduan pasang untuk operator
- [ ] `npm run test:release:e2e` lulus di build rilis

---

## 7. Uji lapangan

- [ ] Pilot di warnet sendiri minimal seminggu
- [ ] Catat bug dan keluhan kasir selama pilot
- [ ] Uji server mati di tengah sesi, client lanjut lalu sinkron balik
- [ ] Uji internet mati, billing LAN tetap jalan

---

## Urutan kerja yang disarankan

1. Bagian 4.2 dan 4.3: uji di bilik asli atau VM. Merge sudah selesai.
2. Bagian 5: pastikan web booking hidup.
3. Bagian 7: pilot seminggu.
4. Bagian 6: rilis, signing, lisensi.

Item sisa di bagian 1 sampai 3 dikerjakan sambil jalan kalau ketemu saat pilot.
