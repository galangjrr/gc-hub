# Setup PC bilik

Panduan operator untuk 1 Click Setup, mode maintenance, dan revert di PC bilik.

## Yang diubah 1 Click Setup

Setup dijalankan dari client GC Hub yang dibuka sebagai administrator, lewat Pengaturan Workstation & OS Bilik, tab 1-Click Setup OS.

| Perubahan | Dikembalikan saat revert |
|---|---|
| Akun standard `GC Net` dengan password acak yang tidak pernah kedaluwarsa | Akun dihapus, kecuali sudah ada sebelum setup |
| Auto logon ke `GC Net`, termasuk `ForceAutoLogon` | Nilai Winlogon kembali persis seperti sebelum setup |
| Izin penuh `GC Net` ke `C:\Games`, `D:\Games`, `E:\Games`, dan `D:\` | Izin dicabut |
| Firewall masuk untuk port 7894, WoL, FTP, dan ping | Aturan dihapus |
| Pop up crash Windows Error Reporting dan restart otomatis Windows Update dimatikan | Nilai kembali seperti semula |
| Client jalan otomatis lewat Run registry | Entri dihapus |
| Service `gc-agent` LocalSystem | Service dicabut, policy kiosk dan allowlist exe dibersihkan |

Client juga mematikan shortcut Sticky Keys, yaitu Shift lima kali, untuk akun `GC Net` setiap kali client start. Setting ini milik akun `GC Net`, jadi ikut hilang waktu akun itu dihapus.

Snapshot kondisi awal disimpan di `C:\Program Files\GC Hub Setup\provision_snapshot.json`. Hanya administrator yang bisa mengubahnya, dan semua akun bisa membacanya. Menjalankan setup dua kali aman karena snapshot pertama tidak ditimpa.

## Masuk sebagai administrator di PC bilik

Karena `ForceAutoLogon` aktif, setiap logoff langsung masuk lagi ke `GC Net`. Menahan Shift saat booting juga tidak bisa diandalkan. Pakai salah satu cara ini.

1. **Matikan kiosk dulu.** Dari kasir, buka PC di Inspector lalu matikan saklar Mode Kiosk. Bisa juga dari Pengaturan Workstation di bilik. Selama kiosk nyala, watchdog `gc-agent` akan membuka client di sesi siapa pun yang sedang aktif, termasuk sesi administrator.
2. **Install atau ubah setting sistem.** Di sesi `GC Net`, klik kanan program lalu pilih Run as administrator. Windows meminta username dan password administrator.
3. **Butuh desktop administrator penuh.** Tekan Ctrl Alt Del, pilih Switch user, lalu login sebagai administrator. Sesi `GC Net` tetap jalan di belakang.
4. **Selesai maintenance.** Nyalakan lagi Mode Kiosk dari kasir.

## Revert

Buka client GC Hub sebagai administrator, Pengaturan Workstation & OS Bilik, tab 1-Click Setup OS, lalu pilih Revert.

- Revert mencabut `gc-agent` lebih dulu. Kalau langkah itu gagal, revert berhenti dan tidak menghapus apa pun. Ini mencegah PC tertinggal dengan policy kiosk aktif tanpa client yang bisa mematikannya.
- Kalau `bin\gc-agent.exe` di folder client hilang, revert memakai salinan di `C:\Program Files\GC Hub Agent`.
- Kalau sebagian langkah gagal, snapshot tidak dihapus. Jalankan revert lagi sampai muncul pesan berhasil.
- Folder profil `C:\Users\GC Net` tidak dihapus otomatis. Hapus lewat System Properties, User Profiles, kalau perlu.

## Jalan darurat

Kalau PC terkunci dan client tidak bisa dibuka, buka Command Prompt sebagai administrator lalu jalankan:

```
sc stop GCHubAgent
```

Saat dihentikan, service selalu membersihkan policy kiosk dan allowlist exe.
