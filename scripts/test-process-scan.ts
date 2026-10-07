// Scans this PC with the real SystemService: every entry must be a live PID with a status, never an invented list.
import { app } from 'electron';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { SystemService } from '../src/main/systemService';

const pidsNow = () =>
  execFileSync('powershell', ['-NoProfile', '-Command', '(Get-Process).Id -join ","'], { encoding: 'utf8' }).trim().split(',').map(Number);

app.whenReady().then(async () => {
  for (const includeSystem of [false, true]) {
    const before = pidsNow();
    const list = await SystemService.getRunningProcesses(includeSystem);
    const livePids = new Set([...before, ...pidsNow()]);
    assert.ok(Array.isArray(list));
    // Short-lived helpers (the scan's own powershell and conhost) exit between the two reads,
    // so allow a couple of misses; an invented list would miss almost every PID.
    const missing = list.filter(p => !livePids.has(p.pid));
    assert.ok(missing.length <= 3, `PIDs not running: ${missing.map(p => `${p.name}:${p.pid}`).join(', ')}`);
    for (const p of list) {
      assert.ok(p.status === 'running' || p.status === 'not_responding', `${p.name} status ${p.status}`);
    }
    if (!includeSystem) assert.ok(list.every(p => !p.isProtected && p.category !== 'system'), 'user scan hides system and billing');
    console.log(`includeSystem=${includeSystem}: ${list.length} processes, ${list.filter(p => p.status === 'not_responding').length} hung`);
  }
  console.log('test-process-scan: ok');
  app.exit(0);
}).catch(err => { console.error(err); app.exit(1); });
