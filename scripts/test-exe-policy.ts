// Exe allowlist rules in src/shared/exePolicy.ts. The path cases mirror TestValidateAllowPath in
// agent/agent_windows_test.go, so the UI and the agent cannot drift apart unnoticed.
// Register: npm run test:exe-policy.
import assert from 'node:assert/strict';
import { allowPathError, parseAllowPaths, exePolicyError, effectiveExePolicy, parseExeSettings } from '../src/shared/exePolicy';

let passed = 0;
const pass = (msg: string) => { console.log(`  ✓ ${msg}`); passed++; };

const ok = [
  '%OSDRIVE%\\Users\\*\\AppData\\Local\\Roblox\\*',
  'D:\\Steam\\*',
  'D:\\Launchers\\Riot Games\\*',
  '%PROGRAMFILES%\\Tools\\app.exe',
  '%OSDRIVE%\\ProgramData\\Battle.net\\*',
];
const bad = [
  '*',
  'D:\\*',
  'D:\\',
  '%OSDRIVE%\\*',
  '%OSDRIVE%\\Users\\*',
  '%OSDRIVE%\\Users\\*\\AppData\\*',
  '%OSDRIVE%\\ProgramData\\*',
  'D:\\Games\\..\\*',
  'Games\\*',
  '%LOCALAPPDATA%\\Roblox\\*',
  'D:\\a"b\\*',
  '\\\\server\\share\\*',
];
for (const p of ok) assert.equal(allowPathError(p), null, `${p} should be accepted`);
for (const p of bad) assert.notEqual(allowPathError(p), null, `${p} should be rejected`);
pass('path rules match the agent');

const parsed = parseAllowPaths('D:\\Steam\\*\n\n  d:\\steam\\*  \nD:\\*\n%OSDRIVE%\\Users\\*\\AppData\\Local\\Roblox\\*\r\n');
assert.deepEqual(parsed.paths, ['D:\\Steam\\*', '%OSDRIVE%\\Users\\*\\AppData\\Local\\Roblox\\*'], 'trims, skips blanks and case-insensitive duplicates');
assert.equal(parsed.errors.length, 1, 'reports the too-broad line');
assert.ok(parsed.errors[0].startsWith('D:\\*'), 'error names the offending line');
assert.equal(parseAllowPaths(Array.from({ length: 33 }, (_, i) => `D:\\App${i}\\*`).join('\n')).errors.length, 1, 'caps the list at 32');
pass('textarea parsing');

assert.equal(exePolicyError({ mode: 'audit', allowPaths: ['D:\\Steam\\*'] }), null);
assert.notEqual(exePolicyError({ mode: 'block', allowPaths: [] }), null, 'unknown mode');
assert.notEqual(exePolicyError({ mode: 'audit' }), null, 'missing paths');
assert.notEqual(exePolicyError({ mode: 'audit', allowPaths: [42] }), null, 'non-string path');
assert.notEqual(exePolicyError({ mode: 'enforce', allowPaths: ['D:\\*'] }), null, 'too-broad path');
assert.notEqual(exePolicyError(null), null, 'null payload');
pass('IPC and LAN payload shape check');

const settings = { defaultMode: 'off' as const, allowPaths: ['D:\\Steam\\*'], overrides: { 'PC-03': 'audit' as const } };
assert.deepEqual(effectiveExePolicy(settings, 'pc-03 '), { mode: 'audit', allowPaths: ['D:\\Steam\\*'] }, 'override by PC name, case and space insensitive');
assert.equal(effectiveExePolicy(settings, 'PC-04').mode, 'off', 'other PCs follow the default');
pass('per-PC override');

assert.equal(parseExeSettings(''), null, 'never saved means unmanaged');
assert.equal(parseExeSettings('{broken'), null, 'broken JSON is unmanaged, not a crash');
assert.deepEqual(
  parseExeSettings(JSON.stringify({ defaultMode: 'nuke', allowPaths: ['D:\\*', 'D:\\Steam\\*', 7], overrides: { 'pc-01': 'enforce', 'PC-02': 'bad' } })),
  { defaultMode: 'off', allowPaths: ['D:\\Steam\\*'], overrides: { 'PC-01': 'enforce' } },
  'damaged fields are dropped, never passed to a booth'
);
pass('stored settings parsing');

console.log(`\nExe allowlist rules: ${passed} checks passed.`);
