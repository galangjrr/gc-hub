// Verifies the AgentClient <-> gc-agent line protocol: request framing, response parsing,
// error propagation, and the no-agent timeout. Runs over a fake agent on a local named pipe, so it
// needs no installed agent and no Electron. Windows only, like the agent. Register: npm run test:agent-client.
import assert from 'node:assert/strict';
import net from 'node:net';

// A fake agent: reads newline-delimited JSON requests, replies per the handler given.
function startFakeAgent(sockPath: string, reply: (req: any) => any): Promise<net.Server> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let buf = '';
      socket.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        let nl: number;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          const req = JSON.parse(line);
          socket.write(JSON.stringify(reply(req)) + '\n');
        }
      });
    });
    server.listen(sockPath, () => resolve(server));
  });
}

async function main() {
  let passed = 0;
  const pass = (msg: string) => { console.log(`  ✓ ${msg}`); passed++; };

  const sockPath = `\\\\.\\pipe\\gc-agent-test-${process.pid}`;
  process.env.GC_AGENT_PIPE = sockPath;

  // Import AFTER the env override so the module picks up the test socket path.
  const { AgentClient } = await import('../src/main/agentClient');

  let lastReq: any = null;
  const server = await startFakeAgent(sockPath, (req) => {
    lastReq = req;
    if (req.cmd === 'apply-policy') return { id: req.id, ok: true, applied: ['DisableTaskMgr', 'NoRun'] };
    if (req.cmd === 'clear-policy') return { id: req.id, ok: true, applied: [] };
    if (req.cmd === 'kill-process') return { id: req.id, ok: true };
    if (req.cmd === 'ping') return { id: req.id, ok: true, kioskEnabled: false, exePolicy: { mode: 'audit', allowPaths: ['D:\\Steam\\*'] } };
    if (req.cmd === 'set-kiosk') return { id: req.id, ok: true, kioskEnabled: req.enabled };
    if (req.cmd === 'set-exe-policy') return { id: req.id, ok: true, exePolicy: req.exePolicy };
    return { id: req.id, ok: false, error: 'perintah tidak dikenal' };
  });

  // 1. apply-policy sends the full locked config and resolves with the applied names
  const applyRes = await AgentClient.applyKioskPolicy();
  assert.equal(applyRes.ok, true, 'apply resolves ok');
  assert.equal(lastReq.cmd, 'apply-policy', 'apply sends the apply-policy command');
  assert.deepEqual(
    lastReq.policy,
    { disableTaskMgr: true, disableControlPanel: true, disableRunDialog: true, disableRegistryTools: true },
    'apply forwards every lockdown flag as true'
  );
  assert.deepEqual(applyRes.applied, ['DisableTaskMgr', 'NoRun'], 'apply returns the names the agent set');
  pass('apply-policy framing + response parsing');

  // 2. clear-policy sends all-false flags
  await AgentClient.clearKioskPolicy();
  assert.deepEqual(
    lastReq.policy,
    { disableTaskMgr: false, disableControlPanel: false, disableRunDialog: false, disableRegistryTools: false },
    'clear forwards every flag as false'
  );
  pass('clear-policy framing');

  // 3. kill-process forwards the pid and name the caller passed
  const killRes = await AgentClient.killProcess(4321, 'chrome.exe');
  assert.equal(killRes.ok, true, 'kill resolves ok');
  assert.equal(lastReq.cmd, 'kill-process', 'kill sends the kill-process command');
  assert.equal(lastReq.pid, 4321, 'kill forwards the pid');
  assert.equal(lastReq.name, 'chrome.exe', 'kill forwards the process name');
  pass('kill-process framing');

  // 3b. kiosk switch: ping carries the state, set-kiosk sends an explicit boolean
  assert.equal(await AgentClient.getKioskEnabled(), false, 'ping reports the kiosk switch');
  assert.equal(lastReq.cmd, 'ping', 'kiosk state is read with ping');
  const kioskRes = await AgentClient.setKioskEnabled(true);
  assert.equal(lastReq.cmd, 'set-kiosk', 'switch sends the set-kiosk command');
  assert.equal(lastReq.enabled, true, 'switch forwards enabled as a boolean');
  assert.equal(kioskRes.kioskEnabled, true, 'switch returns the new state');
  pass('kiosk switch framing');

  // 3c. exe allowlist: ping carries the stored setting, set-exe-policy forwards it whole
  assert.deepEqual(await AgentClient.getExePolicy(), { mode: 'audit', allowPaths: ['D:\\Steam\\*'] }, 'ping reports the exe policy');
  const exe = { mode: 'enforce' as const, allowPaths: ['%OSDRIVE%\\Users\\*\\AppData\\Local\\Roblox\\*'] };
  const exeRes = await AgentClient.setExePolicy(exe);
  assert.equal(lastReq.cmd, 'set-exe-policy', 'allowlist sends the set-exe-policy command');
  assert.deepEqual(lastReq.exePolicy, exe, 'allowlist forwards mode and paths unchanged');
  assert.deepEqual(exeRes.exePolicy, exe, 'allowlist returns the stored setting');
  pass('exe allowlist framing');

  // 4. an agent error (ok:false) rejects rather than resolving silently
  const errServer = server;
  await new Promise<void>((r) => errServer.close(() => r()));
  const server2 = await startFakeAgent(sockPath, (req) => ({ id: req.id, ok: false, error: 'akses ditolak' }));
  await assert.rejects(() => AgentClient.applyKioskPolicy(), /akses ditolak/, 'agent error propagates to a rejection');
  pass('agent error propagation');
  await new Promise<void>((r) => server2.close(() => r()));

  // 4. no agent listening -> rejects (connection refused / timeout), never hangs or resolves
  await assert.rejects(() => AgentClient.clearKioskPolicy(), 'missing agent rejects, fails soft for callers');
  pass('no-agent failure is a rejection');

  console.log(`\nAgentClient protocol: ${passed} checks passed.`);
}

main().then(() => process.exit(0)).catch((err) => { console.error('\n✗ FAILED:', err); process.exit(1); });
