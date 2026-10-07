import { createMember, getMemberByUsername } from './member';
import { createSessionLog, getActiveSessionForWorkstation } from './session';

console.log('--- Testing DB Implementation ---');

try {
  // 1. Create a dummy member
  console.log('[1] Creating test member...');
  try {
    createMember('pro_gamer_2026', 15000); // 15rb saldo
    console.log('Member created successfully.');
  } catch (e: any) {
    if (e.message.includes('UNIQUE')) {
      console.log('Member already exists, skipping creation.');
    } else {
      throw e;
    }
  }

  // 2. Read member
  console.log('\n[2] Reading member...');
  const member = getMemberByUsername('pro_gamer_2026');
  console.log(member);

  // 3. Create Session Log
  console.log('\n[3] Creating session log...');
  createSessionLog({
    sessionId: 1001,
    workstationId: 5,
    accountId: member!.id,
    accountType: 1,
    timePrice: 4000, // Rp 4000 per jam
    isOpenTime: 0,
    isPostPay: 0,
    status: 'active', // active
    startDate: '20260821',
    startTime: '214500',
  });
  console.log('Session log created successfully.');

  // 4. Read Session Log
  console.log('\n[4] Reading active session for workstation 5...');
  const session = getActiveSessionForWorkstation(5);
  console.log(session);

  console.log('\n✅ DB Test Passed!');
} catch (e) {
  console.error('\n❌ DB Test Failed:', e);
}
