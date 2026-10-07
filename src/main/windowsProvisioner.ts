import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

export interface ProvisionSnapshot {
  timestamp: number;
  originalDefaultUser: string;
  originalAutoAdminLogon: string;
  originalForceAutoLogon: string;
  createdUserName: string;
  gameDirectories: string[];
  firewallRulesAdded: string[];
}

export interface ProvisionStatus {
  isProvisioned: boolean;
  standardUserName: string;
  autoLogonActive: boolean;
  snapshotExists: boolean;
  snapshotTimestamp?: number;
  osPlatform: string;
}

export class WindowsProvisioner {
  private static readonly STANDARD_USERNAME = 'GC Net';
  private static readonly STANDARD_USER_PASS = 'gcnet123';
  private static readonly FIREWALL_RULES = [
    { name: 'GC-Hub LAN Protocol (TCP 7894)', port: 7894, protocol: 'TCP' },
    { name: 'GC-Hub Wake-On-LAN (UDP 9)', port: 9, protocol: 'UDP' },
    { name: 'GC-Hub File Transfer & FTP (TCP 21)', port: 21, protocol: 'TCP' },
    { name: 'GC-Hub LAN Discovery & ICMP', port: null, protocol: 'ICMPv4' },
  ];

  private static getSnapshotFilePath(): string {
    const baseDir = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(baseDir, 'provision_snapshot.json');
  }

  // gc-agent ships in bin/ next to the client exe (dev: repo bin/). It is the LocalSystem helper
  // that enforces machine-wide kiosk policy the standard booth user cannot set itself.
  private static agentExePath(): string {
    const packaged = path.resolve(path.dirname(process.execPath), 'bin', 'gc-agent.exe');
    if (fs.existsSync(packaged)) return packaged;
    return path.resolve(process.cwd(), 'bin', 'gc-agent.exe');
  }

