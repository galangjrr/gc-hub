import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

/** A registry value as `reg query` reports it; null in a snapshot means the value did not exist. */
export interface RegValue {
  type: string;
  data: string;
}

export interface ProvisionSnapshot {
  timestamp: number;
  createdUserName: string;
  /** The booth account was already there before the first setup, so revert must not delete it. */
  userPreexisted?: boolean;
  /** Original state of every registry value setup writes, keyed `<key>|<value name>`. */
  registry?: Record<string, RegValue | null>;
  gameDirectories: string[];
  firewallRulesAdded: string[];
  // Snapshots written before `registry` existed only recorded these two.
  originalDefaultUser?: string;
  originalAutoAdminLogon?: string;
}

export interface ProvisionStatus {
  isProvisioned: boolean;
  standardUserName: string;
  autoLogonActive: boolean;
  snapshotExists: boolean;
  snapshotTimestamp?: number;
  osPlatform: string;
}

const WINLOGON_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon';
const RUN_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run';
const WER_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting';
const WU_AU_KEY = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU';

// Every registry value setup writes. Revert puts each one back exactly as the snapshot found it.
const MANAGED_VALUES: Array<[key: string, name: string]> = [
  [WINLOGON_KEY, 'AutoAdminLogon'],
  [WINLOGON_KEY, 'DefaultUserName'],
  [WINLOGON_KEY, 'DefaultPassword'],
  [WINLOGON_KEY, 'ForceAutoLogon'],
  [WER_KEY, 'DontShowUI'],
  [WU_AU_KEY, 'NoAutoRebootWithLoggedOnUsers'],
  [RUN_KEY, 'GCHubClient'],
];

const regId = (key: string, name: string) => `${key}|${name}`;

const run = (file: string, args: string[]) =>
  execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

export function readRegValue(key: string, name: string): RegValue | null {
  let out: string;
  try {
    out = run('reg', ['query', key, '/v', name]);
  } catch {
    return null; // key or value missing
  }
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s+(.+?)\s{4}(REG_\w+)(?:\s{4}(.*))?$/);
    if (m && m[1].toLowerCase() === name.toLowerCase()) return { type: m[2], data: m[3] ?? '' };
  }
  return null;
}

export function writeRegValue(key: string, name: string, value: RegValue | null): void {
  if (value) {
    run('reg', ['add', key, '/v', name, '/t', value.type, '/d', value.data, '/f']);
    return;
  }
  if (readRegValue(key, name)) run('reg', ['delete', key, '/v', name, '/f']);
}

/** Registry originals of a snapshot, converting the two fields old snapshots carried. */
export function snapshotRegistry(snapshot: ProvisionSnapshot): Record<string, RegValue | null> {
  if (snapshot.registry) return snapshot.registry;
  // Old setups wrote these four and the Run entry; they never recorded the WER and update values,
  // so those are left alone rather than guessed.
  return {
    [regId(WINLOGON_KEY, 'AutoAdminLogon')]: { type: 'REG_SZ', data: snapshot.originalAutoAdminLogon || '0' },
    [regId(WINLOGON_KEY, 'DefaultUserName')]: { type: 'REG_SZ', data: snapshot.originalDefaultUser || 'Administrator' },
    [regId(WINLOGON_KEY, 'DefaultPassword')]: null,
    [regId(WINLOGON_KEY, 'ForceAutoLogon')]: null,
    [regId(RUN_KEY, 'GCHubClient')]: null,
  };
}

/**
 * Random booth password. Auto logon types it, nobody else needs it, so it is never shown or stored
 * outside Winlogon. 13 characters: `net user` asks an interactive question above 14, and the fixed
 * upper, lower and symbol characters satisfy a complexity policy whatever the hex part comes out as.
 */
export function newBoothPassword(): string {
  return `Gc${crypto.randomBytes(5).toString('hex')}#`;
}

