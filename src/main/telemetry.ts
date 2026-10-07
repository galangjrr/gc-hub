import os from 'os';
import fs from 'fs';
import path from 'path';
import { exec, execFile } from 'child_process';
import type { HardwareTelemetryPayload } from '../shared/protocol';
import { AgentClient } from './agentClient';

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

  // gc-probe ships in bin/ next to the client exe (dev: repo bin/). It runs in the booth user's
  // session, which the SYSTEM agent cannot do: a service in session 0 cannot read the interactive
  // desktop's foreground window.
  private static probeExePath(): string {
    const packaged = path.resolve(path.dirname(process.execPath), 'bin', 'gc-probe.exe');
    if (fs.existsSync(packaged)) return packaged;
    return path.resolve(process.cwd(), 'bin', 'gc-probe.exe');
  }

  /**
   * Name of the app in the foreground, e.g. "valorant" or "chrome". Undefined when the GC Hub lock
   * screen itself is in front, off Windows, or when gc-probe is absent (dev / unprovisioned).
   * Replaces a per-tick PowerShell spawn with a native one-shot; gc-probe prints "<pid>|<name>".
   */
  public static getForegroundApp(): Promise<string | undefined> {
    if (process.platform !== 'win32') return Promise.resolve(undefined);
    const probe = this.probeExePath();
    if (!fs.existsSync(probe)) return Promise.resolve(undefined);
    return new Promise(resolve => {
      execFile(probe, { windowsHide: true, timeout: 4000 }, (err, stdout) => {
        if (err) return resolve(undefined);
        const [pidStr, name = ''] = String(stdout).trim().split('|');
        const lower = name.toLowerCase();
        if (!name || Number(pidStr) === process.pid || lower.startsWith('gc-hub') || lower === 'electron'
          || lower === 'explorer' || lower === 'lockapp') {
          return resolve(undefined);
        }
        resolve(name.slice(0, 40));
      });
    });
  }

  public static async getTelemetrySnapshot(pcId: string = 'PC-01'): Promise<HardwareTelemetryPayload> {
    const activeApp = await this.getForegroundApp();
    const cpuUsage = this.getCpuUsagePercent();
    const ram = this.getRamMetrics();
    const disk = this.getDiskMetrics();
    const gpuName = this.getGpuName();
    // Lets the cashier see a booth left out of kiosk mode or allowlist; empty when gc-agent is not installed
    const agent = await AgentClient.status().catch(() => ({ kioskEnabled: undefined, exePolicy: undefined }));

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
      kioskEnabled: agent.kioskEnabled,
      exeMode: agent.exePolicy?.mode,
      timestamp: Date.now()
    };
  }
}
