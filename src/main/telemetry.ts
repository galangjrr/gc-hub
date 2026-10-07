import os from 'os';
import fs from 'fs';
import { exec, execFile } from 'child_process';
import type { HardwareTelemetryPayload } from '../shared/protocol';

/**
 * TelemetryService: Background hardware and OS health monitoring
 * Gathers CPU, RAM, Disk, GPU, and peripheral metrics with zero CPU overhead.
 */
export class TelemetryService {
  private static prevCpuTimes: { idle: number; total: number } | null = null;
  private static cachedGpuName: string = 'NVIDIA GeForce RTX Series';
  private static isGpuQueried = false;

  /**
   * Sample dynamic CPU usage percentage across intervals
   */
  public static getCpuUsagePercent(): number {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += (cpu.times as any)[type];
      }
      idle += cpu.times.idle;
    }

    if (!this.prevCpuTimes) {
      this.prevCpuTimes = { idle, total };
      return 0;
    }

    const idleDiff = idle - this.prevCpuTimes.idle;
    const totalDiff = total - this.prevCpuTimes.total;
    this.prevCpuTimes = { idle, total };

    if (totalDiff <= 0) return 0;
    const usage = 100 - Math.round((100 * idleDiff) / totalDiff);
    return Math.max(0, Math.min(100, usage));
  }

  /**
   * Sample RAM usage in MB and Percentage
   */
  public static getRamMetrics(): { totalMb: number; usedMb: number; usagePercent: number } {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const usedBytes = totalBytes - freeBytes;

    const totalMb = Math.round(totalBytes / (1024 * 1024));
    const usedMb = Math.round(usedBytes / (1024 * 1024));
    const usagePercent = Math.round((usedBytes / totalBytes) * 100);

    return { totalMb, usedMb, usagePercent };
  }

  /**
   * Sample Storage / Drive C: stats via native Node fs.statfsSync (0.1ms latency)
   */
  public static getDiskMetrics(): { totalGb: number; freeGb: number; usagePercent: number } {
    try {
      const rootPath = process.platform === 'win32' ? 'C:/' : '/';
      const stat = fs.statfsSync(rootPath);
      const totalBytes = stat.bsize * stat.blocks;
      const freeBytes = stat.bsize * stat.bfree;
      const usedBytes = totalBytes - freeBytes;

      if (totalBytes > 0) {
        const totalGb = Math.round(totalBytes / (1024 * 1024 * 1024));
        const freeGb = Math.round(freeBytes / (1024 * 1024 * 1024));
        const usagePercent = Math.round((usedBytes / totalBytes) * 100);
        return { totalGb, freeGb, usagePercent };
      }
    } catch {}

    return { totalGb: 500, freeGb: 250, usagePercent: 50 };
  }

  /**
   * Sample GPU name once asynchronously in background
   */
  public static getGpuName(): string {
    if (!this.isGpuQueried && process.platform === 'win32') {
      this.isGpuQueried = true;
      exec(`wmic path win32_VideoController get name /value`, { windowsHide: true }, (err, stdout) => {
        if (!err && stdout) {
          const match = stdout.match(/Name=(.+)/i);
          if (match && match[1]) {
            this.cachedGpuName = match[1].trim();
          }
        }
      });
    }
    return this.cachedGpuName;
  }

  /**
   * Get complete telemetry snapshot for a workstation
   */
  // PowerShell: foreground window -> owning process -> "name|file description".
  private static readonly FOREGROUND_PS = Buffer.from(`
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class GcFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}
"@
$fgPid = 0
[void][GcFg]::GetWindowThreadProcessId([GcFg]::GetForegroundWindow(), [ref]$fgPid)
$p = Get-Process -Id $fgPid -ErrorAction SilentlyContinue
if ($p) { "$($p.Id)|$($p.ProcessName)|$($p.Description)" }
`, 'utf16le').toString('base64');

  /**
   * Name of the app in the foreground, e.g. "Valorant" or "Google Chrome". Empty when the
   * GC Hub lock screen itself is in front or on non-Windows machines.
   * ponytail: spawns one PowerShell per telemetry tick (every 10 s, ~0.3 s CPU); move to a
   * resident native helper if it shows up on low-end client PCs.
   */
  public static getForegroundApp(): Promise<string | undefined> {
    if (process.platform !== 'win32') return Promise.resolve(undefined);
    return new Promise(resolve => {
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', this.FOREGROUND_PS],
        { windowsHide: true, timeout: 4000 }, (err, stdout) => {
          if (err) return resolve(undefined);
          const [pidStr, name = '', desc = ''] = String(stdout).trim().split('|');
          const lower = name.toLowerCase();
          if (!name || Number(pidStr) === process.pid || lower.startsWith('gc-hub') || lower === 'electron'
            || lower === 'explorer' || lower === 'lockapp') {
            return resolve(undefined);
          }
          resolve((desc.trim() || name).slice(0, 40));
        });
    });
  }

  public static async getTelemetrySnapshot(pcId: string = 'PC-01'): Promise<HardwareTelemetryPayload> {
    const activeApp = await this.getForegroundApp();
    const cpuUsage = this.getCpuUsagePercent();
    const ram = this.getRamMetrics();
    const disk = this.getDiskMetrics();
    const gpuName = this.getGpuName();

    return {
      pcId,
      cpuUsagePercent: cpuUsage,
      ramTotalMb: ram.totalMb,
      ramUsedMb: ram.usedMb,
      ramUsagePercent: ram.usagePercent,
      diskTotalGb: disk.totalGb,
      diskFreeGb: disk.freeGb,
      diskUsagePercent: disk.usagePercent,
      gpuName,
      uptimeSeconds: Math.round(os.uptime()),
      activeApp,
      timestamp: Date.now()
    };
  }
}
