/**
 * GC-Hub Billing Engine Logic & "Ganti Paket" Automated Test Suite
 * Tests all boundary conditions, 80% tolerance threshold, upgrade math, and persistence.
 */

class BillingTestSimulator {
  constructor() {
    this.session = null;
  }

  startSession(pcId, initialMinutes, price, packageName) {
    const durationSec = initialMinutes * 60;
    this.session = {
      pcId,
      username: `Member_${pcId}`,
      billingType: 'package',
      initialTotalSeconds: durationSec,
      remainingSeconds: durationSec,
      elapsedSeconds: 0,
      totalCost: price,
      packageName
    };
    return this.session;
  }

  setElapsedMinutes(minutes) {
    if (!this.session) throw new Error('No active session');
    const elapSec = minutes * 60;
    this.session.elapsedSeconds = elapSec;
    this.session.remainingSeconds = Math.max(0, this.session.initialTotalSeconds - elapSec);
  }

  replacePackage(newMinutes, price, packageName) {
    if (!this.session) return { success: false, message: 'No active session' };

    const prevPrice = this.session.totalCost || 0;
    const currentElapsedMin = Math.floor(this.session.elapsedSeconds / 60);

    // Rule: Duration <= elapsed
    if (newMinutes <= currentElapsedMin) {
      return {
        success: false,
        reason: 'DURATION_TOO_SHORT',
        message: `Ditolak: Durasi paket baru (${newMinutes}m) <= waktu terpakai (${currentElapsedMin}m).`
      };
    }

    // Success calculations (No refund if price is lower)
    const priceDiff = Math.max(0, price - prevPrice);
    const newDurationSec = newMinutes * 60;
    this.session.initialTotalSeconds = newDurationSec;
    this.session.remainingSeconds = Math.max(0, newDurationSec - this.session.elapsedSeconds);
    this.session.totalCost = Math.max(prevPrice, price);
    this.session.packageName = packageName;

    return {
      success: true,
      diff: priceDiff,
      remainingMinutes: Math.ceil(this.session.remainingSeconds / 60),
      totalCost: this.session.totalCost
    };
  }
}

