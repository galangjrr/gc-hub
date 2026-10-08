// Registry snapshot and restore used by 1-Click Setup and revert (src/main/windowsProvisioner.ts).
// Windows only. Writes under a throwaway HKCU key and deletes it at the end; never touches the
// machine keys setup itself changes.
import { execFileSync } from 'child_process';
import { readRegValue, writeRegValue, snapshotRegistry, newBoothPassword } from '../src/main/windowsProvisioner';

const KEY = 'HKCU\\Software\\GCHubProvisionerTest';
let failed = 0;
function assert(condition: boolean, name: string) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failed++;
}

if (process.platform !== 'win32') {
  console.log('SKIP: butuh Windows');
  process.exit(0);
}

try {
  console.log('readRegValue / writeRegValue');
  assert(readRegValue(KEY, 'Missing') === null, 'value yang tidak ada dibaca null');

  const cases = [
    { name: 'Plain', value: { type: 'REG_SZ', data: '1' } },
    { name: 'Spaces', value: { type: 'REG_SZ', data: 'GC Net' } },
    { name: 'Empty', value: { type: 'REG_SZ', data: '' } },
    { name: 'Quoted', value: { type: 'REG_SZ', data: '"C:\\Program Files\\GC Hub\\GC-Hub-Client.exe" --mode=client' } },
    { name: 'Dword', value: { type: 'REG_DWORD', data: '0x1' } },
  ];
  for (const c of cases) {
    writeRegValue(KEY, c.name, c.value);
    const back = readRegValue(KEY, c.name);
    assert(back?.type === c.value.type && back?.data === c.value.data, `round trip ${c.name}: ${JSON.stringify(back)}`);
  }

  // Revert of a value that did not exist before setup deletes it
  writeRegValue(KEY, 'Plain', null);
  assert(readRegValue(KEY, 'Plain') === null, 'restore null menghapus value');
  writeRegValue(KEY, 'Plain', null); // and is a no-op when already gone
  assert(readRegValue(KEY, 'Plain') === null, 'restore null kedua kali tidak error');

  // Snapshot round trip: capture, overwrite like setup does, restore
  const original = readRegValue(KEY, 'Spaces');
  writeRegValue(KEY, 'Spaces', { type: 'REG_SZ', data: 'diubah setup' });
  writeRegValue(KEY, 'Spaces', original);
  assert(readRegValue(KEY, 'Spaces')?.data === 'GC Net', 'nilai asli kembali setelah restore');

  console.log('snapshotRegistry');
  const legacy = snapshotRegistry({
    timestamp: 0, createdUserName: 'GC Net', gameDirectories: [], firewallRulesAdded: [],
    originalDefaultUser: 'Owner', originalAutoAdminLogon: '0',
  });
  const winlogon = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon';
  assert(legacy[`${winlogon}|DefaultUserName`]?.data === 'Owner', 'snapshot lama: user asli dipakai');
  assert(legacy[`${winlogon}|AutoAdminLogon`]?.data === '0', 'snapshot lama: AutoAdminLogon asli dipakai');
  assert(legacy[`${winlogon}|DefaultPassword`] === null, 'snapshot lama: DefaultPassword dihapus');
  assert(!Object.keys(legacy).some(k => k.includes('Error Reporting')), 'snapshot lama: nilai yang tidak tercatat tidak disentuh');
  const fresh = { a: null };
  assert(snapshotRegistry({ timestamp: 0, createdUserName: 'x', gameDirectories: [], firewallRulesAdded: [], registry: fresh }) === fresh, 'snapshot baru dipakai apa adanya');

  console.log('newBoothPassword');
  const pw = newBoothPassword();
  assert(pw.length === 13, `panjang 13, net user tidak bertanya: ${pw.length}`);
  assert(/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[^A-Za-z0-9]/.test(pw), 'lolos aturan kompleksitas');
  assert(newBoothPassword() !== pw, 'acak tiap kali');
} finally {
  try {
    execFileSync('reg', ['delete', KEY, '/f'], { stdio: 'ignore' });
  } catch {}
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
