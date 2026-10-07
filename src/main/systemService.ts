import { exec, execFile } from 'child_process';
import dgram from 'dgram';
import { RemoteProcessItem } from '../shared/protocol';
import { SecurityManager } from './security';
import { osEffectsDisabled } from './cleanup';
import { AgentClient } from './agentClient';

/**
 * SystemService: Handles native Windows OS operations (Process Guard, Process Scan, Kill, Registry, WOL)
 * Runs safely in Electron Main process with full Node.js child_process capabilities.
 */
export class SystemService {
  private static readonly SYSTEM_PROCESS_BLACKLIST = new Set([
    'system',
    'system idle process',
    'registry',
    'smss',
    'csrss',
    'wininit',
    'services',
    'lsass',
    'winlogon',
    'fontdrvhost',
    'dwm',
    'memory compression',
    'spoolsv',
    'svchost',
    'sihost',
    'taskhostw',
    'explorer',
    'shellexperiencehost',
    'searchhost',
    'startmenuexperiencehost',
    'textinputhost',
    'ctfmon',
    'securityhealthservice',
    'securityhealthsystray',
    'mpcmdrun',
    'msmpeng',
    'nissrv',
    'applicationframehost',
    'audiodg',
    'dllhost',
    'smartscreen',
    'wmiapsrv',
    'wmiprvse'
  ]);

  private static readonly BILLING_CRUCIAL_BLACKLIST = new Set([
    'electron',
    'gc-hub',
    'gc-hub.exe',
    'node',
    'gchub',
    'prochook',
    'prochost',
    'systemhook',
    'code',
    'antigravity'
  ]);

  // Never invent processes: a made-up PID sent to killProcess would hit whatever really owns it.
  // One retry covers a scan that raced a process starting or exiting; a second failure is reported.
  public static async getRunningProcesses(includeSystem: boolean = false): Promise<RemoteProcessItem[]> {
    try {
      return await this.scanProcesses(includeSystem);
    } catch {
      return this.scanProcesses(includeSystem);
    }
  }

  private static scanProcesses(includeSystem: boolean): Promise<RemoteProcessItem[]> {
    return new Promise((resolve, reject) => {
      const psFilter = includeSystem
        ? "Get-Process | Select-Object Id, ProcessName, MainWindowTitle, WorkingSet64, Responding | ConvertTo-Json -Compress"
        : "Get-Process | Where-Object { $_.MainWindowTitle -ne '' -or $_.Name -match 'chrome|msedge|firefox|brave|opera|discord|spotify|steam|riot|valorant|pointblank|dota2|cs2|roblox|genshin|epicgames' } | Select-Object Id, ProcessName, MainWindowTitle, WorkingSet64, Responding | ConvertTo-Json -Compress";

      // UTF-8 output: the default OEM code page mangles non-ASCII window titles
      const psCommand = `powershell -NoProfile -Command "[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${psFilter}"`;

      exec(psCommand, { windowsHide: true }, (err, stdout) => {
        if (err) {
          reject(new Error('Daftar aplikasi gagal dibaca dari Windows.'));
          return;
        }
        if (!stdout.trim()) {
          resolve([]);
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          const rawItems = Array.isArray(parsed) ? parsed : [parsed];
          const filteredList: RemoteProcessItem[] = [];

          for (const item of rawItems) {
            if (!item || !item.ProcessName) continue;
            const procName = String(item.ProcessName).toLowerCase().replace(/\.exe$/, '');
            const isBilling = this.BILLING_CRUCIAL_BLACKLIST.has(procName);
            const isSystemProc = this.SYSTEM_PROCESS_BLACKLIST.has(procName);

            if (!includeSystem) {
              if (isSystemProc || isBilling) continue;
            }

            const winTitle = item.MainWindowTitle ? String(item.MainWindowTitle).trim() : '';
            const memBytes = Number(item.WorkingSet64) || 0;
            const memMb = Math.round(memBytes / (1024 * 1024));

            let formattedName = item.ProcessName + '.exe';
            let formattedTitle = winTitle || this.getFriendlyName(procName);

            // Clean up generic Electron / Node processes to clear GC-Hub branding
            if (procName === 'electron' || procName === 'node' || procName === 'gc-hub') {
              formattedName = 'GC-Hub.exe';
              formattedTitle = winTitle || 'GC-Hub Billing & Cyber Cafe System';
            }

            const category = this.categorizeProcess(procName, formattedTitle, isSystemProc, isBilling);

            filteredList.push({
              pid: Number(item.Id) || 0,
              name: formattedName,
              windowTitle: formattedTitle,
              category,
              memoryMb: Math.max(1, memMb),
              status: item.Responding === false ? 'not_responding' : 'running',
              isProtected: isBilling || (includeSystem && isSystemProc)
            });
          }

          filteredList.sort((a, b) => {
            const catOrder: Record<string, number> = { game: 1, browser: 2, app: 3, other: 4, background: 5, system: 6 };
            const orderDiff = (catOrder[a.category] || 4) - (catOrder[b.category] || 4);
            if (orderDiff !== 0) return orderDiff;
            return b.memoryMb - a.memoryMb;
          });

          resolve(filteredList);
        } catch (parseErr: any) {
          console.warn('[SYSTEM] Output daftar proses tidak bisa dibaca:', parseErr?.message, JSON.stringify(stdout.slice(0, 200)));
          reject(new Error('Daftar aplikasi dari Windows tidak bisa dibaca.'));
        }
      });
    });
  }