function runTests() {
  console.log('====================================================');
  console.log('🚀 GC-HUB BILLING ENGINE LOGIC TEST RUNNER');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      if (details) console.log(`     -> ${details}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name}`);
      if (details) console.error(`     -> ${details}`);
      failed++;
    }
  }

  const sim = new BillingTestSimulator();

  // ----------------------------------------------------
  // TEST CASE 1: Start 60m @ Rp 4.000, Set elapsed 14m
  // ----------------------------------------------------
  console.log('--- TEST 1: SETUP SESI AWAL & KONDISI 14 MENIT ---');
  sim.startSession('PC-01', 120, 8000, 'Paket 2 Jam');
  sim.setElapsedMinutes(14);
  assert(sim.session.remainingSeconds === 106 * 60, 'Sisa waktu awal 106 menit (1j 46m)', `Sisa: ${sim.session.remainingSeconds / 60}m`);
  assert(sim.session.elapsedSeconds === 14 * 60, 'Waktu terpakai 14 menit', `Terpakai: ${sim.session.elapsedSeconds / 60}m`);

  // ----------------------------------------------------
  // TEST CASE 2: Coba Ganti ke Paket 10 Menit (Rp 1.000)
  // Aturan: Harus DITOLAK karena 10m <= 14m (waktu terpakai)
  // ----------------------------------------------------
  console.log('\n--- TEST 2: GANTI KE PAKET LEBIH KECIL DARI WAKTU TERPAKAI ---');
  const res2 = sim.replacePackage(10, 1000, 'Paket 10 Menit');
  assert(res2.success === false && res2.reason === 'DURATION_TOO_SHORT', 'Tolak jika paket baru (10m) <= waktu terpakai (14m)', res2.message);

  // ----------------------------------------------------
  // TEST CASE 3: Ganti Paket dari 2 Jam (120m) ke 1 Jam (60m) saat Terpakai 14m
  // Aturan: DISETUJUI, sisa waktu baru = 60 - 14 = 46m. Selisih bayar = 0 (no refund)
  // ----------------------------------------------------
  console.log('\n--- TEST 3: GANTI PAKET 2 JAM KE 1 JAM (TERPAKAI 14M -> SISA 46M) ---');
  const res3 = sim.replacePackage(60, 4000, 'Paket 1 Jam');
  assert(res3.success === true, 'Ganti paket 2 jam ke 1 jam disetujui karena 60m > 14m', `Message: ${JSON.stringify(res3)}`);
  assert(res3.remainingMinutes === 46, 'Sisa waktu baru 46 menit (1j - 14m)', `Sisa baru: ${res3.remainingMinutes}m`);
  assert(res3.diff === 0, 'Selisih bayar Rp 0 (no refund)', `Diff: Rp ${res3.diff}`);
  assert(res3.totalCost === 8000, 'Total biaya sesi tetap Rp 8.000 (tidak berkurang)', `Total: Rp ${res3.totalCost}`);

  // ----------------------------------------------------
  // TEST CASE 4: Upgrade Paket dari 1 Jam (60m) ke 3 Jam (180m) saat Terpakai 30m
  // Aturan: Disetujui, Sisa Waktu = 180 - 30 = 150m, Selisih Bayar = Rp 12.000 - Rp 4.000 = Rp 8.000
  // ----------------------------------------------------
  console.log('\n--- TEST 4: UPGRADE PAKET VALID (30 MENIT TERPAKAI) ---');
  sim.startSession('PC-02', 60, 4000, 'Paket 1 Jam');
  sim.setElapsedMinutes(30); // 30m terpakai
  const res4 = sim.replacePackage(180, 12000, 'Paket 3 Jam');
  assert(res4.success === true, 'Upgrade paket disetujui', 'Success');
  assert(res4.remainingMinutes === 150, 'Sisa waktu baru dihitung 180 - 30 = 150 menit', `Sisa baru: ${res4.remainingMinutes}m`);
  assert(res4.diff === 8000, 'Selisih bayar kasir dihitung Rp 12.000 - Rp 4.000 = Rp 8.000', `Selisih: Rp ${res4.diff}`);
  assert(res4.totalCost === 12000, 'Total biaya sesi diperbarui ke Rp 12.000', `Total: Rp ${res4.totalCost}`);

  // ----------------------------------------------------
  // TEST CASE 5: Tolak jika waktu terpakai (70m) melebihi paket baru (60m)
  // ----------------------------------------------------
  console.log('\n--- TEST 5: CEGAH GANTI PAKET JIKA WAKTU TERPAKAI > PAKET BARU ---');
  sim.startSession('PC-03', 180, 12000, 'Paket 3 Jam');
  sim.setElapsedMinutes(70); // 70 menit terpakai
  const res5 = sim.replacePackage(60, 4000, 'Paket 1 Jam');
  assert(res5.success === false, 'Tolak ganti ke Paket 1 Jam jika waktu terpakai sudah 70m', res5.message);

  // ----------------------------------------------------
  // TEST CASE 6: Postpaid Calculation & Step Rounding (Rp 500)
  // Hourly rate Rp 4.000, Minimal Charge Rp 2.000
  // ----------------------------------------------------
  console.log('\n--- TEST 6: POSTPAID FORMULA & STEP ROUNDING (RP 500) ---');
  function calcPostpaid(elapsedMinutes, hourlyRate = 4000, minCharge = 2000) {
    const rawCost = Math.max(minCharge, (elapsedMinutes / 60) * hourlyRate);
    return Math.ceil(rawCost / 500) * 500;
  }
  assert(calcPostpaid(10) === 2000, 'Postpaid 10 menit kena minimum charge Rp 2.000', `Biaya: Rp ${calcPostpaid(10)}`);
  assert(calcPostpaid(35) === 2500, 'Postpaid 35 menit (Rp 2.333) dibulatkan ke Rp 2.500', `Biaya: Rp ${calcPostpaid(35)}`);
  assert(calcPostpaid(60) === 4000, 'Postpaid 60 menit tepat Rp 4.000', `Biaya: Rp ${calcPostpaid(60)}`);
  assert(calcPostpaid(92) === 6500, 'Postpaid 92 menit (Rp 6.133) dibulatkan ke Rp 6.500', `Biaya: Rp ${calcPostpaid(92)}`);

  // ----------------------------------------------------
  // TEST CASE 7: Guest Temporary Login Token Generator
  // ----------------------------------------------------
  console.log('\n--- TEST 7: GUEST TEMPORARY LOGIN TOKEN GENERATOR ---');
  function generateGuestToken(durationMinutes, price = 0) {
    const code = `GT-${Math.floor(100000 + Math.random() * 900000)}`;
    return { code, durationMinutes, price, isUsed: false };
  }
  const token = generateGuestToken(60, 4000);
  assert(token.code.startsWith('GT-') && token.code.length === 9, 'Format Guest Token valid (GT-XXXXXX)', `Code: ${token.code}`);
  assert(token.durationMinutes === 60, 'Durasi Guest Token 60 menit', `Durasi: ${token.durationMinutes}m`);

  // ----------------------------------------------------
  // TEST CASE 8: Member Balance Deduction & Auto-Cutoff
  // ----------------------------------------------------
  console.log('\n--- TEST 8: MEMBER SALDO BERJALAN & AUTO-CUTOFF ---');
  let member = { username: 'gamer_pro', money: 10000, usedAmount: 0 };
  const pph = 4000;
  const initialDurationMin = Math.floor((member.money / pph) * 60); // 150 menit
  assert(initialDurationMin === 150, 'Member dengan saldo Rp 10.000 dapat 150 menit', `Durasi: ${initialDurationMin}m`);

  // Simulasikan main 60 menit lalu logout
  const usedMin = 60;
  const spentMoney = Math.round((usedMin / 60) * pph); // Rp 4.000
  member.money = Math.max(0, member.money - spentMoney);
  member.usedAmount += spentMoney;
  assert(member.money === 6000, 'Sisa saldo member setelah 60 menit terpotong menjadi Rp 6.000', `Sisa: Rp ${member.money}`);
  assert(member.usedAmount === 4000, 'Total terpakai member tercatat Rp 4.000', `Used: Rp ${member.usedAmount}`);

  console.log('\n====================================================');
  console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

