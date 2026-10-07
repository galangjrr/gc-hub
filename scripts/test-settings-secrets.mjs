// Needs a fresh build: npm run build:server && node build-electron.mjs. Opens the server window for a few seconds.
// Launch the real server build on a temp DB, drive electronAPI over CDP, assert secret handling.
import { spawn } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs'; import os from 'os'; import path from 'path';
const require = createRequire(process.cwd() + '/package.json');
const WebSocket = require('ws');
const electron = require('electron');
const db = fs.mkdtempSync(path.join(os.tmpdir(), 'gchub-ipc-'));
const proc = spawn(electron, ['.', '--mode=server', '--remote-debugging-port=9333'], { env: { ...process.env, GCHUB_DB_DIR: db, GCHUB_NO_OS_EFFECTS: '1', VITE_DEV_SERVER_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0; const check = (ok, n) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n}`); if (!ok) fail++; };
try {
  let target;
  for (let i = 0; i < 40 && !target; i++) { await sleep(500); try { target = (await (await fetch('http://127.0.0.1:9333/json')).json()).find(t => t.type === 'page' && t.url.startsWith('file:')); } catch {} }
  if (!target) throw new Error('page not found');
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.on('open', r));
  let id = 0; const pending = new Map();
  ws.on('message', m => { const d = JSON.parse(m); pending.get(d.id)?.(d); });
  const ev = expr => new Promise(r => { const i = ++id; pending.set(i, d => r(d.result?.result?.value)); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: `(async()=>JSON.stringify(await (${expr})))()`, awaitPromise: true } })); });
  await sleep(1500);
  const api = 'window.electronAPI';
  check(JSON.parse(await ev(`${api}.getSetting('lan_secret')`)) === null, 'Kunci LAN ditolak sebelum login admin');
  const setup = JSON.parse(await ev(`${api}.setupInitialAdmin({username:'owner',password:'Rahasia123!'})`));
  check(setup?.success, 'admin pertama dibuat: ' + (setup?.message || ''));
  const lan = JSON.parse(await ev(`${api}.getSetting('lan_secret')`));
  check(typeof lan === 'string' && lan.length === 32, 'admin bisa lihat Kunci LAN');
  await ev(`${api}.saveSetting('supabaseServiceKey','sb_secret_TESTONLY123')`);
  const sk = JSON.parse(await ev(`${api}.getSetting('supabaseServiceKey')`));
  check(sk === true, 'service key tidak pernah dikirim, cuma true (dapat: ' + JSON.stringify(sk) + ')');
  check(JSON.parse(await ev(`${api}.getSetting('cashierRoundingStep')`)) !== undefined, 'setting biasa tetap terbaca');
  ws.close();
} catch (e) { console.log('ERROR', e.message); fail++; }
finally { proc.kill(); await sleep(800); fs.rmSync(db, { recursive: true, force: true }); }
process.exit(fail ? 1 : 0);
