import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * RemoteInputInjector: relays operator remote-assist input to the booth desktop via gc-input.exe,
 * a prebuilt native helper spawned in this (the booth user's) session. Commands go over stdin.
 *
 * This used to compile a C# helper with csc.exe on each booth PC at runtime; the prebuilt Go
 * helper removes that .NET Framework dependency. The stdin command protocol is unchanged.
 */
export class RemoteInputInjector {
  private static daemonProcess: ChildProcess | null = null;
  private static isInitialized = false;

  // gc-input.exe ships in bin/ next to the client exe (dev: repo bin/).
  private static helperPath(): string {
    const packaged = path.resolve(path.dirname(process.execPath), 'bin', 'gc-input.exe');
    if (fs.existsSync(packaged)) return packaged;
    return path.resolve(process.cwd(), 'bin', 'gc-input.exe');
  }

  public static init(): void {
    if (this.isInitialized && this.daemonProcess) return;
    if (process.platform !== 'win32') return;

    try {
      const exePath = this.helperPath();
      if (!fs.existsSync(exePath)) {
        console.warn('[REMOTE INPUT] gc-input.exe tidak ditemukan (jalankan npm run build:agent).');
        return;
      }
      this.daemonProcess = spawn(exePath, [], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
      this.daemonProcess.on('exit', () => {
        this.daemonProcess = null;
        this.isInitialized = false;
      });
      this.isInitialized = true;
    } catch (err) {
      console.warn('[REMOTE INPUT] Failed to initialize input injector:', err);
    }
  }

  private static sendCommand(cmd: string): void {
    if (!this.isInitialized || !this.daemonProcess) {
      this.init();
    }
    if (this.daemonProcess && this.daemonProcess.stdin && !this.daemonProcess.stdin.destroyed) {
      this.daemonProcess.stdin.write(`${cmd}\n`);
    }
  }

  public static moveMouse(x: number, y: number): void {
    this.sendCommand(`M ${Math.round(x)} ${Math.round(y)}`);
  }

  public static mouseDown(button: 'left' | 'right' | 'middle'): void {
    this.sendCommand(`MD ${button}`);
  }

  public static mouseUp(button: 'left' | 'right' | 'middle'): void {
    this.sendCommand(`MU ${button}`);
  }

  public static mouseClick(button: 'left' | 'right' | 'middle', doubleClick: boolean = false): void {
    if (doubleClick) {
      this.sendCommand('CLICK double');
    } else {
      this.sendCommand(`CLICK ${button}`);
    }
  }

  public static mouseWheel(deltaY: number): void {
    // Wheel delta in Win32 is typically -120 to +120
    const val = Math.round(deltaY * -1);
    this.sendCommand(`W ${val}`);
  }

  public static keyDown(keyCode: number): void {
    this.sendCommand(`KD ${keyCode}`);
  }

  public static keyUp(keyCode: number): void {
    this.sendCommand(`KU ${keyCode}`);
  }

  public static keyCombo(keyCodes: number[]): void {
    if (!keyCodes || keyCodes.length === 0) return;
    this.sendCommand(`COMBO ${keyCodes.join(' ')}`);
  }

  /** Puts a window at the bottom of the z-order (just above the desktop) without activating it. */
  public static sendWindowToBottom(hwnd: Buffer): void {
    if (process.platform !== 'win32') return;
    const handle = hwnd.length >= 8 ? hwnd.readBigUInt64LE(0) : BigInt(hwnd.readUInt32LE(0));
    this.sendCommand(`BOTTOM ${handle}`);
  }

  /** Turns off the Shift x5 Sticky Keys prompt for the logged-in booth user. */
  public static disableStickyKeysHotkey(): void {
    if (process.platform !== 'win32') return;
    this.sendCommand('STICKYOFF');
  }

  public static sendText(text: string): void {
    this.sendCommand(`TEXT ${text}`);
  }
}