export class WindowsProvisioner {
  private static readonly STANDARD_USERNAME = 'GC Net';
  private static readonly FIREWALL_RULES = [
    { name: 'GC-Hub LAN Protocol (TCP 7894)', port: 7894, protocol: 'TCP' },
    { name: 'GC-Hub Wake-On-LAN (UDP 9)', port: 9, protocol: 'UDP' },
    { name: 'GC-Hub File Transfer & FTP (TCP 21)', port: 21, protocol: 'TCP' },
    { name: 'GC-Hub LAN Discovery & ICMP', port: null, protocol: 'ICMPv4' },
  ];

  private static programFiles(): string {
    return process.env.ProgramW6432 || process.env.ProgramFiles || 'C:\\Program Files';
  }

  // The snapshot is machine state, so it lives in an admin-only folder that every account can read:
  // revert then works from whichever admin account opens the client, and the booth user cannot
  // edit the values revert will write back.
  private static snapshotPath(): string {
    if (process.platform !== 'win32') return path.join(app?.getPath ? app.getPath('userData') : process.cwd(), 'provision_snapshot.json');
    return path.join(this.programFiles(), 'GC Hub Setup', 'provision_snapshot.json');
  }

  // Where older builds kept it: the userData of the account that ran setup.
  private static legacySnapshotPath(): string | null {
    if (process.platform !== 'win32' || !app?.getPath) return null;
    return path.join(app.getPath('userData'), 'provision_snapshot.json');
  }

  private static readSnapshot(): ProvisionSnapshot | null {
    for (const p of [this.snapshotPath(), this.legacySnapshotPath()]) {
      if (!p || !fs.existsSync(p)) continue;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    return null;
  }

  private static writeSnapshot(snapshot: ProvisionSnapshot): void {
    const p = this.snapshotPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(snapshot, null, 2), 'utf8');
  }

  // gc-agent ships in bin/ next to the client exe (dev: repo bin/). It is the LocalSystem helper
  // that enforces machine-wide kiosk policy the standard booth user cannot set itself.
  private static agentExePath(): string {
    const packaged = path.resolve(path.dirname(process.execPath), 'bin', 'gc-agent.exe');
    if (fs.existsSync(packaged)) return packaged;
    return path.resolve(process.cwd(), 'bin', 'gc-agent.exe');
  }

  // The copy `gc-agent install` puts under Program Files (agent/service_windows.go installDir).
  private static installedAgentDir(): string {
    return path.join(this.programFiles(), 'GC Hub Agent');
  }

  private static userExists(name: string): boolean {
    try {
      run('net', ['user', name]);
      return true;
    } catch {
      return false;
    }
  }

  public static async getStatus(): Promise<ProvisionStatus> {
    let snapshot: ProvisionSnapshot | null = null;
    try {
      snapshot = this.readSnapshot();
    } catch {}

    if (process.platform !== 'win32') {
      return {
        isProvisioned: !!snapshot,
        standardUserName: snapshot?.createdUserName || this.STANDARD_USERNAME,
        autoLogonActive: !!snapshot,
        snapshotExists: !!snapshot,
        snapshotTimestamp: snapshot?.timestamp,
        osPlatform: process.platform
      };
    }

    const userFound = this.userExists(this.STANDARD_USERNAME);
    const autoLogonActive = readRegValue(WINLOGON_KEY, 'AutoAdminLogon')?.data === '1';

    return {
      isProvisioned: userFound && autoLogonActive,
      standardUserName: this.STANDARD_USERNAME,
      autoLogonActive,
      snapshotExists: !!snapshot,
      snapshotTimestamp: snapshot?.timestamp,
      osPlatform: process.platform
    };
  }

