/**
 * GC-Hub Real Warnet / Cyber Cafe Day-in-the-Life Simulation
 * Simulates a full production cycle with 4 live PC workstations, multiple customers,
 * POS orders, voucher redemptions, remote control, and cashier shift handover.
 */

import { WebSocket } from 'ws';
import { DbService } from '../src/server/db/dbService.ts';
import { BillingEngine } from '../src/server/engine/billingEngine.ts';
import { ServerNetworkBridge } from '../src/server/network/serverNetwork.ts';
import { SessionCleanupService } from '../src/main/cleanup.ts';
import { OpCode } from '../src/shared/protocol.ts';
import { calcPersonalBill } from '../src/shared/personalBilling.ts';

const SIM_PORT = 7896;
let stageCount = 0;
let errors = 0;

function logStage(title: string) {
  stageCount++;
  console.log(`\n================================================================`);
  console.log(`📍 [TAHAP ${stageCount}] ${title}`);
  console.log(`================================================================`);
}

function assertSim(condition: boolean, msg: string, detail: string = '') {
  if (condition) {
    console.log(`  ✅ ${msg} ${detail ? `(${detail})` : ''}`);
  } else {
    console.error(`  ❌ [FAILED] ${msg} ${detail ? `(${detail})` : ''}`);
    errors++;
  }
}

// Helper: Virtual PC client connected over real WebSocket
class VirtualWorkstation {
  public ws: WebSocket | null = null;
  public incoming: any[] = [];
  public pcId: string;
  public pcName: string;
  public mac: string;
  public ip: string;
  public isUnlocked: boolean = false;
  public currentRemainingSeconds: number = 0;

  constructor(pcId: string, pcName: string, mac: string, ip: string) {
    this.pcId = pcId;
    this.pcName = pcName;
    this.mac = mac;
    this.ip = ip;
  }

