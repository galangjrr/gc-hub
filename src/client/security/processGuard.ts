import { RemoteProcessItem } from '../../shared/protocol';

/**
 * ProcessWatcherGuard: renderer bridge to the main process scan and kill (SystemService).
 * Outside the Electron client (browser preview) there are no processes and nothing to kill.
 */
export class ProcessWatcherGuard {
  // Throws when Windows could not be read, so callers can tell an error from an empty list.
  public static async getRunningUserProcesses(includeSystem: boolean = false): Promise<RemoteProcessItem[]> {
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : undefined;
    if (!api?.getRunningProcesses) return [];
    const processes = await api.getRunningProcesses(includeSystem);
    return Array.isArray(processes) ? processes : [];
  }

  public static async killRemoteProcess(
    pid: number,
    processName: string,
    isClientRequest: boolean = false
  ): Promise<{ success: boolean; message: string }> {
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : undefined;
    if (!api?.killProcess) return { success: false, message: 'Tutup aplikasi hanya bisa dari aplikasi client.' };
    try {
      return await api.killProcess(pid, processName, isClientRequest);
    } catch (err) {
      return { success: false, message: `Gagal menutup ${processName}: ${err}` };
    }
  }
}
