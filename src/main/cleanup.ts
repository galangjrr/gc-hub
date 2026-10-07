import { exec } from 'child_process';

// Test runs (scripts/run-electron-test.mjs) set this so killing apps, powering off and changing
// the volume are only logged: those tests run on the developer's own PC.
export function osEffectsDisabled(action: string): boolean {
  if (process.env.GCHUB_NO_OS_EFFECTS !== '1') return false;
  console.log(`[OS EFFECTS OFF] Lewati: ${action}`);
  return true;
}

function getElectronSession() {
  try {
    const electron = require('electron');
    return electron?.session || null;
  } catch {
    return null;
  }
}

function getElectronApp() {
  try {
    const electron = require('electron');
    return electron?.app || null;
  } catch {
    return null;
  }
}

/**
 * SessionCleanupService: Handles complete session termination cleanup & privacy wipe
 * - Kills all active user processes, game launchers, browsers, and voice clients.
 * - Wipes Electron browser cache, cookies, localStorage, and credentials.
 * - Resets Windows master volume to standard 50% level.
 */
export class SessionCleanupService {
  private static readonly USER_APPS_TO_TERMINATE = [
    // Web Browsers
    'chrome.exe',
    'msedge.exe',
    'firefox.exe',
    'brave.exe',
    'opera.exe',
    'operagx.exe',
    'vivaldi.exe',

    // Game Launchers & Platforms
    'steam.exe',
    'steamwebhelper.exe',
    'steamservice.exe',
    'epicgameslauncher.exe',
    'riotclientservices.exe',
    'riotclient.exe',
    'origin.exe',
    'eaconnect_server.exe',
    'battlenet.exe',
    'garena.exe',

    // Popular Cybercafe Games
    'valorant.exe',
    'valorant-win64-shipping.exe',
    'pointblank.exe',
    'dota2.exe',
    'cs2.exe',
    'csgo.exe',
    'robloxplayerbeta.exe',
    'roblox.exe',
    'genshinimpact.exe',
    'honkaistarrail.exe',
    'gta5.exe',
    'playgta5.exe',
    'minecraft.exe',
    'javaw.exe',
    'crossfire.exe',
    'lostsaga.exe',
    'tslgame.exe',
    'dnplayer.exe',
    'hd-player.exe',
    'nox.exe',

    // Social, Chat & Streaming
    'discord.exe',
    'spotify.exe',
    'telegram.exe',
    'whatsapp.exe',
    'zoom.exe',
    'obs64.exe',
    'obs32.exe',
    'vlc.exe'
  ];

  /**
   * Execute full privacy wipe and session reset
   */
  public static async executeSessionCleanup(): Promise<{ success: boolean; message: string }> {
    console.log('[CLEANUP SERVICE] Starting session cleanup & privacy wipe...');

    try {
      // 1. Terminate all user applications and games
      await this.killUserProcesses();

      // 2. Wipe Electron storage, cookies, and cache
      await this.wipeStorageAndCache();

      // 3. Reset Windows master audio volume to 50%
      await this.resetAudioVolume(50);

      console.log('[CLEANUP SERVICE] Session cleanup successfully completed.');
      return {
        success: true,
        message: 'Semua proses pengguna telah dimatikan, storage dibersihkan, dan volume di-reset ke 50%.'
      };
    } catch (err: any) {
      console.error('[CLEANUP SERVICE] Error during session cleanup:', err);
      return {
        success: false,
        message: `Pembersihan sesi sebagian gagal: ${err.message || err}`
      };
    }
  }

  /**
   * Kill user processes via taskkill
   */
  public static async killUserProcesses(): Promise<void> {
    if (osEffectsDisabled('taskkill aplikasi pengguna')) return;
    return new Promise((resolve) => {
      let isDone = false;
      const done = () => {
        if (!isDone) {
          isDone = true;
          resolve();
        }
      };

      const procs = this.USER_APPS_TO_TERMINATE.join(' /IM ');
      const cmd = `taskkill /F /IM ${procs} /T`;

      exec(cmd, { windowsHide: true }, () => {
        done();
      });

      setTimeout(done, 2500);
    });
  }

  /**
   * Clear all storage, cookies, and cache data in Electron
   */
  public static async wipeStorageAndCache(): Promise<void> {
    const app = getElectronApp();
    if (app && !app.isReady()) {
      return;
    }

    const sess = getElectronSession();
    if (!sess || !sess.defaultSession) return;

    try {
      await sess.defaultSession.clearStorageData({
        storages: [
          'appcache',
          'cookies',
          'filesystem',
          'indexdb',
          'localstorage',
          'shadercache',
          'websql',
          'serviceworkers',
          'cachestorage'
        ]
      });
      await sess.defaultSession.clearCache();
      await sess.defaultSession.clearAuthCache();
    } catch (err) {
      console.warn('[CLEANUP SERVICE] Failed to clear storage data:', err);
    }
  }

  /**
   * Reset Windows Master Audio Volume to specified percentage (default: 50%)
   */
  public static async resetAudioVolume(targetVolumePercent: number = 50): Promise<void> {
    if (process.platform !== 'win32' || osEffectsDisabled(`reset volume ${targetVolumePercent}%`)) return;

    return new Promise((resolve) => {
      let isResolved = false;
      const done = () => {
        if (!isResolved) {
          isResolved = true;
          resolve();
        }
      };

      try {
        const path = require('path');
        const fs = require('fs');
        const os = require('os');
        const steps = Math.round(targetVolumePercent / 2);
        const vbsContent = `Set w = CreateObject("WScript.Shell")\r\nFor i = 1 To 50\r\nw.SendKeys Chr(174)\r\nNext\r\nFor i = 1 To ${steps}\r\nw.SendKeys Chr(175)\r\nNext`;
        const tempVbs = path.join(os.tmpdir(), `gchub_vol_${Date.now()}.vbs`);

        fs.writeFileSync(tempVbs, vbsContent, 'utf8');
        exec(`cscript //nologo "${tempVbs}"`, { windowsHide: true }, () => {
          try { fs.unlinkSync(tempVbs); } catch {}
          done();
        });
      } catch {
        done();
      }

      setTimeout(done, 1500);
    });
  }
}

