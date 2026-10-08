import { app, type BrowserWindow } from 'electron';
import { execFile, execSync } from 'child_process';
import { AgentClient } from './agentClient';

function getGlobalShortcut() {
  try {
    const electron = require('electron');
    return electron?.globalShortcut || null;
  } catch {
    return null;
  }
}

/**
 * Main Process Security Manager
 * Handles OS shortcut lockdown, Kiosk mode, and safe background guards.
 * Eliminates intrusive HKCU registry mutations that could lock developer/admin tools.
 */
export class SecurityManager {
  private static isLocked = false;
  private static guardIntervalId: NodeJS.Timeout | null = null;
  private static targetWindow: BrowserWindow | null = null;

  // Tools restricted ONLY during standby lockscreen on production client bilik
  private static readonly RESTRICTED_PROCESSES_LOCKSCREEN = [
    'cmd.exe',
    'powershell.exe',
    'pwsh.exe',
    'regedit.exe',
    'mmc.exe',
    'resmon.exe',
    'procexp.exe',
    'processhacker.exe',
    'systeminformer.exe',
    'SystemSettings.exe'
  ];

  private static isDevEnvironment(): boolean {
    return !(app?.isPackaged ?? false) || !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development';
  }

  /**
   * Initialize security listeners on the target BrowserWindow
   */
  public static init(window: BrowserWindow): void {
    this.targetWindow = window;
    this.setupInputInterceptor(window);

    // Refocus immediately if focus is lost (e.g. Task View / Win+Tab attempts)
    window.on('blur', () => {
      if (this.isLocked && !this.isDevEnvironment()) {
        setTimeout(() => {
          if (this.isLocked && this.targetWindow && !this.targetWindow.isDestroyed()) {
            this.targetWindow.focus();
          }
        }, 40);
      }
    });

    // Proactively clean any orphaned policy locks from previous crashes on startup
    this.purgeRegistryRestrictions();
  }

  /**
   * Set Lockdown Mode: true = Kiosk Lockscreen, false = In-Session Overlay Widget
   */
  public static setLockdownMode(locked: boolean): void {
    this.isLocked = locked;

    if (this.isDevEnvironment() || !locked) {
      this.stopRestrictedProcessKiller();
      this.unregisterGlobalShortcuts();
      this.syncAgentPolicy(false);
      return;
    }

    if (locked) {
      this.startRestrictedProcessKiller();
      this.registerGlobalShortcuts();
      this.syncAgentPolicy(true);
    }
  }

  /**
   * Machine-wide kiosk policy lives with gc-agent (LocalSystem); the standard booth user that runs
   * this client cannot write HKLM, so we request it instead of editing the registry here. Fails
   * soft when the agent is absent (dev, unprovisioned booth): the lock screen still works.
   */
  private static syncAgentPolicy(lock: boolean): void {
    if (process.platform !== 'win32') return;
    const op = lock ? AgentClient.applyKioskPolicy() : AgentClient.clearKioskPolicy();
    op.catch((err) => console.warn('[SECURITY] gc-agent policy sync gagal:', err?.message || err));
  }

  public static isSystemLocked(): boolean {
    return this.isLocked;
  }

  /**
   * Block critical system shortcuts when locked
   */
  private static setupInputInterceptor(win: BrowserWindow): void {
    win.webContents.on('before-input-event', (event, input) => {
      if (!this.isLocked || this.isDevEnvironment()) return;

      const key = input.key.toLowerCase();
      const code = input.code ? input.code.toLowerCase() : '';

      // Block Windows Key & Task View (Win+Tab, Win+D, Win+R, Win+X, Win+E, Win+L, etc.)
      if (input.meta || key === 'meta' || code.includes('meta')) {
        event.preventDefault();
        return;
      }

      // Block Alt+F4, Alt+Tab, Alt+Space, Alt+Escape
      if (input.alt) {
        if (key === 'f4' || key === 'tab' || key === ' ' || key === 'escape' || code === 'f4' || code === 'tab') {
          event.preventDefault();
          return;
        }
      }

      // Block Ctrl+Esc, Ctrl+Shift+Esc, Ctrl+W, Ctrl+R, F11, F12
      if (input.control) {
        if (key === 'escape' || key === 'w' || key === 'r' || (input.shift && key === 'i') || (input.shift && key === 'escape')) {
          event.preventDefault();
          return;
        }
      }

      // Block F11 (Fullscreen toggle) & F12 (DevTools)
      if (key === 'f11' || key === 'f12') {
        event.preventDefault();
        return;
      }
    });
  }

  /**
   * Global shortcuts fallback
   */
  private static registerGlobalShortcuts(): void {
    if (this.isDevEnvironment()) return;
    const gs = getGlobalShortcut();
    if (!gs) return;
    try {
      gs.register('Alt+F4', () => {});
      gs.register('Alt+Tab', () => {});
    } catch {}
  }

  private static unregisterGlobalShortcuts(): void {
    const gs = getGlobalShortcut();
    if (!gs) return;
    try {
      gs.unregister('Alt+F4');
      gs.unregister('Alt+Tab');
    } catch {}
  }

  /**
   * Proactively remove any lingering Windows Registry restrictions from HKCU
   */
  public static purgeRegistryRestrictions(): void {
    if (process.platform !== 'win32') return;

    const REG_SYSTEM_PATH = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System`;
    const REG_EXPLORER_PATH = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer`;

    const delVal = (keyPath: string, valueName: string) => {
      try {
        execSync(`reg delete "${keyPath}" /v "${valueName}" /f`, { stdio: 'ignore', windowsHide: true });
      } catch {}
    };

    delVal(REG_SYSTEM_PATH, 'DisableTaskMgr');
    delVal(REG_SYSTEM_PATH, 'DisableRegistryTools');
    delVal(REG_EXPLORER_PATH, 'NoControlPanel');
    delVal(REG_EXPLORER_PATH, 'NoRun');
  }

  public static applyWindowsRegistryPolicies(enable: boolean): void {
    // Drop any stale HKCU locks left by older builds or a crash; machine-wide policy is the agent's.
    this.purgeRegistryRestrictions();
    this.syncAgentPolicy(enable);
  }

  /**
   * Start background process killer for restricted tools ONLY while locked in production
   */
  public static startRestrictedProcessKiller(): void {
    if (this.guardIntervalId || this.isDevEnvironment()) return;

    // Satu proses taskkill untuk semua nama (/IM bisa diulang), bukan satu spawn per nama tiap tick
    const args = ['/F', '/T', ...this.RESTRICTED_PROCESSES_LOCKSCREEN.flatMap(name => ['/IM', name])];
    this.guardIntervalId = setInterval(() => {
      if (!this.isLocked || this.isDevEnvironment()) return;
      execFile('taskkill', args, { windowsHide: true }, () => {});
    }, 1000);
  }

  public static stopRestrictedProcessKiller(): void {
    if (this.guardIntervalId) {
      clearInterval(this.guardIntervalId);
      this.guardIntervalId = null;
    }
  }

  /**
   * Safe cleanup on application termination
   */
  public static dispose(): void {
    this.stopRestrictedProcessKiller();
    this.unregisterGlobalShortcuts();
    this.purgeRegistryRestrictions();
  }
}
