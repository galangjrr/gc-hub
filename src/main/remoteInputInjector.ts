import { spawn, ChildProcess, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * RemoteInputInjector: High-performance native Windows input daemon.
 * Compiles a tiny C# Win32 input injector (<1ms execution) and pipes commands via stdin.
 */
export class RemoteInputInjector {
  private static daemonProcess: ChildProcess | null = null;
  private static isInitialized = false;

  public static init(): void {
    if (this.isInitialized && this.daemonProcess) return;
    if (process.platform !== 'win32') return;

    try {
      const binDir = path.resolve(process.cwd(), 'bin');
      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
      }

      // v2 adds the BOTTOM command; a new name makes PCs with the old binary recompile it
      const exePath = path.resolve(binDir, 'gc-input-injector-v2.exe');
      const csSourcePath = path.resolve(binDir, 'gc-input-injector-v2.cs');

      // 1. Generate C# source code if binary does not exist
      if (!fs.existsSync(exePath)) {
        const csCode = `
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

class Program {
    [DllImport("user32.dll")]
    static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

    [DllImport("user32.dll")]
    static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    [DllImport("user32.dll")]
    static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
    const uint SWP_NOSIZE_NOMOVE_NOACTIVATE = 0x0001 | 0x0002 | 0x0010;

    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;
    const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    const uint MOUSEEVENTF_WHEEL = 0x0800;
    const uint KEYEVENTF_KEYUP = 0x0002;

    static void Main() {
        string line;
        while ((line = Console.ReadLine()) != null) {
            try {
                if (string.IsNullOrWhiteSpace(line)) continue;
                string[] parts = line.Split(' ');
                string cmd = parts[0].ToUpper();
                if (cmd == "M" && parts.Length >= 3) {
                    int x = int.Parse(parts[1]);
                    int y = int.Parse(parts[2]);
                    SetCursorPos(x, y);
                } else if (cmd == "MD" && parts.Length >= 2) {
                    string btn = parts[1].ToLower();
                    if (btn == "left") mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                    else if (btn == "right") mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
                    else if (btn == "middle") mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0);
                } else if (cmd == "MU" && parts.Length >= 2) {
                    string btn = parts[1].ToLower();
                    if (btn == "left") mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    else if (btn == "right") mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
                    else if (btn == "middle") mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0);
                } else if (cmd == "CLICK" && parts.Length >= 2) {
                    string btn = parts[1].ToLower();
                    if (btn == "left") {
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    } else if (btn == "right") {
                        mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
                        mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
                    } else if (btn == "double") {
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                        System.Threading.Thread.Sleep(50);
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    }
                } else if (cmd == "W" && parts.Length >= 2) {
                    int delta = int.Parse(parts[1]);
                    mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, 0);
                } else if (cmd == "KD" && parts.Length >= 2) {
                    byte vk = byte.Parse(parts[1]);
                    keybd_event(vk, 0, 0, 0);
                } else if (cmd == "KU" && parts.Length >= 2) {
                    byte vk = byte.Parse(parts[1]);
                    keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
                } else if (cmd == "COMBO" && parts.Length >= 2) {
                    byte[] keys = new byte[parts.Length - 1];
                    for (int i = 1; i < parts.Length; i++) {
                        keys[i - 1] = byte.Parse(parts[i]);
                    }
                    for (int i = 0; i < keys.Length; i++) {
                        keybd_event(keys[i], 0, 0, 0);
                    }
                    System.Threading.Thread.Sleep(50);
                    for (int i = keys.Length - 1; i >= 0; i--) {
                        keybd_event(keys[i], 0, KEYEVENTF_KEYUP, 0);
                    }
                } else if (cmd == "BOTTOM" && parts.Length >= 2) {
                    SetWindowPos(new IntPtr(long.Parse(parts[1])), HWND_BOTTOM, 0, 0, 0, 0, SWP_NOSIZE_NOMOVE_NOACTIVATE);
                } else if (cmd == "TEXT" && parts.Length >= 2) {
                    string text = line.Substring(5);
                    SendKeys.SendWait(text);
                }
            } catch {}
        }
    }
}
`;
        fs.writeFileSync(csSourcePath, csCode, 'utf8');

        // Compile with built-in .NET Framework csc.exe
        const cscCandidates = [
          'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
          'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
        ];
        const csc = cscCandidates.find(c => fs.existsSync(c)) || 'csc.exe';

        console.log('[REMOTE INPUT] Compiling native Win32 input injector daemon...');
        execSync(`"${csc}" /t:exe /out:"${exePath}" /r:System.Windows.Forms.dll "${csSourcePath}"`, { windowsHide: true });
        console.log('[REMOTE INPUT] Native input injector compiled successfully.');
      }

      // 2. Spawn persistent daemon
      if (fs.existsSync(exePath)) {
        this.daemonProcess = spawn(exePath, [], {
          stdio: ['pipe', 'ignore', 'ignore'],
          windowsHide: true
        });

        this.daemonProcess.on('exit', () => {
          this.daemonProcess = null;
          this.isInitialized = false;
        });

        this.isInitialized = true;
      }
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

  public static sendText(text: string): void {
    this.sendCommand(`TEXT ${text}`);
  }
}