  public static async killProcess(
    pid: number,
    processName: string,
    isClientRequest: boolean = false
  ): Promise<{ success: boolean; message: string }> {
    // Input datang dari jaringan / renderer: tolak apa pun selain PID angka dan nama file exe polos
    if (!Number.isInteger(pid) || pid <= 4 || pid === process.pid) {
      return { success: false, message: `PID tidak valid: ${pid}` };
    }
    const safeName = /^[\w .()+-]{1,64}(\.exe)?$/i.test(processName || '') ? processName : '';
    const cleanName = safeName.toLowerCase().replace(/\.exe$/, '');

    if (isClientRequest) {
      if (this.BILLING_CRUCIAL_BLACKLIST.has(cleanName) || this.SYSTEM_PROCESS_BLACKLIST.has(cleanName)) {
        return {
          success: false,
          message: `Akses ditolak: Proses ${processName} diproteksi oleh sistem keamanan GC-Hub.`
        };
      }
    }

    if (cleanName.startsWith('gc-hub') || cleanName === 'electron') {
      return {
        success: false,
        message: `Proses ${processName} adalah Core Launcher GC-Hub dan tidak dapat dimatikan via Task Manager.`
      };
    }

    if (osEffectsDisabled(`taskkill PID ${pid}`)) {
      return { success: true, message: `Proses ${processName} (PID ${pid}) dimatikan (mode tes).` };
    }

    // Prefer the SYSTEM agent: it can end an app the booth user launched elevated, which
    // user-level taskkill cannot. Fall back to taskkill when the agent is absent or refuses.
    if (process.platform === 'win32') {
      try {
        await AgentClient.killProcess(pid, safeName || processName);
        return { success: true, message: `Proses ${processName} (PID ${pid}) berhasil dihentikan.` };
      } catch {
        // agent not installed (dev / unprovisioned) or refused; fall through to taskkill
      }
    }
    return new Promise((resolve) => {
      execFile('taskkill', ['/F', '/PID', String(pid), '/T'], { windowsHide: true }, (err) => {
        if (err && !safeName) {
          resolve({ success: false, message: `Gagal mematikan proses PID ${pid}.` });
        } else if (err) {
          execFile('taskkill', ['/F', '/IM', safeName, '/T'], { windowsHide: true }, (imErr) => {
            if (imErr) {
              resolve({
                success: false,
                message: `Gagal mematikan proses ${processName} (PID ${pid}).`
              });
            } else {
              resolve({
                success: true,
                message: `Proses ${processName} berhasil dimatikan.`
              });
            }
          });
        } else {
          resolve({
            success: true,
            message: `Proses ${processName} (PID ${pid}) berhasil dihentikan.`
          });
        }
      });
    });
  }

  public static applySecurityPolicies(enable: boolean): void {
    SecurityManager.applyWindowsRegistryPolicies(enable);
  }

