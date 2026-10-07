import { app } from 'electron';
import { DbService } from '../src/server/db/dbService';
import { BillingEngine } from '../src/server/engine/billingEngine';
import { ServerNetworkBridge } from '../src/server/network/serverNetwork';

let failed = 0;
function assert(condition: boolean, name: string) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failed++;
}

async function run() {
  await DbService.init();
  const pc = 'PC-TEST-MEMBER';
  // Anggap client PC tersambung agar tick menghitung waktu (bukan jeda)
  (ServerNetworkBridge as any).getConnectedClients = () => [{ pcId: pc, pcName: pc }];

  DbService.addWorkstation({ name: pc, ip: '192.168.1.240', pricePerHour: 6000 });
  const uname = `mbr_${Date.now()}`;
  const member = DbService.createMember({ username: uname, password: 'test1234', money: 10000 });

  BillingEngine.startSession(pc, { username: uname, userType: 'member', billingType: 'member', durationMinutes: 100, price: 0, pricePerHour: 6000, memberId: member.id });
  BillingEngine.simulateSessionElapsed(pc, 30);
  (BillingEngine as any).tick(false);
  const s = BillingEngine.getSession(pc)!;
  assert(s.totalCost === 3000, `biaya member 30 menit @6000/jam = 3000 (dapat ${s.totalCost})`);

  BillingEngine.stopSession(pc, 'Logout');
  const after = DbService.getMembers().find(m => m.id === member.id)!;
  assert(after.money === 7000, `saldo member terpotong 10000 -> 7000 (dapat ${after.money})`);

  // Sesi tanpa harga di muka (postpaid / kupon) tidak boleh mencatat omzet fiktif
  const txBefore = DbService.getTransactions(100000).length;
  // PC terpisah: satu PC hanya boleh punya satu sesi berjalan
  const pcPostpaid = `${pc}-B`;
  BillingEngine.startSession(pcPostpaid, { username: 'guest_postpaid', billingType: 'postpaid', pricePerHour: 6000 });
  BillingEngine.startSession(pc, { username: 'guest_kupon', billingType: 'package', durationMinutes: 60, price: 0, packageName: 'Kupon [X]' });
  const txAfter = DbService.getTransactions(100000).length;
  assert(txAfter === txBefore, `mulai sesi postpaid/kupon tidak menambah transaksi (tambah ${txAfter - txBefore})`);
  BillingEngine.stopSession(pc, 'Selesai');
  BillingEngine.stopSession(pcPostpaid, 'Selesai');

  // Refund: event sesi berakhir membawa nominal refund agar log omzet cloud mencatat harga bersih
  const endedEvents: any[] = [];
  const unsub = BillingEngine.onSessionEnded(e => endedEvents.push(e));
  BillingEngine.startSession(pc, { username: 'guest_refund', billingType: 'package', durationMinutes: 120, price: 8000, packageName: 'Paket 2 Jam' });
  const refund = BillingEngine.refundSession(pc, { reason: 'Uji refund', penaltyPercent: 0 });
  unsub();
  const ev = endedEvents[0];
  assert(refund.success && ev?.totalCost === 8000 && ev?.refundedAmount === refund.refundAmount && (refund.refundAmount || 0) > 0,
    `refund tercatat di event sesi berakhir (bayar ${ev?.totalCost}, kembali ${ev?.refundedAmount})`);

  DbService.deleteMember(member.id);
  BillingEngine.deleteWorkstation(pc);
  BillingEngine.deleteWorkstation(pcPostpaid);
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  app.exit(failed ? 1 : 0);
}

app.whenReady().then(run).catch(err => { console.error(err); app.exit(1); });
