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
// Commands that may re-apply the AppLocker allowlist run PowerShell inside the agent.
const APPLOCKER_TIMEOUT_MS = 30000;

// Matches ExePolicy in agent/applocker_windows.go. allowPaths take AppLocker path syntax, e.g.
// %OSDRIVE%\Users\*\AppData\Local\Roblox\*.
export interface ExePolicy {
  mode: 'off' | 'audit' | 'enforce';
  allowPaths: string[];
}

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
  kioskEnabled?: boolean;
  exePolicy?: ExePolicy;
}

function sendCommand(cmd: string, extra: Record<string, unknown> = {}, timeoutMs = TIMEOUT_MS): Promise<AgentResponse> {
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

    socket.setTimeout(timeoutMs,() => done(new Error('gc-agent tidak merespons')));
    socket.on('error', (err) => done(err));
    socket.on('connect', () => {
      socket.write(JSON.stringify({ id, cmd, ...extra }) + '\n');
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
    return sendCommand('apply-policy', { policy: LOCKED_POLICY });
  },

  /** Remove every policy the agent manages, returning the machine to an unlocked state. */
  clearKioskPolicy(): Promise<AgentResponse> {
    return sendCommand('clear-policy', {
      policy: {
        disableTaskMgr: false,
        disableControlPanel: false,
        disableRunDialog: false,
        disableRegistryTools: false
      }
    });
  },

  /** Read the kiosk switch. Resolves undefined from an older agent that does not know it. */
  async getKioskEnabled(): Promise<boolean | undefined> {
    return (await sendCommand('ping')).kioskEnabled;
  },

  /** Switch kiosk mode on or off. Off clears the policy and stops the watchdog until switched back on. */
  setKioskEnabled(enabled: boolean): Promise<AgentResponse> {
    return sendCommand('set-kiosk', { enabled }, APPLOCKER_TIMEOUT_MS);
  },

  /** Read the stored exe allowlist setting. Resolves undefined from an older agent. */
  async getExePolicy(): Promise<ExePolicy | undefined> {
    return (await sendCommand('ping')).exePolicy;
  },

  /** Store and apply the exe allowlist. The agent validates the paths and lifts it while the kiosk is off. */
  setExePolicy(policy: ExePolicy): Promise<AgentResponse> {
    return sendCommand('set-exe-policy', { exePolicy: policy }, APPLOCKER_TIMEOUT_MS);
  },

  /**
   * Terminate a process with SYSTEM rights. The agent re-checks its own guard (protected system
   * and billing processes are never killed), so this is not a kill-anything primitive.
   */
  killProcess(pid: number, name: string): Promise<AgentResponse> {
    return sendCommand('kill-process', { pid, name });
  }
};