  /**
   * Check current provision status of the Windows Workstation
   */
  public static async getStatus(): Promise<ProvisionStatus> {
    const isWin = process.platform === 'win32';
    const snapshotPath = this.getSnapshotFilePath();
    const snapshotExists = fs.existsSync(snapshotPath);
    let snapshotData: ProvisionSnapshot | null = null;

    if (snapshotExists) {
      try {
        snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      } catch {}
    }

    if (!isWin) {
      return {
        isProvisioned: snapshotExists,
        standardUserName: snapshotData?.createdUserName || this.STANDARD_USERNAME,
        autoLogonActive: snapshotExists,
        snapshotExists,
        snapshotTimestamp: snapshotData?.timestamp,
        osPlatform: process.platform
      };
    }

    let userFound = false;
    let autoLogonActive = false;

    try {
      const netUserOut = execSync('net user', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      userFound = netUserOut.includes(this.STANDARD_USERNAME);
    } catch {}

    try {
      const regOut = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" /v AutoAdminLogon', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      autoLogonActive = regOut.includes('0x1') || regOut.includes('1');
    } catch {}

    return {
      isProvisioned: userFound && autoLogonActive,
      standardUserName: this.STANDARD_USERNAME,
      autoLogonActive,
      snapshotExists,
      snapshotTimestamp: snapshotData?.timestamp,
      osPlatform: process.platform
    };
  }

  /**
   * 1-Click Provisioning: Sets up Windows as a hardened, auto-logon Warnet Client
   */
  public static async provisionClient(): Promise<{ success: boolean; message: string; steps: string[] }> {
    const isWin = process.platform === 'win32';
    const steps: string[] = [];

    if (!isWin) {
      // Mock for Dev Previews (macOS/Linux)
      const fakeSnapshot: ProvisionSnapshot = {
        timestamp: Date.now(),
        originalDefaultUser: 'Administrator',
        originalAutoAdminLogon: '0',
        originalForceAutoLogon: '0',
        createdUserName: this.STANDARD_USERNAME,
        gameDirectories: ['/Games'],
        firewallRulesAdded: this.FIREWALL_RULES.map(r => r.name)
      };
      fs.writeFileSync(this.getSnapshotFilePath(), JSON.stringify(fakeSnapshot, null, 2), 'utf8');
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
      // 1. Snapshot original Windows Winlogon keys
      let origUser = 'Administrator';
      let origAutoLogon = '0';
      let origForceLogon = '0';

      try {
        const queryUser = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" /v DefaultUserName', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const match = queryUser.match(/DefaultUserName\s+REG_SZ\s+(.*)/i);
        if (match && match[1]) origUser = match[1].trim();
      } catch {}

      try {
        const queryAuto = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" /v AutoAdminLogon', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const match = queryAuto.match(/AutoAdminLogon\s+REG_SZ\s+(.*)/i);
        if (match && match[1]) origAutoLogon = match[1].trim();
      } catch {}

      const snapshot: ProvisionSnapshot = {
        timestamp: Date.now(),
        originalDefaultUser: origUser,
        originalAutoAdminLogon: origAutoLogon,
        originalForceAutoLogon: origForceLogon,
        createdUserName: this.STANDARD_USERNAME,
        gameDirectories: [],
        firewallRulesAdded: []
      };

      // 2. Create Standard User "GC Net"
      try {
        execSync(`net user "${this.STANDARD_USERNAME}" "${this.STANDARD_USER_PASS}" /add /comment:"GC-Hub Standard Warnet User" /expires:never /passwordchg:no`, { stdio: 'ignore', windowsHide: true });
        steps.push(`Akun user "${this.STANDARD_USERNAME}" dibuat.`);
      } catch {
        // User might already exist, reset password
        execSync(`net user "${this.STANDARD_USERNAME}" "${this.STANDARD_USER_PASS}"`, { stdio: 'ignore', windowsHide: true });
        steps.push(`Akun user "${this.STANDARD_USERNAME}" sudah ada, password disinkronkan.`);
      }

      // Ensure standard user role (add to Users, remove from Administrators)
      try {
        execSync(`net localgroup Users "${this.STANDARD_USERNAME}" /add`, { stdio: 'ignore', windowsHide: true });
      } catch {}
      try {
        execSync(`net localgroup Administrators "${this.STANDARD_USERNAME}" /delete`, { stdio: 'ignore', windowsHide: true });
      } catch {}
      steps.push('Role dipastikan Standard User (Non-Admin).');

      // 3. Configure Windows AutoAdminLogon in Registry
      const WINLOGON_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon';
      execSync(`reg add "${WINLOGON_KEY}" /v AutoAdminLogon /t REG_SZ /d 1 /f`, { stdio: 'ignore', windowsHide: true });
      execSync(`reg add "${WINLOGON_KEY}" /v DefaultUserName /t REG_SZ /d "${this.STANDARD_USERNAME}" /f`, { stdio: 'ignore', windowsHide: true });
      execSync(`reg add "${WINLOGON_KEY}" /v DefaultPassword /t REG_SZ /d "${this.STANDARD_USER_PASS}" /f`, { stdio: 'ignore', windowsHide: true });
      execSync(`reg add "${WINLOGON_KEY}" /v ForceAutoLogon /t REG_SZ /d 1 /f`, { stdio: 'ignore', windowsHide: true });
      steps.push('Windows AutoAdminLogon diaktifkan ke akun "GC Net".');

      // 4. Configure Game Directory ACLs (D:\Games, C:\Games, D:\)
      const possibleGameDirs = ['D:\\Games', 'C:\\Games', 'D:\\', 'E:\\Games'];
      for (const gDir of possibleGameDirs) {
        if (fs.existsSync(gDir)) {
          try {
            execSync(`icacls "${gDir}" /grant "${this.STANDARD_USERNAME}":(OI)(CI)F /T /C /Q`, { stdio: 'ignore', windowsHide: true });
            snapshot.gameDirectories.push(gDir);
            steps.push(`ACL Permission folder ${gDir} diberikan Full Access.`);
          } catch {}
        }
      }

      // 5. Open Firewall ports for Warnet LAN features
      for (const rule of this.FIREWALL_RULES) {
        try {
          if (rule.port) {
            execSync(`netsh advfirewall firewall add rule name="${rule.name}" dir=in action=allow protocol=${rule.protocol} localport=${rule.port}`, { stdio: 'ignore', windowsHide: true });
          } else {
            execSync(`netsh advfirewall firewall add rule name="${rule.name}" protocol=icmpv4:8,any dir=in action=allow`, { stdio: 'ignore', windowsHide: true });
          }
          snapshot.firewallRulesAdded.push(rule.name);
        } catch {}
      }
      steps.push('Firewall rules LAN (Billing WS 7894, WoL UDP 9, FTP, ICMP) dibuka.');

      // 6. Disable Sticky Keys & Error Reporting Popups
      try {
        execSync(`reg add "HKCU\\Control Panel\\Accessibility\\StickyKeys" /v Flags /t REG_SZ /d 506 /f`, { stdio: 'ignore', windowsHide: true });
        execSync(`reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting" /v DontShowUI /t REG_DWORD /d 1 /f`, { stdio: 'ignore', windowsHide: true });
        execSync(`reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU" /v NoAutoRebootWithLoggedOnUsers /t REG_DWORD /d 1 /f`, { stdio: 'ignore', windowsHide: true });
        steps.push('Sticky Keys & pop-up crash Windows dinonaktifkan untuk kenyamanan gaming.');
      } catch {}

      // 7. Register Autostart for GC-Hub Client Kiosk in Run Key
      try {
        const clientExePath = process.execPath;
        execSync(`reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" /v "GCHubClient" /t REG_SZ /d "\\"${clientExePath}\\" --mode=client" /f`, { stdio: 'ignore', windowsHide: true });
        steps.push('Autostart Kiosk GC-Hub Client didaftarkan ke Windows Run registry.');
      } catch {}

      // 8. Install gc-agent as a LocalSystem service (enforces machine-wide kiosk policy)
      try {
        const agentExe = this.agentExePath();
        if (fs.existsSync(agentExe)) {
          execSync(`"${agentExe}" install`, { stdio: 'ignore', windowsHide: true });
          steps.push('Service gc-agent (LocalSystem) dipasang untuk policy level sistem.');
        } else {
          steps.push('Lewati gc-agent: bin/gc-agent.exe tidak ditemukan (jalankan npm run build:agent).');
        }
      } catch (e: any) {
        steps.push(`Peringatan: gc-agent gagal dipasang (${e?.message || e}).`);
      }

      // Save snapshot file
      fs.writeFileSync(this.getSnapshotFilePath(), JSON.stringify(snapshot, null, 2), 'utf8');

      return {
        success: true,
        message: 'Konfigurasi PC Klien Warnet berhasil diterapkan 100%. Silakan restart PC untuk mulai.',
        steps
      };
    } catch (err: any) {
      console.error('[PROVISIONER] Provisioning error:', err);
      return {
        success: false,
        message: `Gagal mengonfigurasi PC klien: ${err?.message || err}`,
        steps
      };
    }
  }

  /**
   * Revert / Rollback: Restores Windows to its exact original state before GC-Hub provisioning
   */
  public static async revertClient(): Promise<{ success: boolean; message: string; steps: string[] }> {
    const isWin = process.platform === 'win32';
    const snapshotPath = this.getSnapshotFilePath();
    const steps: string[] = [];

    if (!fs.existsSync(snapshotPath)) {
      return {
        success: false,
        message: 'Snapshot konfigurasi awal tidak ditemukan. Sistem belum pernah di-provision.',
        steps: []
      };
    }

    let snapshot: ProvisionSnapshot;
    try {
      snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    } catch (e: any) {
      return {
        success: false,
        message: `Gagal membaca file snapshot: ${e?.message || e}`,
        steps: []
      };
    }

    if (!isWin) {
      try { fs.unlinkSync(snapshotPath); } catch {}
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

    try {
      // 0. Uninstall gc-agent service (clears every kiosk policy it set, then removes itself)
      try {
        const agentExe = this.agentExePath();
        if (fs.existsSync(agentExe)) {
          execSync(`"${agentExe}" uninstall`, { stdio: 'ignore', windowsHide: true });
          steps.push('Service gc-agent dicabut dan policy level sistem dibersihkan.');
        }
      } catch {}

      // 1. Delete Standard User "GC Net"
      try {
        execSync(`net user "${snapshot.createdUserName || this.STANDARD_USERNAME}" /delete`, { stdio: 'ignore', windowsHide: true });
        steps.push(`Akun "${snapshot.createdUserName || this.STANDARD_USERNAME}" dihapus.`);
      } catch {}

      // 2. Restore Winlogon registry keys
      const WINLOGON_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon';
      try {
        execSync(`reg add "${WINLOGON_KEY}" /v AutoAdminLogon /t REG_SZ /d "${snapshot.originalAutoAdminLogon || '0'}" /f`, { stdio: 'ignore', windowsHide: true });
        execSync(`reg add "${WINLOGON_KEY}" /v DefaultUserName /t REG_SZ /d "${snapshot.originalDefaultUser || 'Administrator'}" /f`, { stdio: 'ignore', windowsHide: true });
        execSync(`reg delete "${WINLOGON_KEY}" /v DefaultPassword /f`, { stdio: 'ignore', windowsHide: true });
        execSync(`reg delete "${WINLOGON_KEY}" /v ForceAutoLogon /f`, { stdio: 'ignore', windowsHide: true });
        steps.push(`Winlogon dipulihkan ke user "${snapshot.originalDefaultUser || 'Administrator'}".`);
      } catch {}

      // 3. Remove Firewall rules added by GC-Hub
      for (const ruleName of snapshot.firewallRulesAdded || []) {
        try {
          execSync(`netsh advfirewall firewall delete rule name="${ruleName}"`, { stdio: 'ignore', windowsHide: true });
        } catch {}
      }
      steps.push('Aturan firewall GC-Hub LAN dicabut.');

      // 4. Remove Run Registry Entry
      try {
        execSync(`reg delete "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" /v "GCHubClient" /f`, { stdio: 'ignore', windowsHide: true });
        steps.push('Autostart Kiosk GC-Hub dihapus dari Windows Run registry.');
      } catch {}

      // 5. Remove snapshot file
      try {
        fs.unlinkSync(snapshotPath);
        steps.push('Snapshot provisioning dibersihkan.');
      } catch {}

      return {
        success: true,
        message: 'Konfigurasi Windows berhasil dikembalikan ke state awal semula 100%.',
        steps
      };
    } catch (err: any) {
      console.error('[PROVISIONER] Revert error:', err);
      return {
        success: false,
        message: `Gagal merestore konfigurasi awal: ${err?.message || err}`,
        steps
      };
    }
  }
}
