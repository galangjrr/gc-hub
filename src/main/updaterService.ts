import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain, app } from 'electron';

export interface UpdateStatusPayload {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  info?: any;
  progress?: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  };
  error?: string;
}

export class UpdaterService {
  private static mainWindow: BrowserWindow | null = null;
  private static isInitialized = false;

  public static init(window: BrowserWindow) {
    this.mainWindow = window;
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Configure logger & behavior
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    // Event Listeners
    autoUpdater.on('checking-for-update', () => {
      this.sendStatus({ status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
      this.sendStatus({ status: 'available', info });
    });

    autoUpdater.on('update-not-available', (info) => {
      this.sendStatus({ status: 'not-available', info });
    });

    autoUpdater.on('download-progress', (progress) => {
      this.sendStatus({
        status: 'downloading',
        progress: {
          percent: Math.round(progress.percent || 0),
          bytesPerSecond: progress.bytesPerSecond,
          transferred: progress.transferred,
          total: progress.total
        }
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.sendStatus({ status: 'downloaded', info });
    });

    autoUpdater.on('error', (err) => {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('ENOENT') || errMsg.includes('app-update.yml') || errMsg.includes('Cannot find')) {
        // Standalone directory mode or offline environment without update server config - ignore silently
        return;
      }
      this.sendStatus({ status: 'error', error: errMsg });
    });

    // IPC Handlers
    ipcMain.handle('updater:check-for-updates', async () => {
      try {
        if (!app.isPackaged) {
          return { success: false, message: 'Auto-update tidak aktif pada mode pengembangan.' };
        }
        const path = require('path');
        const fs = require('fs');
        const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml');
        if (!fs.existsSync(updateConfigPath)) {
          return { success: false, message: 'Konfigurasi update server belum disetel.' };
        }
        const result = await autoUpdater.checkForUpdates();
        return { success: true, result };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    });

    ipcMain.handle('updater:quit-and-install', () => {
      try {
        autoUpdater.quitAndInstall(false, true);
        return true;
      } catch (err) {
        console.error('[UPDATER] Failed to quit and install update:', err);
        return false;
      }
    });

    // Auto-check in production after 5 seconds only if update config exists
    if (app.isPackaged) {
      setTimeout(() => {
        try {
          const path = require('path');
          const fs = require('fs');
          const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml');
          if (fs.existsSync(updateConfigPath)) {
            autoUpdater.checkForUpdates().catch((err) => {
              console.warn('[UPDATER] Background update check failed:', err.message);
            });
          }
        } catch {}
      }, 5000);
    }
  }

  private static sendStatus(payload: UpdateStatusPayload) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('updater:status-changed', payload);
    }
  }
}
