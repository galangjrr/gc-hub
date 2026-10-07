import net from 'net';

/**
 * Client to the gc-agent LocalSystem service (see agent/). The booth client UI runs as a standard
 * user and cannot write machine-wide kiosk policy; it asks the agent to do it over a named pipe.
 *
 * Every call fails soft: if the agent is not installed (dev machines, a booth not yet provisioned,
 * or a non-Windows preview) the promise rejects and callers log and carry on. The lock screen UI
 * still works; only the HKLM policy enforcement is missing, which is expected off a provisioned PC.
 */

// GC_AGENT_PIPE lets tests point the client at a local socket that speaks the same line protocol.
const PIPE_PATH = process.env.GC_AGENT_PIPE || '\\\\.\\pipe\\gc-hub-agent';
const TIMEOUT_MS = 3000;

// Matches SecurityPolicyConfig in src/client/security/registryPolicy.ts and PolicyConfig in the agent.
export interface KioskPolicy {
  disableTaskMgr: boolean;
  disableControlPanel: boolean;
  disableRunDialog: boolean;
  disableRegistryTools: boolean;
}

const LOCKED_POLICY: KioskPolicy = {
  disableTaskMgr: true,
  disableControlPanel: true,
  disableRunDialog: true,
  disableRegistryTools: true
};

interface AgentResponse {
  id: string;
  ok: boolean;
  error?: string;
  applied?: string[];
}

function sendCommand(cmd: string, policy?: KioskPolicy): Promise<AgentResponse> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const socket = net.connect(PIPE_PATH);
    let buf = '';
    let settled = false;

    const done = (err: Error | null, res?: AgentResponse) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(res!);
    };

    socket.setTimeout(TIMEOUT_MS, () => done(new Error('gc-agent tidak merespons')));
    socket.on('error', (err) => done(err));
    socket.on('connect', () => {
      socket.write(JSON.stringify({ id, cmd, policy: policy ?? LOCKED_POLICY }) + '\n');
    });
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      try {
        const res = JSON.parse(buf.slice(0, nl)) as AgentResponse;
        if (!res.ok) done(new Error(res.error || 'gc-agent menolak perintah'));
        else done(null, res);
      } catch (e) {
        done(e as Error);
      }
    });
  });
}

export const AgentClient = {
  /** Apply the full kiosk lockdown policy (Task Manager, Run, Control Panel, Registry tools) at HKLM. */
  applyKioskPolicy(): Promise<AgentResponse> {
    return sendCommand('apply-policy', LOCKED_POLICY);
  },

  /** Remove every policy the agent manages, returning the machine to an unlocked state. */
  clearKioskPolicy(): Promise<AgentResponse> {
    return sendCommand('clear-policy', {
      disableTaskMgr: false,
      disableControlPanel: false,
      disableRunDialog: false,
      disableRegistryTools: false
    });
  }
};