  public static sendWakeOnLan(mac: string, ip: string = '255.255.255.255'): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      try {
        const cleanMac = mac.replace(/[:-]/g, '');
        if (cleanMac.length !== 12) {
          resolve({ success: false, message: `Format MAC Address ${mac} tidak valid.` });
          return;
        }
        // Placeholder of a PC whose client never connected: a packet to it wakes nothing
        if (/^0{12}$/.test(cleanMac)) {
          resolve({ success: false, message: 'MAC PC ini belum diketahui. Nyalakan client di PC itu sekali agar MAC tercatat.' });
          return;
        }

        const macBytes = Buffer.from(cleanMac, 'hex');
        const magicPacket = Buffer.alloc(102);
        magicPacket.fill(0xff, 0, 6);
        for (let i = 0; i < 16; i++) {
          macBytes.copy(magicPacket, 6 + i * 6);
        }

        const socket = dgram.createSocket('udp4');
        socket.once('listening', () => {
          socket.setBroadcast(true);
        });

        socket.send(magicPacket, 0, magicPacket.length, 9, ip || '255.255.255.255', (err) => {
          socket.close();
          if (err) {
            resolve({ success: false, message: `Gagal mengirim paket WOL: ${err.message}` });
          } else {
            resolve({ success: true, message: `Sinyal Wake-on-LAN berhasil dikirim ke ${mac}.` });
          }
        });
      } catch (e: any) {
        resolve({ success: false, message: `Error WOL: ${e.message}` });
      }
    });
  }

  private static categorizeProcess(
    name: string,
    title: string,
    isSystem: boolean,
    isBilling: boolean
  ): 'game' | 'browser' | 'app' | 'background' | 'system' | 'other' {
    if (isBilling || isSystem) return 'system';
    const text = (name + ' ' + title).toLowerCase();

    if (/valorant|pointblank|point_blank|pb|dota2|cs2|csgo|roblox|genshin|riotclient|league|gta|minecraft|steam|epicgames|crossfire|lostsaga|pubg|overwatch|fifa|fc24|ldplayer|bluestacks|nox/i.test(text)) {
      return 'game';
    }
    if (/chrome|msedge|firefox|brave|opera|vivaldi|browser/i.test(text)) {
      return 'browser';
    }
    if (/discord|spotify|vlc|winrar|notepad|word|excel|powerpnt|telegram|whatsapp|zoom|obs64/i.test(text)) {
      return 'app';
    }
    if (!title) {
      return 'background';
    }
    return 'other';
  }

  private static getFriendlyName(name: string): string {
    const map: Record<string, string> = {
      // GC-Hub Core
      'electron': 'GC-Hub Billing & Cyber Cafe System',
      'node': 'GC-Hub Background Service Engine',
      'gc-hub': 'GC-Hub Billing Client',
      'gchub': 'GC-Hub Client Locker',

      // Games & Game Launchers
      'pointblank': 'Point Blank Beyond Limits',
      'valorant': 'VALORANT (Riot Games)',
      'valorant-win64-shipping': 'VALORANT Game Engine',
      'robloxplayerbeta': 'Roblox Game Client',
      'roblox': 'Roblox Game Client',
      'dota2': 'Dota 2 (Valve)',
      'cs2': 'Counter-Strike 2',
      'csgo': 'Counter-Strike: Global Offensive',
      'steam': 'Steam Client Bootstrapper',
      'steamservice': 'Steam Client Service',
      'steamwebhelper': 'Steam Web Helper',
      'riotclientservices': 'Riot Client Services',
      'riotclient': 'Riot Client',
      'epicgameslauncher': 'Epic Games Launcher',
      'genshinimpact': 'Genshin Impact',
      'honkaistarrail': 'Honkai: Star Rail',
      'gta5': 'Grand Theft Auto V',
      'playgta5': 'Grand Theft Auto V Launcher',
      'minecraft': 'Minecraft Launcher',
      'javaw': 'Minecraft Java Edition',
      'crossfire': 'CrossFire Next Generation',
      'lostsaga': 'Lost Saga Origin',
      'tslgame': 'PUBG: BATTLEGROUNDS',
      'dnplayer': 'LDPlayer Android Emulator',
      'hd-player': 'BlueStacks Android Emulator',
      'nox': 'NoxPlayer Android Emulator',
      'eaconnect_server': 'EA Games Service',
      'origin': 'EA Origin Client',
      'battlenet': 'Battle.net Client',
      'garena': 'Garena PC Client',

      // Browsers
      'chrome': 'Google Chrome Browser',
      'msedge': 'Microsoft Edge Browser',
      'firefox': 'Mozilla Firefox Browser',
      'brave': 'Brave Privacy Browser',
      'opera': 'Opera Browser',
      'operagx': 'Opera GX Gaming Browser',
      'vivaldi': 'Vivaldi Browser',

      // Communication & Media Apps
      'discord': 'Discord Voice & Community Chat',
      'spotify': 'Spotify Music Player',
      'vlc': 'VLC Media Player',
      'telegram': 'Telegram Desktop',
      'whatsapp': 'WhatsApp Desktop',
      'zoom': 'Zoom Workplace Meeting',
      'obs64': 'OBS Studio (Screen Recorder / Streamer)',
      'obs32': 'OBS Studio (32-bit)',

      // Windows System & Utilities
      'svchost': 'Host Process for Windows Services',
      'explorer': 'Windows Explorer (Shell & Desktop)',
      'dwm': 'Desktop Window Manager (DWM)',
      'services': 'Service Control Manager',
      'csrss': 'Client Server Runtime Process',
      'taskhostw': 'Host Process for Windows Tasks',
      'sihost': 'Shell Infrastructure Host',
      'fontdrvhost': 'Usermode Font Driver Host',
      'spoolsv': 'Print Spooler Service',
      'audiodg': 'Windows Audio Device Graph Isolation',
      'audiosrv': 'Windows Audio Service',
      'conhost': 'Console Window Host',
      'cmd': 'Windows Command Prompt',
      'powershell': 'Windows PowerShell',
      'pwsh': 'PowerShell Core',
      'regedit': 'Registry Editor',
      'taskmgr': 'Windows Task Manager',
      'winrar': 'WinRAR Archiver',
      '7zfm': '7-Zip File Manager',
      'notepad': 'Windows Notepad',
      'antigravity': 'Google Antigravity IDE'
    };
    return map[name] || name.toUpperCase();
  }

  /**
   * Capture desktop screen screenshot as base64 JPEG data URL using Electron desktopCapturer
   */
  public static async captureDesktopScreen(width: number = 1280, height: number = 720): Promise<string | null> {
    try {
      let electron: any = null;
      try {
        electron = require('electron');
      } catch {}
      if (!electron) {
        try {
          electron = await import('electron');
        } catch {}
      }

      if (electron && electron.desktopCapturer && (!electron.app || electron.app.isReady())) {
        const sources: any[] = await electron.desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width, height }
        });
        if (sources && sources.length > 0) {
          const screenSource = sources.find((s: any) => s.id.startsWith('screen:')) || sources[0];
          const jpegBuffer = screenSource.thumbnail.toJPEG(70);
          return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
        }
      }
    } catch (err) {
      console.warn('[SYSTEM SERVICE] Desktop capture error:', err);
    }
    return 'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="%230d1017"/><text x="320" y="180" fill="%2376b900" font-family="sans-serif" font-size="20" text-anchor="middle" font-weight="bold">GC-Hub Live Workstation Preview</text></svg>';
  }

  /**
   * Execute Native OS Shutdown
   */
  public static async executeShutdown(force: boolean = true): Promise<{ success: boolean; message: string }> {
    if (osEffectsDisabled('shutdown')) return { success: true, message: 'Workstation sedang dimatikan... (mode tes)' };
    return new Promise((resolve) => {
      const cmd = force ? 'shutdown /s /f /t 0' : 'shutdown /s /t 10';
      exec(cmd, { windowsHide: true }, (err) => {
        if (err) {
          resolve({ success: false, message: `Gagal mematikan workstation: ${err.message}` });
        } else {
          resolve({ success: true, message: 'Workstation sedang dimatikan...' });
        }
      });
    });
  }

  /**
   * Execute Native OS Restart / Reboot
   */
  public static async executeRestart(force: boolean = true): Promise<{ success: boolean; message: string }> {
    if (osEffectsDisabled('restart')) return { success: true, message: 'Workstation sedang di-restart... (mode tes)' };
    return new Promise((resolve) => {
      const cmd = force ? 'shutdown /r /f /t 0' : 'shutdown /r /t 10';
      exec(cmd, { windowsHide: true }, (err) => {
        if (err) {
          resolve({ success: false, message: `Gagal me-restart workstation: ${err.message}` });
        } else {
          resolve({ success: true, message: 'Workstation sedang di-restart...' });
        }
      });
    });
  }

  /**
   * Set Master Windows Audio Volume
   */
  public static async setSystemVolume(volumePercent: number, isMuted: boolean = false): Promise<{ success: boolean; message: string }> {
    if (osEffectsDisabled(`volume ${volumePercent}%`)) return { success: true, message: `Volume sistem disesuaikan ke ${isMuted ? 'Mute' : `${volumePercent}%`} (mode tes)` };
    return new Promise((resolve) => {
      try {
        const clampedVol = Math.max(0, Math.min(100, Math.round(Number(volumePercent) || 0)));
        const psCmd = isMuted
          ? `$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]173)`
          : `
            $wsh = New-Object -ComObject WScript.Shell
            1..50 | ForEach-Object { $wsh.SendKeys([char]174) }
            1..${Math.round(clampedVol / 2)} | ForEach-Object { $wsh.SendKeys([char]175) }
          `;
        exec(`powershell -NoProfile -Command "${psCmd.replace(/\n/g, ' ')}"`, { windowsHide: true, timeout: 2500 }, () => {
          resolve({
            success: true,
            message: `Volume sistem disesuaikan ke ${isMuted ? 'Mute' : `${clampedVol}%`}`
          });
        });
      } catch (e: any) {
        resolve({ success: false, message: e.message });
      }
    });
  }
}