  /**
   * 1-Click Provisioning: Sets up Windows as a hardened, auto-logon Warnet Client.
   * Running it again is safe: the first snapshot is kept, so revert still returns to the PC as it
   * was before GC Hub ever touched it.
   */
  public static async provisionClient(): Promise<{ success: boolean; message: string; steps: string[] }> {
    const steps: string[] = [];

    if (process.platform !== 'win32') {
      this.writeSnapshot({
        timestamp: Date.now(),
        createdUserName: this.STANDARD_USERNAME,
        registry: {},
        gameDirectories: ['/Games'],
        firewallRulesAdded: this.FIREWALL_RULES.map(r => r.name)
      });
      return {
        success: true,
        message: '[Preview] Simulasi 1-Click Setup PC Klien berhasil diterapkan.',
        steps: [
          'Backup snapshot konfigurasi Windows tersimpan',
          `Akun Standard User "${this.STANDARD_USERNAME}" dibuat`,
          'AutoAdminLogon dikonfigurasi ke akun standard',
          'ACL Permission direktori game diberikan',
          'Port Firewall LAN dibuka (TCP 7894, WoL UDP 9, FTP 21)'
        ]
      };
    }

    try {
      // 1. Snapshot, only on the first run. A second run would otherwise record GC Hub's own
      //    settings as the "original" and revert would restore them.
      let snapshot = this.readSnapshot();
      const firstRun = !snapshot;
      if (!snapshot) {
        const registry: Record<string, RegValue | null> = {};
        for (const [key, name] of MANAGED_VALUES) registry[regId(key, name)] = readRegValue(key, name);
        snapshot = {
          timestamp: Date.now(),
          createdUserName: this.STANDARD_USERNAME,
          registry,
          gameDirectories: [],
          firewallRulesAdded: []
        };
        // Saved before any change, so a setup that dies halfway can still be reverted.
        this.writeSnapshot(snapshot);
        steps.push('Snapshot konfigurasi awal Windows disimpan.');
      } else {
        steps.push('Snapshot awal sudah ada, dipakai ulang supaya revert tetap ke kondisi asli.');
      }

      // 2. Standard user "GC Net" with a fresh random password
      const password = newBoothPassword();
      try {
        run('net', ['user', this.STANDARD_USERNAME, password, '/add', '/comment:GC-Hub-booth-user', '/expires:never', '/passwordchg:no']);
        steps.push(`Akun user "${this.STANDARD_USERNAME}" dibuat.`);
      } catch {
        run('net', ['user', this.STANDARD_USERNAME, password]);
        if (firstRun) snapshot.userPreexisted = true;
        steps.push(`Akun user "${this.STANDARD_USERNAME}" sudah ada, password diganti baru.`);
      }
      // Windows expires local passwords after 42 days by default, and auto logon stops working then
      run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Set-LocalUser -Name '${this.STANDARD_USERNAME}' -PasswordNeverExpires $true`]);

      try {
        run('net', ['localgroup', 'Users', this.STANDARD_USERNAME, '/add']);
      } catch {} // already a member
      try {
        run('net', ['localgroup', 'Administrators', this.STANDARD_USERNAME, '/delete']);
      } catch {} // not a member
      steps.push('Role dipastikan Standard User (Non-Admin).');

      // 3. Auto logon into the booth account
      writeRegValue(WINLOGON_KEY, 'AutoAdminLogon', { type: 'REG_SZ', data: '1' });
      writeRegValue(WINLOGON_KEY, 'DefaultUserName', { type: 'REG_SZ', data: this.STANDARD_USERNAME });
      // ponytail: plaintext in Winlogon, readable by local users; the booth user only learns its own
      // random password. Upgrade path: store it as the LSA DefaultPassword secret instead.
      writeRegValue(WINLOGON_KEY, 'DefaultPassword', { type: 'REG_SZ', data: password });
      writeRegValue(WINLOGON_KEY, 'ForceAutoLogon', { type: 'REG_SZ', data: '1' });
      steps.push(`Windows AutoAdminLogon diaktifkan ke akun "${this.STANDARD_USERNAME}".`);

      // 4. Game folder access for the booth user
      for (const gDir of ['D:\\Games', 'C:\\Games', 'D:\\', 'E:\\Games']) {
        if (!fs.existsSync(gDir)) continue;
        try {
          run('icacls', [gDir, '/grant', `${this.STANDARD_USERNAME}:(OI)(CI)F`, '/T', '/C', '/Q']);
          if (!snapshot.gameDirectories.includes(gDir)) snapshot.gameDirectories.push(gDir);
          steps.push(`ACL Permission folder ${gDir} diberikan Full Access.`);
        } catch {}
      }

      // 5. Firewall. Delete first so a second run does not stack duplicate rules.
      for (const rule of this.FIREWALL_RULES) {
        try {
          run('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${rule.name}`]);
        } catch {} // not there yet
        try {
          if (rule.port) {
            run('netsh', ['advfirewall', 'firewall', 'add', 'rule', `name=${rule.name}`, 'dir=in', 'action=allow', `protocol=${rule.protocol}`, `localport=${rule.port}`]);
          } else {
            run('netsh', ['advfirewall', 'firewall', 'add', 'rule', `name=${rule.name}`, 'protocol=icmpv4:8,any', 'dir=in', 'action=allow']);
          }
          if (!snapshot.firewallRulesAdded.includes(rule.name)) snapshot.firewallRulesAdded.push(rule.name);
        } catch {}
      }
      steps.push('Firewall rules LAN (Billing WS 7894, WoL UDP 9, FTP, ICMP) dibuka.');

      // 6. Crash pop-ups and update reboots off. Sticky Keys is turned off by the client itself at
      //    start, inside the booth user's own session (RemoteInputInjector.disableStickyKeysHotkey).
      writeRegValue(WER_KEY, 'DontShowUI', { type: 'REG_DWORD', data: '1' });
      writeRegValue(WU_AU_KEY, 'NoAutoRebootWithLoggedOnUsers', { type: 'REG_DWORD', data: '1' });
      steps.push('Pop-up crash Windows dan restart otomatis update dinonaktifkan.');

      // 7. Autostart the client
      writeRegValue(RUN_KEY, 'GCHubClient', { type: 'REG_SZ', data: `"${process.execPath}" --mode=client` });
      steps.push('Autostart Kiosk GC-Hub Client didaftarkan ke Windows Run registry.');

      // 8. gc-agent LocalSystem service (machine-wide kiosk policy)
      try {
        const agentExe = this.agentExePath();
        if (fs.existsSync(agentExe)) {
          run(agentExe, ['install']);
          steps.push('Service gc-agent (LocalSystem) dipasang untuk policy level sistem.');
        } else {
          steps.push('Lewati gc-agent: bin/gc-agent.exe tidak ditemukan (jalankan npm run build:agent).');
        }
      } catch (e: any) {
        steps.push(`Peringatan: gc-agent gagal dipasang (${e?.stderr || e?.message || e}).`);
      }

      this.writeSnapshot(snapshot);

      return {
        success: true,
        message: 'Konfigurasi PC Klien Warnet berhasil diterapkan 100%. Silakan restart PC untuk mulai.',
        steps
      };
    } catch (err: any) {
      console.error('[PROVISIONER] Provisioning error:', err);
      return {
        success: false,
        message: `Gagal mengonfigurasi PC klien: ${err?.stderr || err?.message || err}`,
        steps
      };
    }
  }

  /**
   * Revert / Rollback: Restores Windows to its exact original state before GC-Hub provisioning
   */
  public static async revertClient(): Promise<{ success: boolean; message: string; steps: string[] }> {
    const steps: string[] = [];

    let snapshot: ProvisionSnapshot | null;
    try {
      snapshot = this.readSnapshot();
    } catch (e: any) {
      return { success: false, message: `Gagal membaca file snapshot: ${e?.message || e}`, steps };
    }
    if (!snapshot) {
      return { success: false, message: 'Snapshot konfigurasi awal tidak ditemukan. Sistem belum pernah di-provision.', steps };
    }

    const removeSnapshots = () => {
      for (const p of [this.snapshotPath(), this.legacySnapshotPath()]) {
        if (p) fs.rmSync(p, { force: true });
      }
    };

    if (process.platform !== 'win32') {
      removeSnapshots();
      return {
        success: true,
        message: '[Preview] Konfigurasi Windows berhasil dikembalikan ke state awal sebelum GC-Hub.',
        steps: [
          'User "GC Net" dihapus',
          'Winlogon AutoAdminLogon di-restore ke Administrator awal',
          'Aturan Firewall GC-Hub dicabut',
          'Snapshot dibersihkan'
        ]
      };
    }

    // 0. gc-agent first: its uninstall lifts the HKLM policy and AppLocker, which bind every account
    //    including administrators. If that fails, stop here: the rest would only remove the booth
    //    account and leave the PC locked with no kiosk to switch off.
    const bundledAgent = this.agentExePath();
    const installedAgent = path.join(this.installedAgentDir(), 'gc-agent.exe');
    const agentExe = [bundledAgent, installedAgent].find(p => fs.existsSync(p));
    if (agentExe) {
      try {
        run(agentExe, ['uninstall']);
      } catch (e: any) {
        return {
          success: false,
          message: `gc-agent gagal dicabut, revert dihentikan supaya policy kiosk tidak tertinggal: ${e?.stderr || e?.message || e}`,
          steps
        };
      }
      // Uninstall cannot delete its own running exe when it ran from the installed copy
      fs.rmSync(this.installedAgentDir(), { recursive: true, force: true });
      steps.push('Service gc-agent dicabut, policy kiosk dan allowlist exe dibersihkan.');
    } else {
      steps.push('gc-agent tidak terpasang, lewati.');
    }

    const warnings: string[] = [];
    const userName = snapshot.createdUserName || this.STANDARD_USERNAME;
    // A second revert after a partial one finds the account already gone; nothing left to undo then
    const userPresent = this.userExists(userName);

    // 1. Game folder grants, while the account still exists so icacls can resolve the name
    for (const dir of userPresent ? snapshot.gameDirectories || [] : []) {
      if (!fs.existsSync(dir)) continue;
      try {
        run('icacls', [dir, '/remove:g', userName, '/T', '/C', '/Q']);
        steps.push(`Izin "${userName}" di ${dir} dicabut.`);
      } catch {
        warnings.push(`izin folder ${dir}`);
      }
    }

    // 2. Booth account, unless it was there before GC Hub
    if (snapshot.userPreexisted) {
      steps.push(`Akun "${userName}" sudah ada sebelum setup, tidak dihapus.`);
    } else if (userPresent) {
      try {
        run('net', ['user', userName, '/delete']);
        steps.push(`Akun "${userName}" dihapus.`);
      } catch {
        warnings.push(`akun ${userName}`);
      }
    }

    // 3. Every registry value back to its original, including deleting the ones that did not exist
    for (const [id, original] of Object.entries(snapshotRegistry(snapshot))) {
      const sep = id.lastIndexOf('|');
      const key = id.slice(0, sep);
      const name = id.slice(sep + 1);
      try {
        writeRegValue(key, name, original);
      } catch {
        warnings.push(`registry ${name}`);
      }
    }
    steps.push('Registry Winlogon, Error Reporting, Windows Update, dan autostart dipulihkan ke nilai awal.');

    // 4. Firewall rules
    for (const ruleName of snapshot.firewallRulesAdded || []) {
      try {
        run('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${ruleName}`]);
      } catch {} // already gone
    }
    steps.push('Aturan firewall GC-Hub LAN dicabut.');

    if (warnings.length) {
      // Keep the snapshot so the operator can run revert again for what is left
      return {
        success: false,
        message: `Revert belum tuntas, gagal memulihkan: ${warnings.join(', ')}. Jalankan revert lagi sebagai administrator.`,
        steps
      };
    }

    removeSnapshots();
    steps.push('Snapshot provisioning dibersihkan.');
    return {
      success: true,
      message: 'Konfigurasi Windows berhasil dikembalikan ke state awal semula 100%.',
      steps
    };
  }
}