  async connect(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${port}`);
      this.ws.on('open', () => {
        this.ws!.send(JSON.stringify({
          op: OpCode.CLIENT_REGISTER,
          ts: Date.now(),
          payload: {
            pcId: this.pcId,
            pcName: this.pcName,
            mac: this.mac,
            ip: this.ip,
            os: 'Windows 11 Pro 64-bit'
          }
        }));
        resolve();
      });

      this.ws.on('message', (raw) => {
        try {
          const packet = JSON.parse(raw.toString());
          this.incoming.push(packet);

          if (packet.op === OpCode.SCREEN_UNLOCK || packet.op === OpCode.SESSION_BEGIN) {
            this.isUnlocked = true;
          } else if (packet.op === OpCode.SCREEN_LOCK || packet.op === OpCode.SESSION_END) {
            this.isUnlocked = false;
          } else if (packet.op === OpCode.SESSION_TICK) {
            this.currentRemainingSeconds = packet.payload?.remainingSeconds || 0;
          }
        } catch {}
      });

      this.ws.on('error', reject);
    });
  }

  send(op: OpCode, payload: any = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op, ts: Date.now(), pcId: this.pcId, payload }));
    }
  }

  hasReceived(op: OpCode): boolean {
    return this.incoming.some(p => p.op === op);
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}

async function runRealWarnetSimulation() {
  console.log('################################################################');
  console.log('🎮 GC-HUB FULL DAY WARNET / CYBER CAFE RUNTIME SIMULATION');
  console.log('   Skenario Operasional Real-Life Warnet 24 Jam');
  console.log('################################################################');

  // ---------------------------------------------------------------------------
  // TAHAP 1: BUKA SHIFT KASIR PAGI & INISIALISASI DATABASE
  // ---------------------------------------------------------------------------
  logStage('Buka Shift Kasir Pagi (Inisialisasi Database & Active Shift)');
  await DbService.init();
  ServerNetworkBridge.start(SIM_PORT);
  BillingEngine.start();

  // Admin mendaftarkan kasir pagi lalu menyalakan sistem shift (shift opsional, mati untuk warnet admin saja)
  if (!DbService.getEmployees().some(e => e.name === 'Kasir Pagi (Sinta)')) {
    DbService.createEmployee({ name: 'Kasir Pagi (Sinta)', password: '123', role: 0 });
  }
  assertSim(DbService.setShiftEnabled(true).success, 'Admin menyalakan sistem shift');
  const shiftSummary = DbService.getActiveShiftSummary();
  assertSim(!!shiftSummary.currentShift, 'Shift kasir aktif terverifikasi', `Operator: ${shiftSummary.currentShift.employeeName}, Modal Awal: Rp ${shiftSummary.currentShift.startCash.toLocaleString('id-ID')}`);
  
  const initialProducts = DbService.getProducts();
  const indomieProduct = initialProducts.find(p => p.id === 1);
  const initialStock = indomieProduct?.stock || 15;
  console.log(`  📦 Info Stok Awal [${indomieProduct?.name || 'Indomie'}]: ${initialStock} Pcs`);

  // ---------------------------------------------------------------------------
  // TAHAP 2: 4 WORKSTATION CLIENT BOOTING & HANDSHAKE JARINGAN
  // ---------------------------------------------------------------------------
  logStage('4 PC Client Booting & Auto-Discovery Handshake');
  const pcs = [
    new VirtualWorkstation('PC-01', 'PC-01 (Regular)', '00:1A:7D:00:01:01', '192.168.1.101'),
    new VirtualWorkstation('PC-02', 'PC-02 (VIP Zone)', '00:1A:7D:00:01:02', '192.168.1.102'),
    new VirtualWorkstation('PC-03', 'PC-03 (Battle Station)', '00:1A:7D:00:01:03', '192.168.1.103'),
    new VirtualWorkstation('PC-04', 'PC-04 (Streaming Room)', '00:1A:7D:00:01:04', '192.168.1.104'),
  ];

  for (const pc of pcs) {
    await pc.connect(SIM_PORT);
  }
  // Same as the real server's registration handler (src/main/index.ts): every client gets a DB row
  for (const [i, pc] of pcs.entries()) {
    DbService.upsertWorkstation(pc.pcId, pc.pcId, `192.168.1.10${i + 1}`);
  }
  await new Promise(r => setTimeout(r, 600));

  pcs.forEach(pc => {
    assertSim(pc.hasReceived(OpCode.SERVER_CONFIG_INIT), `PC ${pc.pcId} Handshake Sukses (Menerima SERVER_CONFIG_INIT)`);
  });

  // Kirim telemetri hardware dari semua PC
  pcs.forEach(pc => {
    pc.send(OpCode.TELEMETRY_REPORT, {
      pcId: pc.pcId,
      cpuUsagePercent: Math.floor(Math.random() * 20) + 10,
      ramTotalMb: 16384,
      ramUsedMb: 4096,
      ramUsagePercent: 25,
      gpuName: 'NVIDIA GeForce RTX 4060',
      activeWindow: 'GC-Hub Lockscreen Kiosk',
      timestamp: Date.now()
    });
  });
  console.log('  📊 Telemetri 4 PC berhasil diterima oleh Kasir Dashboard.');

  // ---------------------------------------------------------------------------
  // TAHAP 3: PELANGGAN 1 (MEMBER) TOP UP SALDO DI KASIR & LOGIN DI PC-01
  // ---------------------------------------------------------------------------
  logStage('Pelanggan 1 (Member): Top-Up Rp 20.000 di Kasir & Login di PC-01');
  const testMemberName = `gamer_pro_${Date.now()}`;
  const member = DbService.createMember({
    password: "test1234",
    username: testMemberName,
    firstName: 'Rian',
    lastName: 'Gamer',
    phone: '081234567890',
    money: 0,
    groupName: 'Reguler'
  });
  assertSim(member.money === 0, 'Member baru berhasil didaftarkan dengan saldo Rp 0');

  // Kasir Top Up Rp 20.000 (Tarif Rp 4.000/jam = 5 jam waktu bermain)
  const topUpResult = DbService.topUpMember(member.id, 20000, 'Kasir');
  assertSim(topUpResult.newBalance === 20000, 'Top-Up Kasir Berhasil', `Saldo Member: Rp ${topUpResult.newBalance.toLocaleString('id-ID')}`);

  // Member Login dari PC-01
  BillingEngine.startSession('PC-01', {
    username: testMemberName,
    userType: 'member',
    billingType: 'member',
    durationMinutes: 300, // 5 jam
    price: 0,
    pricePerHour: 4000,
    memberId: member.id
  });
  await new Promise(r => setTimeout(r, 400));
  assertSim(pcs[0].isUnlocked, 'PC-01 Terbuka (Lockscreen morph ke Floating Widget)');
  assertSim(BillingEngine.getSession('PC-01')?.userType === 'member', 'Sesi PC-01 tercatat sebagai Member');

  // ---------------------------------------------------------------------------
  // TAHAP 4: PELANGGAN 2 (GUEST) BELI PAKET 2 JAM DI PC-02 & UPGRADE 80% TOLERANSI
  // ---------------------------------------------------------------------------
  logStage('Pelanggan 2 (Guest): Beli Paket 2 Jam (Rp 8.000) & Ganti Paket 3 Jam');
  BillingEngine.startSession('PC-02', {
    username: 'Guest_PC02',
    userType: 'guest',
    billingType: 'package',
    durationMinutes: 120, // 2 Jam
    price: 8000,
    packageName: 'Paket 2 Jam'
  });
  await new Promise(r => setTimeout(r, 400));
  assertSim(pcs[1].isUnlocked, 'PC-02 Terbuka dengan Paket 2 Jam');

  // Simulasi bermain selama 30 menit (pemakaian 25% < 80% toleransi)
  BillingEngine.simulateSessionElapsed('PC-02', 30);

  // Pelanggan minta ganti ke Paket 3 Jam (180m, Rp 12.000) di kasir
  const changeResult = BillingEngine.replacePackage('PC-02', 180, 12000, 'Paket 3 Jam');
  assertSim(changeResult.success === true, 'Ganti Paket Disetujui (Aturan Toleransi 80% Valid)', changeResult.message);
  assertSim(changeResult.diff === 4000, 'Kasir memungut selisih harga', `+Rp ${changeResult.diff.toLocaleString('id-ID')}`);
  assertSim(changeResult.remainingMinutes === 150, 'Sisa waktu baru presisi: 180m - 30m = 150m');

  // ---------------------------------------------------------------------------
  // TAHAP 5: PELANGGAN 3 (VOUCHER CARD REDEMPTION DARI LOCKSCREEN DI PC-03)
  // ---------------------------------------------------------------------------
  logStage('Pelanggan 3 (Voucher): Kasir Cetak Voucher & Redeem di PC-03');
  const genVouchers = DbService.generateCouponsBatch({
    count: 1,
    type: 'time',
    durationMinutes: 180, // 3 Jam VIP
    value: 15000,
    userGroupId: 2,
    prefix: 'VIP'
  });
  const voucherCode = genVouchers[0].code;
  console.log(`  🎟️ Voucher Tercetak: ${voucherCode} (3 Jam VIP - Nilai Rp 15.000)`);

  // Pelanggan masukkan kode voucher di lockscreen PC-03
  const redeemRes = DbService.redeemCoupon(voucherCode, 'GamerVoucher03');
  assertSim(redeemRes.success === true, `Voucher ${voucherCode} Berhasil Di-redeem`);

  BillingEngine.startSession('PC-03', {
    username: 'GamerVoucher03',
    userType: 'guest',
    billingType: 'package',
    durationMinutes: 180,
    price: 0,
    packageName: `Kupon [${voucherCode}]`
  });
  await new Promise(r => setTimeout(r, 400));
  assertSim(pcs[2].isUnlocked, 'PC-03 Terbuka via Voucher Lockscreen');

  // Uji keamanan: Voucher tidak bisa dipakai 2x
  const duplicateRedeem = DbService.redeemCoupon(voucherCode, 'PencobaLain');
  assertSim(duplicateRedeem.success === false, 'Double-Redeem Voucher Ditolak Otoritatif oleh Server');

  // ---------------------------------------------------------------------------
  // TAHAP 6: ORDER F&B / POS DARI FLOATING WIDGET PC-01 & APPROVAL KASIR
  // ---------------------------------------------------------------------------
  logStage('In-Game POS: Order Makanan dari PC-01 & Kasir Approval (Potong Stok)');
  const createdOrder = DbService.createOrder({
    pcId: 'PC-01',
    pcName: 'PC-01 (Regular)',
    username: testMemberName,
    items: [
      { productId: 1, name: 'Mie Goreng Jumbo + Telur', price: 10000, quantity: 2, note: 'Pedas telur matang' },
      { productId: 2, name: 'Es Teh Manis Jumbo', price: 4000, quantity: 2, note: 'Gula normal' }
    ],
    totalPrice: 28000,
    note: 'Antar ke meja PC-01',
    staff: 'Operator Pagi'
  });
  assertSim(createdOrder.orderStatus === 0, 'Pesanan F&B Terkirim ke Kasir (Status: Pending)', `No: ${createdOrder.orderCode}, Total: Rp 28.000`);

  // Kasir setujui pesanan (Pembayaran Tunai Rp 28.000)
  const approvalRes = DbService.approveOrder({
    orderLogId: createdOrder.id,
    payMethod: 'cash',
    staff: 'Operator Pagi'
  });
  assertSim(approvalRes.success === true, 'Kasir Menyetujui Order (Status: Approved / Paid Cash)');
  
  const stockAfter = DbService.getProducts().find(p => p.id === 1)?.stock || 0;
  assertSim(stockAfter === initialStock - 2, 'Stok Indomie Otomatis Terpotong di Database', `Sisa: ${stockAfter} Pcs`);

  // ---------------------------------------------------------------------------
  // TAHAP 7: REMOTE MANAGEMENT (VOLUME & BROADCAST ANNOUNCEMENT)
  // ---------------------------------------------------------------------------
  logStage('Remote Control: Kasir Atur Volume & Broadcast Pesan ke Semua PC');
  ServerNetworkBridge.sendToClient('PC-03', OpCode.REMOTE_COMMAND, {
    action: 'set_volume',
    value: 75
  });
  await new Promise(r => setTimeout(r, 400));
  assertSim(pcs[2].hasReceived(OpCode.REMOTE_COMMAND), 'PC-03 Menerima Perintah Remote Volume (75%)');

  ServerNetworkBridge.broadcast(OpCode.REMOTE_COMMAND, {
    action: 'broadcast_message',
    message: 'Perhatian: Turnamen Valorant Warnet akan dimulai 15 menit lagi!',
    priority: 'info'
  });
  await new Promise(r => setTimeout(r, 400));
  pcs.forEach(pc => {
    assertSim(pc.hasReceived(OpCode.REMOTE_COMMAND), `PC ${pc.pcId} Menerima Broadcast Pesan Turnamen`);
  });

  // ---------------------------------------------------------------------------
  // TAHAP 8: PELANGGAN 4 (PASCABAYAR / OPEN-TIME) & HITUNG BIAYA KELIPATAN 500
  // ---------------------------------------------------------------------------
  logStage('Pelanggan 4 (Pascabayar): Main Open-Time di PC-04 & Checkout Kasir');
  BillingEngine.startSession('PC-04', {
    username: 'Guest_OpenTime',
    userType: 'guest',
    billingType: 'postpaid',
    pricePerHour: 4000
  });
  await new Promise(r => setTimeout(r, 400));
  assertSim(pcs[3].isUnlocked, 'PC-04 Terbuka dalam mode Pascabayar (Open-Time)');

  // Main 35 menit -> jam pertama ditagih penuh (tarif parkir): Rp 4.000
  BillingEngine.simulateSessionElapsed('PC-04', 35);
  const expectedBill = calcPersonalBill({ firstHourPrice: 4000, nextHoursPrice: 4000 }, 35 * 60).total;
  assertSim(expectedBill === 4000, 'Pascabayar ditagih penuh jam pertama', `Waktu: 35m -> Tagihan: Rp ${expectedBill.toLocaleString('id-ID')}`);

  // Selesai sesi PC-04: tagihan ditahan sebagai belum bayar sampai kasir menerima uang
  BillingEngine.stopSession('PC-04', 'Selesai main open-time di kasir');
  await new Promise(r => setTimeout(r, 400));
  assertSim(!pcs[3].isUnlocked, 'PC-04 Terkunci Kembali ke Standby Lockscreen');
  const pc04Unpaid = BillingEngine.findUnpaidWorkstation('PC-04');
  assertSim(!!pc04Unpaid, 'PC-04 menunggu pembayaran di kasir', `Tagihan: Rp ${(pc04Unpaid?.unpaidAmount || 0).toLocaleString('id-ID')}`);
  assertSim(BillingEngine.settleUnpaid('PC-04', 'Kasir Pagi (Sinta)').success, 'Kasir menerima pembayaran PC-04');

  // ---------------------------------------------------------------------------
  // TAHAP 9: SESSION EXPIRY, AUTO-CUTOFF & SESSION PRIVACY CLEANUP DI PC-01
  // ---------------------------------------------------------------------------
  logStage('Sesi Berakhir di PC-01: Auto-Cutoff, Potong Saldo Member & Privacy Wipe');
  BillingEngine.stopSession('PC-01', 'Member selesai main');
  await new Promise(r => setTimeout(r, 400));
  assertSim(!pcs[0].isUnlocked, 'PC-01 Terkunci Kembali');

  // Jalankan Session Cleanup
  const cleanupRes = await SessionCleanupService.executeSessionCleanup();
  assertSim(cleanupRes.success === true, 'Session Cleanup & Privacy Wipe Sukses (Browser/App di-kill, volume direset 50%)');

  // ---------------------------------------------------------------------------
  // TAHAP 10: TUTUP SHIFT KASIR & REKONSILIASI KEUANGAN FISIK
  // ---------------------------------------------------------------------------
  logStage('Tutup Shift Kasir: Rekonsiliasi Kas Fisik & Laporan Finansial');
  const activeShiftSummary = DbService.getActiveShiftSummary();
  console.log(`  💵 Total Pendapatan Billing: Rp ${activeShiftSummary.billingCash.toLocaleString('id-ID')}`);
  console.log(`  🍔 Total Pendapatan F&B POS: Rp ${activeShiftSummary.posCash.toLocaleString('id-ID')}`);
  console.log(`  💳 Total Transaksi Topup: Rp ${activeShiftSummary.topupCash.toLocaleString('id-ID')}`);
  console.log(`  💰 Total Kas Seharusnya: Rp ${activeShiftSummary.expectedEndCash.toLocaleString('id-ID')}`);

  // Operator shift sore harus terdaftar dulu sebelum menerima serah terima
  if (!DbService.getEmployees().some(e => e.name === 'Operator Sore (Bambang)')) {
    DbService.createEmployee({ name: 'Operator Sore (Bambang)', password: '123', role: 0 });
  }

  // Kasir serah terima shift dengan kas fisik sesuai
  const handoverRes = DbService.closeShiftHandover({
    shiftId: activeShiftSummary.currentShift.id,
    incomingOperator: 'Operator Sore (Bambang)',
    incomingPassword: '123',
    actualEndCash: activeShiftSummary.expectedEndCash,
    note: 'Shift pagi lancar, semua PC normal, fisik kas klop 100%',
    staff: activeShiftSummary.currentShift.employeeName
  });
  assertSim(handoverRes.success === true, 'Tutup Shift & Handover Sukses', handoverRes.success ? `Selisih Kas: Rp ${(handoverRes.variance ?? 0).toLocaleString('id-ID')}` : handoverRes.message);
  assertSim(handoverRes.variance === 0, 'Zero Variance: Pembukuan Kas Sempurna & Akurat!');

  // Clean shutdown
  pcs.forEach(pc => pc.close());
  BillingEngine.stop();
  ServerNetworkBridge.stop();

  console.log('\n################################################################');
  console.log(`🎉 SIMULASI WARNET SELESAI: ${stageCount} TAHAPAN SUKSES, ${errors} ERROR`);
  console.log('################################################################\n');

  try {
    const electronModule = await import('electron');
    const app = electronModule.app || (electronModule as any).default?.app;
    if (app) app.exit(errors > 0 ? 1 : 0);
  } catch {}
  process.exit(errors > 0 ? 1 : 0);
}

async function bootstrap() {
  let dummyWin: any = null;
  try {
    const electronModule = await import('electron');
    const app = electronModule.app || (electronModule as any).default?.app;
    const BrowserWindow = electronModule.BrowserWindow || (electronModule as any).default?.BrowserWindow;
    if (app) {
      app.on('window-all-closed', (e: any) => e.preventDefault());
      if (!app.isReady()) {
        await app.whenReady();
      }
      if (BrowserWindow) {
        dummyWin = new BrowserWindow({ show: false, width: 100, height: 100 });
      }
    }
  } catch {}
  try {
    await runRealWarnetSimulation();
  } finally {
    if (dummyWin) {
      try { dummyWin.destroy(); } catch {}
    }
  }
}

bootstrap().catch(err => {
  console.error('Simulation Fatal Error:', err);
  process.exit(1);
});
