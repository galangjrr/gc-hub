import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { randomBytes } from 'crypto';
import { isIP } from 'net';
import os from 'os';

function detectIsServerMode(): boolean {
  if (process.argv.includes('--mode=server') || process.env.VITE_APP_MODE === 'server') {
    return true;
  }
  if (process.argv.includes('--mode=client') || process.env.VITE_APP_MODE === 'client') {
    return false;
  }
  const exe = path.basename(process.execPath).toLowerCase();
  if (exe.includes('client')) {
    return false;
  }
  if (exe.includes('server')) {
    return true;
  }
  // Default to Server mode for primary dashboard
  return true;
}

const isServerMode = detectIsServerMode();
const isDev = !(app?.isPackaged ?? false) && !!process.env.VITE_DEV_SERVER_URL;
const targetAppName = isServerMode ? 'GC Hub - Server' : 'GC Hub - Client';

// Set App Name & Title before Chromium initialization
app.name = targetAppName;
app.setName(targetAppName);
process.title = targetAppName;
if (process.platform === 'win32') {
  app.setAppUserModelId(targetAppName);
}

app.commandLine.appendSwitch('app-name', targetAppName);

function getLogFilePath(): string {
  try {
    const base = app?.isPackaged ? path.dirname(process.execPath) : process.cwd();
    return path.join(base, 'crash_debug.log');
  } catch {
    return path.join(process.cwd(), 'crash_debug.log');
  }
}

// Log uncaught errors to crash.log
process.on('uncaughtException', (err) => {
  const logMsg = `[${new Date().toISOString()}] Uncaught Exception:\n${err.stack || err}\n`;
  try {
    fs.appendFileSync(getLogFilePath(), logMsg);
  } catch(e) {}
  console.error(logMsg);
});
process.on('unhandledRejection', (reason) => {
  const logMsg = `[${new Date().toISOString()}] Unhandled Rejection:\n${reason}\n`;
  try {
    fs.appendFileSync(getLogFilePath(), logMsg);
  } catch(e) {}
  console.error(logMsg);
});
import { ServerNetworkBridge } from '../server/network/serverNetwork';
import { SystemService } from './systemService';
import { DbService } from '../server/db/dbService';
import { BillingEngine } from '../server/engine/billingEngine';
import { UpdaterService } from './updaterService';
import { SecurityManager } from './security';
import { loadClientConfig, saveClientConfig } from './clientConfig';
import { SessionCleanupService } from './cleanup';
import { SupabaseSyncService, cloudPcId, localPcName, type CloudBooking, type CloudRemoteCommand } from '../server/services/supabaseSyncService';
import { WindowsProvisioner } from './windowsProvisioner';
import { RemoteInputInjector } from './remoteInputInjector';
import { OpCode, AuthPayload, ClientRegisterPayload, type SessionUserType, type SessionBillingType, type AdminAuthResult } from '../shared/protocol';
import { initPcRename, requestPcRename } from '../server/network/pcRename';
import { TelemetryService } from './telemetry';
import { startDailyBackup, backupDatabase, listBackups, stageRestore, BACKUP_DIR } from '../server/db';

let mainWindow: BrowserWindow | null = null;
// Client in session: the widget window must stay just above the wallpaper, under every other window
let isDesktopOverlay = false;

// 1. Prevent Multiple Instances
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  console.warn(`[MAIN] Another instance of ${isServerMode ? 'GC-Hub Server' : 'GC-Hub Client'} is already running. Exiting...`);
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ==================== PERSISTENT SERVER WINDOW STATE ====================
interface ServerWindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

function loadServerWindowState(): ServerWindowState {
  try {
    const { screen } = require('electron');
    const statePath = path.join(app.getPath('userData'), 'server-window-state.json');
    if (fs.existsSync(statePath)) {
      const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      if (data && typeof data.width === 'number' && typeof data.height === 'number') {
        if (typeof data.x === 'number' && typeof data.y === 'number') {
          const matchingDisplay = screen.getDisplayMatching({
            x: data.x,
            y: data.y,
            width: data.width,
            height: data.height
          });
          if (!matchingDisplay) {
            delete data.x;
            delete data.y;
          }
        }
        return data;
      }
    }
  } catch (e) {
    console.warn('[MAIN] Failed to load server window state:', e);
  }
  return { width: 1366, height: 768, isMaximized: true };
}

function saveServerWindowState(win: BrowserWindow) {
  try {
    if (!win || win.isDestroyed()) return;
    const isMaximized = win.isMaximized();
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
    const state: ServerWindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized
    };
    const statePath = path.join(app.getPath('userData'), 'server-window-state.json');
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[MAIN] Failed to save server window state:', e);
  }
}

async function createWindow() {
  // Electron's default menu carries Ctrl+Shift+I (DevTools) and Ctrl+R (reload). A booth player could open
  // DevTools mid-session and call electronAPI directly, skipping the admin check, so outside dev there is no menu.
  if (!isDev) Menu.setApplicationMenu(null);
  if (isServerMode) {
    // 1. Initialize SQLite Database & Tables
    await DbService.init();

    startDailyBackup();

    // 2. Start Authoritative Billing Engine
    BillingEngine.start();

    // 3. Start WebSocket Server on Port 7894 (Non-colliding modern port)
    // Kunci LAN dibuat sekali lalu disalin kasir ke setiap client (Pengaturan > Keamanan Klien)
    let lanSecret = DbService.getSetting('lan_secret');
    if (!lanSecret) {
      lanSecret = randomBytes(16).toString('hex');
      DbService.setSetting('lan_secret', lanSecret);
    }
    ServerNetworkBridge.setLanSecret(lanSecret);
    ServerNetworkBridge.start(7894);

    // Setup network packet handlers
    setupServerNetworkHandlers();

    // 4. Jembatan cloud (GC Net Hub). Billing tetap jalan penuh tanpa internet.
    setupCloudBridge();

    // Setup Billing Engine real-time push to Server UI & Cloud Supabase
    let lastCloudSync = 0;
    BillingEngine.onStateChange((workstations) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('engine:workstations-updated', workstations);
      }
      const now = Date.now();
      if (now - lastCloudSync >= 3000) {
        lastCloudSync = now;
        SupabaseSyncService.syncWorkstations(workstations);
      }
    });

    // On client disconnect/reconnect: immediately sync Supabase (bypass 3s throttle)
    // This clears expected_empty_time for offline PCs so web companion stops counting
    ServerNetworkBridge.onConnectionChange((_pcId, _isConnected) => {
      // Small delay to let BillingEngine.tick process the new state first
      setTimeout(() => {
        const workstations = BillingEngine.getLiveWorkstations();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('engine:workstations-updated', workstations);
        }
        lastCloudSync = Date.now();
        SupabaseSyncService.syncWorkstations(workstations);
      }, 500);
    });

    // Setup Transaction real-time push to Server UI
    DbService.onTransactionAdded((tx) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('db:transaction-added', tx);
      }
    });

    // Load Native Icon
    const iconPath = path.join(app.getAppPath(), 'icons/icon.ico');
    const fallbackIconPath = path.join(process.cwd(), 'icons/icon.ico');
    const appIcon = fs.existsSync(iconPath) ? iconPath : (fs.existsSync(fallbackIconPath) ? fallbackIconPath : undefined);

    // Load Persisted Window State (Bounds, Maximized status)
    const serverState = loadServerWindowState();

    // Mode Server: Undecorated Frameless Modern Window with Last Known Position & Size
    mainWindow = new BrowserWindow({
      x: serverState.x,
      y: serverState.y,
      width: serverState.width || 1366,
      height: serverState.height || 768,
      minWidth: 1024,
      minHeight: 700,
      frame: false,
      icon: appIcon,
      title: 'GC Hub - Server',
      backgroundColor: '#0B1214',
      show: false,
      webPreferences: {
        devTools: isDev,
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload/index.cjs'),
      },
    });

    if (serverState.isMaximized) {
      mainWindow.maximize();
    }
    mainWindow.show();

    let saveStateTimeout: NodeJS.Timeout | null = null;
    const debounceSaveState = () => {
      if (saveStateTimeout) clearTimeout(saveStateTimeout);
      saveStateTimeout = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          saveServerWindowState(mainWindow);
        }
      }, 400);
    };

    mainWindow.on('resize', debounceSaveState);
    mainWindow.on('move', debounceSaveState);
    mainWindow.on('close', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        saveServerWindowState(mainWindow);
      }
    });

  } else {
    // Mode Client: Fullscreen lockscreen on standby
    const { screen } = require('electron');
    const allDisplays = screen.getAllDisplays();
    let minX = 0, minY = 0, maxX = 0, maxY = 0;
    allDisplays.forEach((d: any) => {
      minX = Math.min(minX, d.bounds.x);
      minY = Math.min(minY, d.bounds.y);
      maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
      maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
    });

    const iconPath = path.join(app.getAppPath(), 'icons/icon.ico');
    const fallbackIconPath = path.join(process.cwd(), 'icons/icon.ico');
    const appIcon = fs.existsSync(iconPath) ? iconPath : (fs.existsSync(fallbackIconPath) ? fallbackIconPath : undefined);

    mainWindow = new BrowserWindow({
      x: isDev ? undefined : minX,
      y: isDev ? undefined : minY,
      width: isDev ? 1280 : maxX - minX,
      height: isDev ? 800 : maxY - minY,
      fullscreen: !isDev,
      kiosk: !isDev,
      frame: isDev,
      transparent: true,
      hasShadow: false,
      icon: appIcon,
      backgroundColor: '#00000000',
      skipTaskbar: false,
      alwaysOnTop: true,
      title: 'GC Hub - Client',
      webPreferences: {
        devTools: isDev,
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload/index.cjs'),
      },
    });

    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    SecurityManager.init(mainWindow);
    SecurityManager.setLockdownMode(true);
    // Booth user's own setting: only the installed client, never a dev run or a test harness
    if (app.isPackaged) RemoteInputInjector.disableStickyKeysHotkey();

    // Clicking the widget or Alt+Tab activates and raises it; push it back under everything
    mainWindow.on('focus', () => {
      if (isDesktopOverlay && mainWindow && !mainWindow.isDestroyed()) {
        RemoteInputInjector.sendWindowToBottom(mainWindow.getNativeWindowHandle());
      }
    });
  }

  // 2. Background Throttling: Nonaktifkan render berat saat window di-minimize/hidden
  if (mainWindow) {
    mainWindow.webContents.setBackgroundThrottling(true);
    if (isServerMode) {
      UpdaterService.init(mainWindow);
    }
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[MAIN] WebContents failed to load ${validatedURL}: [${errorCode}] ${errorDescription}`);
    });
    mainWindow.webContents.on('did-finish-load', () => {
      if (isServerMode && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('engine:workstations-updated', BillingEngine.getLiveWorkstations());
      }
    });
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const htmlRel = isServerMode ? 'dist/server/index.html' : 'dist/client/index.html';
    const primaryPath = path.join(app.getAppPath(), htmlRel);
    const fallbackPath = path.join(process.cwd(), htmlRel);
    const finalHtmlPath = fs.existsSync(primaryPath) ? primaryPath : fallbackPath;
    console.log(`[MAIN] Mode: ${isServerMode ? 'SERVER' : 'CLIENT'} | Loading: ${finalHtmlPath}`);
    mainWindow.loadFile(finalHtmlPath);
  }
}

function findWorkstation(pcName: string) {
  const key = (pcName || '').trim().toUpperCase();
  return BillingEngine.getLiveWorkstations().find(w => w.name.toUpperCase() === key);
}

function notifyUi(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

/** Mulai sesi dari booking online di PC lokal, lalu antrekan status 'active' ke cloud. */
function startBookingOnPc(booking: CloudBooking, pcName: string): { success: boolean; message: string } {
  const ws = findWorkstation(pcName);
  if (!ws) return { success: false, message: `PC ${pcName} tidak terdaftar di server.` };
  if (BillingEngine.getSession(ws.name)) return { success: false, message: `${ws.name} masih dipakai. Selesaikan sesi atau pilih PC lain.` };
  if (booking.status !== 'pending' && booking.status !== 'active') return { success: false, message: `Booking berstatus ${booking.status}.` };

  const minutes = booking.paket?.duration_minutes || 60;
  const started = BillingEngine.startSession(ws.name, {
    username: booking.player_name,
    userType: 'guest',
    billingType: 'package',
    durationMinutes: minutes,
    price: booking.paket?.price ?? 0,
    packageName: `Booking ${booking.paket?.name || booking.paket_id}`,
    paidOnline: booking.payment_status === 'paid'
  });
  if (!started) return { success: false, message: 'Sesi gagal dimulai. Cek paket booking.' };

  SupabaseSyncService.markBookingStarted(booking.id, ws.name, cloudPcId(ws.name), booking.pc_id);
  DbService.addSystemLog({ type: 'server', event: 'Booking online dimulai', details: `${booking.player_name} (${booking.id})`, targetPc: ws.name });
  return { success: true, message: `Sesi booking ${booking.player_name} dimulai di ${ws.name} (${minutes} menit).` };
}

async function executeCloudCommand(cmd: CloudRemoteCommand): Promise<boolean> {
  const { workstation_id: target, payload } = cmd;
  const allPcs = () => BillingEngine.getLiveWorkstations().map(w => w.name);
  const minutes = Number(payload?.durationMinutes ?? payload?.minutes) || 60;
  const price = Number(payload?.price) || 0;
  const packageName = payload?.packageName || payload?.paket_name;

  switch (cmd.command) {
    case 'restart':
    case 'shutdown':
      return ServerNetworkBridge.sendToClient(target, OpCode.REMOTE_COMMAND, { action: cmd.command });
    case 'lock':
      (target === 'ALL' ? allPcs() : [target]).forEach(pc => BillingEngine.pauseSession(pc));
      return true;
    case 'unlock':
      (target === 'ALL' ? allPcs() : [target]).forEach(pc => BillingEngine.resumeSession(pc));
      return true;
    case 'start_session':
      return BillingEngine.startSession(target, {
        username: payload?.username || payload?.player_name || 'Guest',
        billingType: 'package',
        durationMinutes: minutes,
        price,
        packageName: packageName || 'Paket Billing'
      });
    case 'add_time':
      return BillingEngine.addStackedPackage(target, minutes, price, packageName || 'Tambah Waktu').success;
    case 'replace_package':
      return BillingEngine.replacePackage(target, minutes, price, packageName || 'Ganti Paket').success;
    case 'stop_session':
      if (!BillingEngine.getSession(target)) return false;
      BillingEngine.stopSession(target, payload?.reason || 'Dihentikan dari Mobile Companion');
      return true;
    case 'move_station': {
      const to = payload?.target_pc_id || payload?.to_pc_id;
      return to ? BillingEngine.transferSession(target, to) : false;
    }
    case 'broadcast_chat':
      ServerNetworkBridge.broadcast(OpCode.REMOTE_COMMAND, {
        action: 'broadcast_message',
        params: { title: 'Pengumuman', message: String(payload?.message || ''), sender: 'Owner' }
      });
      return true;
  }
  return false;
}

function setupCloudBridge(): void {
  SupabaseSyncService.setListeners({
    onRemoteCommand: executeCloudCommand,
    onBookingActivated: async (booking) => {
      // Disetujui dari HP kasir/owner: ambil detail paket, lalu mulai di PC yang dibooking
      const withPaket = SupabaseSyncService.getCachedBooking(booking.id)
        ?? (await SupabaseSyncService.listOpenBookings()).bookings.find(b => b.id === booking.id);
      const pcName = booking.pc_id ? localPcName(booking.pc_id, BillingEngine.getLiveWorkstations()) : null;
      const result = withPaket && pcName
        ? startBookingOnPc(withPaket, pcName)
        : { success: false, message: 'PC booking belum ditentukan. Pilih PC dari daftar booking.' };
      notifyUi('supabase:booking-activation', { booking, ...result });
    },
    onBookingsChanged: (event, booking) => {
      if (event === 'created') notifyUi('supabase:new-booking', booking);
      notifyUi('supabase:bookings-changed', { event, booking });
    }
  });

  BillingEngine.onSessionEnded(ended => {
    SupabaseSyncService.markSessionEnded(ended.pcId);
    if (ended.userType === 'admin') return;
    SupabaseSyncService.recordSessionLog({
      playerName: ended.username,
      pcName: ended.pcId,
      paketName: ended.packageName || (ended.billingType === 'member' ? 'Saldo Member' : ended.billingType === 'postpaid' ? 'Personal (Argo)' : 'Paket'),
      price: Math.max(0, ended.totalCost - ended.refundedAmount),
      startTime: new Date(ended.startTime).toISOString(),
      endTime: new Date(ended.endTime).toISOString(),
      status: /refund|batal/i.test(ended.reason) ? 'Batal' : 'Selesai',
      reason: ended.reason
    });
  });

  SupabaseSyncService.init({
    appVersion: app.getVersion(),
    getOnlinePcs: () => ServerNetworkBridge.getConnectedClients().filter(c => c.isRegistered).length
  }).then(connected => {
    if (connected) SupabaseSyncService.syncWorkstations(BillingEngine.getLiveWorkstations());
  }).catch(err => console.error('[CLOUD] Gagal menyambung:', err));
}

// Tarif per jam mengikuti grup/workstation yang diatur kasir, bukan angka tetap
function getWorkstationRate(pcId: string): number {
  const key = pcId.trim().toUpperCase();
  const ws = DbService.getWorkstations().find(w => w.name.toUpperCase() === key || w.id?.toString().toUpperCase() === key);
  const rate = Number(ws?.pricePerHour);
  return rate > 0 ? rate : 4000;
}

// Anti brute force login dari PC client: 5 gagal berturut-turut = kunci 60 detik per PC
const authFailures = new Map<string, { count: number; lockedUntil: number }>();

function isAuthLocked(pcId: string): boolean {
  const entry = authFailures.get(pcId);
  return !!entry && entry.lockedUntil > Date.now();
}

function registerAuthFailure(pcId: string): void {
  const entry = authFailures.get(pcId) || { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= 5) {
    entry.count = 0;
    entry.lockedUntil = Date.now() + 60_000;
  }
  authFailures.set(pcId, entry);
}

function setupServerNetworkHandlers() {
  initPcRename();

  // 0. Client Registration (Auto-register workstation & Resync session if exists)
  ServerNetworkBridge.on(OpCode.CLIENT_REGISTER, (client, packet) => {
    DbService.upsertWorkstation(client.pcId, client.pcName, client.ip, client.mac);
    BillingEngine.reconcileClientSnapshot(client.pcId, (packet.payload as ClientRegisterPayload)?.sessionSnapshot);
    BillingEngine.resyncClient(client.pcId);
    BillingEngine.notifyListeners();

    // Send latest POS catalog to newly connected client
    ServerNetworkBridge.sendToClient(client.pcId, OpCode.REMOTE_COMMAND, {
      action: 'sync_catalog',
      params: {
        products: DbService.getBoothProducts(),
        categories: DbService.getCategories()
      }
    });
  });

  // 0. Admin check for admin-only actions on a booth PC (settings, technician mode, exit). Admin role only,
  // same rule as server settings; never starts a session.
  ServerNetworkBridge.on(OpCode.ADMIN_AUTH, (client, packet) => {
    const reply = (result: AdminAuthResult) => ServerNetworkBridge.sendToClient(client.pcId, OpCode.ADMIN_AUTH, result);
    if (isAuthLocked(client.pcId)) {
      return reply({ success: false, message: 'Terlalu banyak percobaan gagal. Coba lagi dalam 1 menit.' });
    }
    const { username = '', password = '' } = (packet.payload || {}) as { username?: string; password?: string };
    const admin = DbService.verifyAdminLogin({ username, password });
    if (!admin.success || !admin.employee) {
      registerAuthFailure(client.pcId);
      return reply({ success: false, message: admin.message });
    }
    authFailures.delete(client.pcId);
    console.log(`[AUTH] Booth settings opened on ${client.pcId} by ${admin.employee.name}`);
    reply({ success: true });
  });

  // 1. Client Login Request
  ServerNetworkBridge.on(OpCode.AUTH_REQUEST, (client, packet) => {
    const payload = packet.payload as AuthPayload;
    if (!payload) return;

    const rawUser = (payload.username || '').trim();
    const rawPass = (payload.password || '').trim();

    if (isAuthLocked(client.pcId)) {
      ServerNetworkBridge.sendToClient(client.pcId, OpCode.SESSION_END, {
        reason: 'Terlalu banyak percobaan login gagal. Coba lagi dalam 1 menit.'
      });
      return;
    }

    // PC with a running session: only staff credentials are accepted, and they unlock the
    // screen instead of starting a new session (which would drop the player's bill).
    if (BillingEngine.getSession(client.pcId)) {
      const staff = DbService.verifyEmployeeLogin({ username: rawUser, password: rawPass });
      if (!staff.success || !staff.employee) {
        registerAuthFailure(client.pcId);
        ServerNetworkBridge.sendToClient(client.pcId, OpCode.SESSION_END, { reason: staff.message });
        return;
      }
      authFailures.delete(client.pcId);
      console.log(`[AUTH] Operator unlock on ${client.pcId} by ${staff.employee.name}`);
      BillingEngine.operatorUnlock(client.pcId);
      return;
    }

    const unpaid = BillingEngine.findUnpaidWorkstation(client.pcId) || BillingEngine.findUnpaidWorkstation(client.pcName);
    if (unpaid) {
      ServerNetworkBridge.sendToClient(client.pcId, OpCode.SESSION_END, {
        reason: `PC ini masih punya tagihan Rp ${(unpaid.unpaidAmount || 0).toLocaleString('id-ID')} yang belum dibayar. Selesaikan pembayaran di kasir.`
      });
      return;
    }

    // A. Staff / Administrator Login Check (from SQLite Employees Table)
    const employeeAuth = DbService.verifyEmployeeLogin({ username: rawUser, password: rawPass });
    if (employeeAuth.success && employeeAuth.employee) {
      authFailures.delete(client.pcId);
      console.log(`[AUTH] Staff/Admin login success on ${client.pcId} (${client.pcName}) by ${employeeAuth.employee.name} (${employeeAuth.employee.roleText || 'Admin'})`);
      BillingEngine.startSession(client.pcId, {
        username: employeeAuth.employee.name,
        userType: 'admin' as SessionUserType,
        billingType: 'postpaid' as SessionBillingType,
        durationMinutes: 99999,
        price: 0,
        pricePerHour: 0,
        packageName: employeeAuth.employee.roleText || 'Admin'
      });
      return;
    }

    // B. Member Account Check (password wajib cocok)
    const memberAuth = DbService.verifyMemberLogin(rawUser, rawPass);
    if (!memberAuth.success || !memberAuth.member) {
      registerAuthFailure(client.pcId);
      ServerNetworkBridge.sendToClient(client.pcId, OpCode.SESSION_END, { reason: memberAuth.message });
      return;
    }
    const member = memberAuth.member;
    authFailures.delete(client.pcId);

    if (member.status === 'Terkunci' || member.status === 'Expired') {
      ServerNetworkBridge.sendToClient(client.pcId, OpCode.SESSION_END, {
        reason: `Akun member ${member.username} berstatus [${member.status}]. Hubungi kasir.`
      });
      return;
    }

    if (member.money < 2000) {
      ServerNetworkBridge.sendToClient(client.pcId, OpCode.SESSION_END, {
        reason: `Saldo tidak mencukupi (Sisa: Rp ${member.money.toLocaleString('id-ID')}). Silakan isi saldo di kasir.`
      });
      return;
    }

    const pph = getWorkstationRate(client.pcId);
    const durationMin = Math.floor((member.money / pph) * 60);

    BillingEngine.startSession(client.pcId, {
      username: member.username,
      userType: 'member',
      billingType: 'member',
      durationMinutes: durationMin,
      price: 0,
      pricePerHour: pph,
      memberId: member.id
    });
  });

  // 2. Coupon Redemption Request
  ServerNetworkBridge.on(OpCode.COUPON_REDEEM, (client, packet) => {
    const code = packet.payload?.code;
    const username = packet.payload?.username || `Guest_${client.pcId}`;
    if (!code) return;

    const result = DbService.redeemCoupon(code, username);
    if (!result.success || !result.coupon) {
      ServerNetworkBridge.sendToClient(client.pcId, OpCode.COUPON_REDEEM, { success: false, message: result.message });
      return;
    }

    const coupon = result.coupon;
    if (coupon.type === 'time') {
      BillingEngine.startSession(client.pcId, {
        username,
        userType: 'guest',
        billingType: 'package',
        durationMinutes: coupon.durationMinutes || 60,
        price: 0,
        packageName: `Kupon [${coupon.code}]`
      });
    } else {
      // Money coupon
      const durationMin = Math.floor(((Number(coupon.value) || 0) / getWorkstationRate(client.pcId)) * 60);
      BillingEngine.startSession(client.pcId, {
        username,
        userType: 'guest',
        billingType: 'package',
        durationMinutes: durationMin,
        price: 0,
        packageName: `Voucher Rp ${(Number(coupon.value) || 0).toLocaleString('id-ID')}`
      });
    }

    ServerNetworkBridge.sendToClient(client.pcId, OpCode.COUPON_REDEEM, {
      success: true,
      message: `Kupon ${coupon.code} berhasil diaktifkan!`,
      coupon
    });
  });

  // 3. Client Logout & End Session
  ServerNetworkBridge.on(OpCode.SESSION_END, (client) => {
    BillingEngine.stopSession(client.pcId, 'Logout Selesai (Pengguna)');
  });

  // 4. Client Order F&B Request
  ServerNetworkBridge.on(OpCode.ORDER_REQUEST, (client, packet) => {
    const payload = packet.payload;
    if (!payload) return;

    const session = BillingEngine.getSession(client.pcId);
    const username = (session ? session.username : client.pcName) || 'Tamu';

    // Prices come from the catalog; a booth PC must not be able to set its own price
    const priced = DbService.priceClientOrder(payload.items);
    if (!priced.success) {
      ServerNetworkBridge.sendToClient(client.pcId, OpCode.ORDER_STATUS_UPDATE, {
        orderId: '',
        status: 'Ditolak',
        message: priced.message
      });
      return;
    }

    // 1. Record order in SQLite DB
    const note = typeof payload.note === 'string' ? payload.note.slice(0, 200) : undefined;
    const createdOrder = DbService.createOrder({
      pcId: client.pcId,
      pcName: client.pcName || client.pcId,
      username,
      items: priced.items,
      totalPrice: priced.totalPrice,
      note,
      staff: 'Kasir'
    });

    // 2. Set pending order in BillingEngine to update PC card badge
    BillingEngine.setPendingOrder(client.pcId, createdOrder);

    // 3. Notify Kasir UI via webContents IPC
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pos:order-received', createdOrder);
    }

    // 4. Send acknowledgment back to client workstation
    ServerNetworkBridge.sendToClient(client.pcId, OpCode.ORDER_STATUS_UPDATE, {
      orderId: createdOrder.orderCode,
      status: 'Menunggu Konfirmasi Kasir',
      message: `Pesanan (${createdOrder.items.length} menu, Rp ${createdOrder.totalPrice.toLocaleString('id-ID')}) telah diterima kasir dan sedang diproses.`
    });
  });

  // 5. Semua balasan REMOTE_COMMAND dari client, dirutekan berdasarkan action
  ServerNetworkBridge.on(OpCode.REMOTE_COMMAND, (client, packet) => {
    const action = packet.payload?.action;
    const params = packet.payload?.params;
    if (!action || !mainWindow || mainWindow.isDestroyed()) return;
    const ui = mainWindow.webContents;

    switch (action) {
      case 'telemetry':
        BillingEngine.setActiveApp(client.pcName || client.pcId, typeof params?.activeApp === 'string' ? params.activeApp : undefined);
        ui.send('client:telemetry-update', { pcId: client.pcId, telemetry: params });
        break;
      case 'process_list':
        ui.send('client:process-list-update', { ...params, pcId: client.pcId });
        break;
      case 'kill_process_result':
        ui.send('client:kill-process-result', { ...params, pcId: client.pcId });
        break;
      case 'screen_capture_response':
        ui.send('client:screen-capture-update', { ...params, pcId: client.pcId, pcName: client.pcName, ip: client.ip });
        break;
      case 'client_chat_reply':
        ui.send('client:chat-reply', { ...params, pcId: client.pcId });
        DbService.addSystemLog({
          type: 'client',
          event: 'Client Chat Reply',
          details: `Pesan dari ${client.pcId}: "${params?.text || ''}"`,
          operator: client.pcName,
          targetPc: client.pcId
        });
        break;
    }
  });
}


// ==================== CLIENT WINDOW IPC ====================
ipcMain.handle('client:set-desktop-overlay-mode', (_event, isOverlayMode: boolean, options?: { isIsland?: boolean; width?: number; height?: number }) => {
  if (!mainWindow || isServerMode) return false;
  isDesktopOverlay = isOverlayMode;
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();

  if (isOverlayMode) {
    // Mode Sesi Aktif: Posisikan floating widget di pojok kanan atas
    SecurityManager.setLockdownMode(false);
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.setKiosk(false);
    mainWindow.setFullScreen(false);
    
    // Widget sesi selalu di bawah semua jendela lain, hanya di atas wallpaper
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Dynamic sizing: cukup ruang agar username, billing, chat tidak terpotong
    const isIsland = options?.isIsland ?? false;
    const widgetWidth = options?.width || (isIsland ? 380 : 340);
    const widgetHeight = options?.height || (isIsland ? 56 : 420);

    const currentBounds = mainWindow.getBounds();
    const isCurrentInWorkArea = currentBounds.x > primaryDisplay.workArea.x && currentBounds.y > primaryDisplay.workArea.y;
    
    // Jika window belum diposisikan atau di luar batas, posisikan di pojok kanan atas
    let targetX = primaryDisplay.workArea.x + primaryDisplay.workArea.width - widgetWidth - 16;
    let targetY = primaryDisplay.workArea.y + 16;
    
    if (isCurrentInWorkArea && !isIsland && currentBounds.width === widgetWidth) {
      targetX = currentBounds.x;
      targetY = currentBounds.y;
    }

    mainWindow.setBounds({
      x: targetX,
      y: targetY,
      width: widgetWidth,
      height: widgetHeight
    });
    mainWindow.setIgnoreMouseEvents(false);
    if (!mainWindow.isVisible()) mainWindow.showInactive();
    RemoteInputInjector.sendWindowToBottom(mainWindow.getNativeWindowHandle());
  } else {
    // Mode Layar Terkunci / Standby: Kiosk fullscreen menutupi seluruh monitor
    SecurityManager.setLockdownMode(true);
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    const allDisplays = screen.getAllDisplays();
    let minX = 0, minY = 0, maxX = 0, maxY = 0;
    allDisplays.forEach((d: any) => {
      minX = Math.min(minX, d.bounds.x);
      minY = Math.min(minY, d.bounds.y);
      maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
      maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
    });

    if (!isDev) {
      mainWindow.setKiosk(true);
      mainWindow.setFullScreen(true);
    }
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setBounds({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.show();
    mainWindow.focus();
  }
  return true;
});

ipcMain.handle('client:set-widget-mouse-interactive', (_event, interactive: boolean) => {
  if (!mainWindow || isServerMode) return false;
  mainWindow.setIgnoreMouseEvents(!interactive, { forward: true });
  return true;
});

ipcMain.handle('client:move-window', (_event, { deltaX, deltaY }: { deltaX: number; deltaY: number }) => {
  if (!mainWindow || isServerMode) return false;
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds({
    x: Math.round(bounds.x + deltaX),
    y: Math.round(bounds.y + deltaY),
    width: bounds.width,
    height: bounds.height
  });
  return true;
});

ipcMain.handle('client:inject-remote-input', (_event, { action, params }: { action: string; params?: any }) => {
  if (isServerMode) return false;
  RemoteInputInjector.init();
  if (action === 'move' && params) {
    RemoteInputInjector.moveMouse(params.x, params.y);
  } else if (action === 'down' && params) {
    RemoteInputInjector.mouseDown(params.button || 'left');
  } else if (action === 'up' && params) {
    RemoteInputInjector.mouseUp(params.button || 'left');
  } else if (action === 'click' && params) {
    RemoteInputInjector.mouseClick(params.button || 'left', params.doubleClick);
  } else if (action === 'scroll' && params) {
    RemoteInputInjector.mouseWheel(params.deltaY || 0);
  } else if (action === 'keydown' && params) {
    RemoteInputInjector.keyDown(params.keyCode);
  } else if (action === 'keyup' && params) {
    RemoteInputInjector.keyUp(params.keyCode);
  } else if (action === 'combo' && params) {
    RemoteInputInjector.keyCombo(params.keyCodes || []);
  } else if (action === 'text' && params) {
    RemoteInputInjector.sendText(params.text);
  }
  return true;
});

// Identitas mesin asli untuk register ke server (MAC dipakai Wake-on-LAN)
ipcMain.handle('client:get-machine-info', () => {
  const nic = Object.values(os.networkInterfaces())
    .flat()
    .find(n => n && !n.internal && n.family === 'IPv4' && n.mac && n.mac !== '00:00:00:00:00:00');
  return {
    mac: nic?.mac?.toUpperCase() || '',
    ip: nic?.address || '',
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    hostname: os.hostname()
  };
});

function getClientConfigPath(): string {
  const baseDir = app?.isPackaged ? path.dirname(process.execPath) : process.cwd();
  return path.join(baseDir, 'client-config.json');
}

ipcMain.handle('client:get-config', () => {
  const configPath = getClientConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      return loadClientConfig(configPath);
    } else {
      // No pcId on purpose: the client falls back to the Windows computer name.
      const defaultConfig = {
        serverIp: '127.0.0.1',
        serverPort: 7894,
        serverUrl: 'ws://127.0.0.1:7894'
      };
      try {
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
      } catch (e) {}
      return defaultConfig;
    }
  } catch (err) {
    console.warn('[CLIENT CONFIG] Failed to read client-config.json:', err);
  }
  return null;
});

ipcMain.handle('client:save-config', (_event, config) => {
  const configPath = getClientConfigPath();
  try {
    saveClientConfig(configPath, config);
    return true;
  } catch (err) {
    console.error('[CLIENT CONFIG] Failed to write client-config.json:', err);
    return false;
  }
});

ipcMain.handle('client:exit-app', () => {
  app.quit();
  return true;
});

// Operator logged in on this server console. Set only by a verified login, first-admin setup
// or shift handover; privileged handlers below check it so a cashier cannot change tariffs
// or staff by calling IPC directly.
let consoleOperator: { id: number; name: string; role: number } | null = null;
const ADMIN_ROLE = 2;

function denyUnlessAdmin(action: string): { success: false; message: string } | null {
  if (consoleOperator?.role === ADMIN_ROLE) return null;
  console.warn(`[AUTH] Ditolak: ${consoleOperator?.name || 'tanpa login'} mencoba ${action}`);
  return { success: false, message: `Hanya admin yang boleh ${action}.` };
}

ipcMain.handle('server:logout-and-exit', (_event, operatorName: string) => {
  consoleOperator = null;
  DbService.logoutAndExitServer(operatorName);
  BillingEngine.stop();
  app.quit();
  return true;
});

// ==================== WINDOW CONTROL IPC ====================
ipcMain.handle('window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
    return true;
  }
  return false;
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return true;
  }
  return false;
});

ipcMain.handle('window:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
    return true;
  }
  return false;
});

ipcMain.handle('window:is-maximized', () => {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
});

// ==================== SYSTEM SERVICE IPC ====================
ipcMain.handle('system:get-running-processes', async (_event, includeSystem: boolean) => {
  return await SystemService.getRunningProcesses(includeSystem);
});

ipcMain.handle('system:kill-process', async (_event, { pid, processName, isClientRequest }: { pid: number; processName: string; isClientRequest: boolean }) => {
  return await SystemService.killProcess(pid, processName, isClientRequest);
});

ipcMain.handle('system:apply-policies', (_event, enable: boolean) => {
  SystemService.applySecurityPolicies(enable);
  return true;
});

ipcMain.handle('system:wake-on-lan', async (_event, { mac, ip }: { mac: string; ip?: string }) => {
  return await SystemService.sendWakeOnLan(mac, ip);
});

ipcMain.handle('client:cleanup-session', async () => {
  return await SessionCleanupService.executeSessionCleanup();
});

ipcMain.handle('system:get-telemetry', async (_event, pcId?: string) => {
  return await TelemetryService.getTelemetrySnapshot(pcId || 'PC-01');
});

ipcMain.handle('security:set-lockdown', (_event, locked: boolean, isAdmin?: boolean) => {
  SecurityManager.setLockdownMode(locked, isAdmin ?? false);
  return true;
});

ipcMain.handle('system:reset-audio', async (_event, volume?: number) => {
  await SessionCleanupService.resetAudioVolume(volume || 50);
  return true;
});

ipcMain.handle('system:capture-screen', async (_event, { width, height }: { width?: number; height?: number } = {}) => {
  return await SystemService.captureDesktopScreen(width || 1280, height || 720);
});

ipcMain.handle('system:shutdown', async (_event, force?: boolean) => {
  return await SystemService.executeShutdown(force ?? true);
});

ipcMain.handle('system:restart', async (_event, force?: boolean) => {
  return await SystemService.executeRestart(force ?? true);
});

ipcMain.handle('system:set-volume', async (_event, { volume, isMuted }: { volume: number; isMuted?: boolean }) => {
  return await SystemService.setSystemVolume(volume, isMuted ?? false);
});

// Windows Client Provisioning & Reversible Rollback
ipcMain.handle('system:get-provision-status', async () => {
  return await WindowsProvisioner.getStatus();
});

ipcMain.handle('system:provision-client', async () => {
  return await WindowsProvisioner.provisionClient();
});

ipcMain.handle('system:revert-provision', async () => {
  return await WindowsProvisioner.revertClient();
});

ipcMain.handle('system:open-admin-tool', async (_event, toolName: 'sound' | 'settings' | 'devmgmt' | 'network' | 'taskmgr') => {
  if (process.platform !== 'win32') return false;
  const { exec } = require('child_process');
  const { shell } = require('electron');
  try {
    switch (toolName) {
      case 'sound':
        exec('control mmsys.cpl sounds');
        break;
      case 'settings':
        await shell.openExternal('ms-settings:');
        break;
      case 'devmgmt':
        exec('devmgmt.msc');
        break;
      case 'network':
        exec('control ncpa.cpl');
        break;
      case 'taskmgr':
        exec('taskmgr.exe');
        break;
    }
    return true;
  } catch (err) {
    console.error('Failed to launch admin tool:', toolName, err);
    return false;
  }
});

// ==================== CUSTOM OS-LEVEL DESKTOP NOTIFICATION WINDOW ====================
let notificationWindow: BrowserWindow | null = null;
let notifTimer: NodeJS.Timeout | null = null;

function getNotificationHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  /* DESIGN.md dark tokens; a data: URL window cannot load index.css, so the values are copied here */
  :root {
    --surface-1: #0F1719; --surface-2: #152023; --surface-3: #1B2A2E;
    --hairline: #24363A; --hairline-strong: #31474C;
    --text-primary: #E3ECEA; --text-secondary: #B4C3C1; --text-muted: #86999A;
    --primary: #4FB3A3; --shadow: 11 18 20;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
  body {
    background: transparent;
    font-family: 'Geist', 'Segoe UI', sans-serif;
    padding: 6px;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    overflow: hidden;
  }
  .toast {
    width: 334px;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-left: 4px solid var(--primary);
    border-radius: 6px;
    box-shadow: 0 12px 32px rgb(var(--shadow) / 0.7);
    overflow: hidden;
    cursor: pointer;
    animation: slideIn 0.2s ease-out forwards;
    transition: border-color 0.15s ease;
  }
  .toast:hover { border-color: var(--hairline-strong); border-left-color: var(--primary); }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px 6px 12px;
    background: var(--surface-1);
    border-bottom: 1px solid var(--hairline);
  }
  .app-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 13px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
  }
  .close-btn:hover { color: var(--text-primary); background: var(--surface-3); }
  .body { padding: 10px 12px; }
  .title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.3;
    margin-bottom: 4px;
  }
  .message {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.4;
    word-break: break-word;
  }
  .submessage {
    font-size: 11px;
    font-family: 'Geist Mono', Consolas, monospace;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    margin-top: 5px;
  }
</style>
</head>
<body>
  <div class="toast" id="toast" onclick="onToastClick()">
    <div class="header">
      <span class="app-label" id="appLabel">GC Hub Server</span>
      <button class="close-btn" onclick="event.stopPropagation(); onCloseClick();">✕</button>
    </div>
    <div class="body">
      <div class="title" id="toastTitle"></div>
      <div class="message" id="toastMessage"></div>
      <div class="submessage" id="toastSubmessage" style="display:none;"></div>
    </div>
  </div>
  <script>
    function update(data) {
      document.getElementById('appLabel').textContent = data.appName || 'GC Hub Server';
      document.getElementById('toastTitle').textContent = data.title || '';
      document.getElementById('toastMessage').textContent = data.body || '';
      const sub = document.getElementById('toastSubmessage');
      if (data.subMessage) {
        sub.textContent = data.subMessage;
        sub.style.display = 'block';
      } else {
        sub.style.display = 'none';
      }
      const toast = document.getElementById('toast');
      toast.style.animation = 'none';
      toast.offsetHeight;
      toast.style.animation = 'slideIn 0.2s ease-out forwards';
    }
    function onToastClick() {
      const api = window.electronAPI;
      if (api?.focusMainWindow) api.focusMainWindow();
      if (api?.hideNotificationWindow) api.hideNotificationWindow();
    }
    function onCloseClick() {
      const api = window.electronAPI;
      if (api?.hideNotificationWindow) api.hideNotificationWindow();
    }
  </script>
</body>
</html>`;
}

function showCustomDesktopNotification(title: string, body: string, subMessage?: string) {
  try {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const width = 350;
    const height = 146;
    const x = primaryDisplay.workArea.x + primaryDisplay.workArea.width - width - 12;
    const y = primaryDisplay.workArea.y + primaryDisplay.workArea.height - height - 12;

    if (!notificationWindow || notificationWindow.isDestroyed()) {
      notificationWindow = new BrowserWindow({
        width,
        height,
        x,
        y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        focusable: false,
        hasShadow: false,
        show: false,
        webPreferences: {
          devTools: isDev,
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, '../preload/index.cjs'),
        }
      });

      notificationWindow.setAlwaysOnTop(true, 'status');
      notificationWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

      notificationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getNotificationHtml())}`);

      notificationWindow.webContents.on('did-finish-load', () => {
        const appName = isServerMode ? 'GC Hub Server' : 'GC Hub Client';
        const jsCode = `update(${JSON.stringify({ appName, title, body, subMessage })})`;
        notificationWindow?.webContents.executeJavaScript(jsCode).catch(() => {});
        notificationWindow?.setBounds({ x, y, width, height });
        notificationWindow?.showInactive();
      });
    } else {
      notificationWindow.setBounds({ x, y, width, height });
      const appName = isServerMode ? 'GC Hub Server' : 'GC Hub Client';
      const jsCode = `update(${JSON.stringify({ appName, title, body, subMessage })})`;
      notificationWindow.webContents.executeJavaScript(jsCode).catch(() => {});
      notificationWindow.showInactive();
    }

    if (notifTimer) clearTimeout(notifTimer);
    notifTimer = setTimeout(() => {
      if (notificationWindow && !notificationWindow.isDestroyed()) {
        notificationWindow.hide();
      }
    }, 4200);
  } catch (err) {
    console.warn('[NOTIFICATION] Error creating desktop notification window:', err);
  }
}

ipcMain.handle('system:show-notification', (_event, { title, body, subMessage }: { title: string; body: string; subMessage?: string }) => {
  showCustomDesktopNotification(title, body, subMessage);
  return true;
});

ipcMain.handle('window:focus-main', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  return true;
});

ipcMain.handle('window:hide-notification', () => {
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.hide();
  }
  return true;
});

ipcMain.handle('system:launch-vnc-viewer', async (_event, { ip }: { ip: string; pcName?: string }) => {
  if (process.platform !== 'win32') return { success: false, message: 'Hanya didukung di Windows.' };
  const { execFile } = require('child_process');
  const targetIp = (ip || '127.0.0.1').trim();
  if (!isIP(targetIp)) return { success: false, message: `Alamat IP tidak valid: ${targetIp}` };

  // Check UltraVNC / TightVNC / Portable viewer
  const possibleVncPaths = [
    path.resolve(process.cwd(), 'bin/vncviewer.exe'),
    path.resolve(process.cwd(), 'vncviewer.exe'),
    path.resolve(path.dirname(process.execPath), 'bin/vncviewer.exe'),
    path.resolve(path.dirname(process.execPath), 'vncviewer.exe'),
    'C:\\Program Files\\uvnc bvba\\UltraVNC\\vncviewer.exe',
    'C:\\Program Files (x86)\\uvnc bvba\\UltraVNC\\vncviewer.exe',
    'C:\\Program Files\\TightVNC\\tvnviewer.exe',
    'C:\\Program Files (x86)\\TightVNC\\tvnviewer.exe'
  ];

  const foundVnc = possibleVncPaths.find(p => fs.existsSync(p));

  if (foundVnc) {
    execFile(foundVnc, [`${targetIp}:5900`], (err: any) => {
      if (err) console.warn('[VNC LAUNCHER] Error starting VNC viewer:', err);
    });
    return { success: true, tool: 'UltraVNC', message: `Membuka UltraVNC ke ${targetIp}...` };
  } else {
    execFile('mstsc.exe', [`/v:${targetIp}`, '/f'], (err: any) => {
      if (err) console.warn('[MSTSC LAUNCHER] Error starting mstsc:', err);
    });
    return { success: true, tool: 'MSTSC', message: `Membuka Windows Remote Desktop (MSTSC) ke ${targetIp}...` };
  }
});

// ==================== DATABASE & BILLING ENGINE IPC ====================
ipcMain.handle('db:get-workstations', () => {
  return BillingEngine.getLiveWorkstations();
});

ipcMain.handle('db:get-members', () => {
  return DbService.getMembers();
});

ipcMain.handle('db:create-member', (_event, data) => {
  return DbService.createMember(data);
});

ipcMain.handle('db:update-member', (_event, { id, data }) => {
  DbService.updateMember(id, data);
  return true;
});

ipcMain.handle('db:delete-member', (_event, id) => {
  DbService.deleteMember(id);
  return true;
});

ipcMain.handle('db:topup-member', (_event, { id, amount, staff }) => {
  return DbService.topUpMember(id, amount, staff);
});

ipcMain.handle('db:get-packages', () => {
  return DbService.getPackages();
});

ipcMain.handle('db:save-packages', (_event, packages) => {
  const denied = denyUnlessAdmin('mengubah paket');
  if (denied) return denied;
  DbService.savePackages(packages);
  return { success: true };
});

ipcMain.handle('db:get-rates', () => {
  return DbService.getChargingRates();
});

ipcMain.handle('db:save-rates', (_event, rates) => {
  const denied = denyUnlessAdmin('mengubah tarif personal');
  if (denied) return denied;
  DbService.saveChargingRates(rates);
  return { success: true };
});

ipcMain.handle('db:get-transactions', (_event, params) => {
  const { limit, startDate, endDate } = (params && typeof params === 'object') ? params : { limit: params, startDate: undefined, endDate: undefined };
  return DbService.getTransactions(limit || 500, startDate, endDate);
});

ipcMain.handle('db:save-setting', (_event, { key, value }) => {
  // Every setting saved from the UI is admin-level (billing rules, cloud credentials).
  const denied = denyUnlessAdmin('mengubah pengaturan');
  if (denied) return denied;
  DbService.setSetting(key, value);
  return { success: true };
});

ipcMain.handle('db:list-backups', () => ({ dir: BACKUP_DIR, files: listBackups() }));

ipcMain.handle('db:backup-now', async () => {
  const denied = denyUnlessAdmin('membuat backup');
  if (denied) return denied;
  const file = await backupDatabase(true);
  return file ? { success: true, message: `Backup tersimpan: ${path.basename(file)}` } : { success: false, message: 'Backup gagal. Cek ruang disk dan izin folder data.' };
});

// Restoring replaces every transaction recorded after the backup, so running sessions and unpaid
// bills (both only in this database) block it. The swap happens on restart, see stageRestore.
ipcMain.handle('db:restore-backup', async (_event, name: unknown) => {
  const denied = denyUnlessAdmin('memulihkan backup');
  if (denied) return denied;
  if (typeof name !== 'string' || !name) return { success: false, message: 'Pilih file backup yang mau dipulihkan.' };
  if (BillingEngine.hasActiveSessions()) {
    return { success: false, message: 'Masih ada sesi berjalan. Akhiri semua sesi dulu sebelum memulihkan backup.' };
  }
  if (DbService.getWorkstations().some(w => w.state === 'unpaid')) {
    return { success: false, message: 'Masih ada tagihan belum bayar. Lunasi dulu sebelum memulihkan backup.' };
  }
  const res = await stageRestore(name, consoleOperator!.name);
  if (!res.success) return res;
  // Let the renderer show the answer first, then restart so the file is swapped before it opens
  setTimeout(() => {
    app.relaunch();
    app.quit();
  }, 2500);
  return res;
});

ipcMain.handle('db:open-backup-folder', async () => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const err = await shell.openPath(BACKUP_DIR);
  return err ? { success: false, message: err } : { success: true };
});

// The Supabase service key is a master key to the cloud database: it never leaves the main process,
// the UI only learns whether one is stored. The LAN key unlocks booth admin actions offline, so admin only.
ipcMain.handle('db:get-setting', (_event, key) => {
  if (key === 'supabaseServiceKey') return !!DbService.getSetting(key);
  if (key === 'lan_secret' && denyUnlessAdmin('melihat Kunci LAN')) return null;
  return DbService.getSetting(key);
});

ipcMain.handle('db:correct-transaction', (_event, params) => {
  const denied = denyUnlessAdmin('mengoreksi transaksi');
  if (denied) return denied;
  const { id, price, note } = (params && typeof params === 'object') ? params : ({} as any);
  return DbService.correctTransaction(Number(id), Number(price), note, consoleOperator!.name);
});

ipcMain.handle('db:delete-transaction', (_event, id) => {
  const denied = denyUnlessAdmin('menghapus transaksi');
  if (denied) return denied;
  return DbService.deleteTransaction(Number(id), consoleOperator!.name);
});

ipcMain.handle('db:get-coupons', () => {
  return DbService.getCoupons();
});

ipcMain.handle('db:generate-coupons', (_event, params) => {
  return DbService.generateCouponsBatch(params);
});

ipcMain.handle('db:redeem-coupon', (_event, { code, username }) => {
  return DbService.redeemCoupon(code, username);
});

ipcMain.handle('db:delete-coupon', (_event, id) => {
  DbService.deleteCoupon(id);
  return true;
});

ipcMain.handle('db:get-shift-status', () => {
  return DbService.getShiftStatus();
});

ipcMain.handle('db:set-shift-enabled', (_event, enabled: boolean) => {
  return denyUnlessAdmin('mengatur sistem shift') ?? DbService.setShiftEnabled(!!enabled, consoleOperator?.name);
});

ipcMain.handle('db:get-active-shift', () => {
  return DbService.getActiveShiftSummary();
});

ipcMain.handle('db:close-shift-handover', (_event, params) => {
  const result = DbService.closeShiftHandover(params);
  if (result.success && result.operator) consoleOperator = result.operator;
  return result;
});

ipcMain.handle('db:get-shift-history', (_event, limit) => {
  return DbService.getShiftHistory(limit);
});

ipcMain.handle('db:has-admin-account', () => {
  return DbService.hasAdminAccount();
});

ipcMain.handle('db:setup-initial-admin', (_event, params) => {
  const result = DbService.setupInitialAdmin(params);
  if (result.success && result.employee) consoleOperator = result.employee;
  return result;
});

ipcMain.handle('db:get-employees', () => {
  return DbService.getEmployees();
});

ipcMain.handle('db:verify-employee-login', (_event, params) => {
  const result = DbService.verifyEmployeeLogin(params);
  if (result.success && result.employee) consoleOperator = result.employee;
  return result;
});

ipcMain.handle('db:create-employee', (_event, params) => {
  return denyUnlessAdmin('menambah staf') ?? DbService.createEmployee(params);
});

ipcMain.handle('db:update-employee', (_event, { id, params }) => {
  return denyUnlessAdmin('mengubah staf') ?? DbService.updateEmployee(id, params);
});

ipcMain.handle('db:delete-employee', (_event, id) => {
  return denyUnlessAdmin('menghapus staf') ?? DbService.deleteEmployee(id);
});

ipcMain.handle('db:lock-server-console', (_event, operatorName) => {
  consoleOperator = null;
  return DbService.lockServerConsole(operatorName);
});

ipcMain.handle('db:generate-guest-token', (_event, params) => {
  return DbService.generateGuestToken(params);
});

ipcMain.handle('db:generate-guest-token-batch', (_event, { count, durationMinutes, price }) => {
  return DbService.generateGuestTokenBatch(count, durationMinutes, price);
});

// Engine Controls
ipcMain.handle('engine:start-session', (_event, { pcId, params }) => {
  return BillingEngine.startSession(pcId, params);
});

ipcMain.handle('engine:pause-session', (_event, pcId) => {
  BillingEngine.pauseSession(pcId);
  return true;
});

ipcMain.handle('engine:resume-session', (_event, pcId) => {
  BillingEngine.resumeSession(pcId);
  return true;
});

ipcMain.handle('engine:stop-session', (_event, { pcId, reason }) => {
  BillingEngine.stopSession(pcId, reason);
  return true;
});

ipcMain.handle('engine:settle-unpaid', (_event, pcId: string) => {
  if (typeof pcId !== 'string' || !pcId.trim()) return { success: false, message: 'PC tidak valid.' };
  return BillingEngine.settleUnpaid(pcId, consoleOperator?.name || 'Operator');
});

ipcMain.handle('engine:extend-session', (_event, { pcId, extraMinutes, price, packageName }) => {
  return BillingEngine.extendSession(pcId, extraMinutes, price, packageName);
});

ipcMain.handle('engine:replace-package', (_event, { pcId, newMinutes, price, packageName }) => {
  return BillingEngine.replacePackage(pcId, newMinutes, price, packageName);
});

ipcMain.handle('engine:add-stacked-package', (_event, { pcId, extraMinutes, price, packageName }) => {
  return BillingEngine.addStackedPackage(pcId, extraMinutes, price, packageName);
});

ipcMain.handle('engine:refund-session', (_event, { pcId, reason, refundToBalance, customAmount, penaltyPercent, refundMode }) => {
  return BillingEngine.refundSession(pcId, { reason, refundToBalance, customAmount, penaltyPercent, refundMode });
});

ipcMain.handle('engine:simulate-elapsed', (_event, { pcId, elapsedMinutes }) => {
  // Dev-only billing fast-forward; a packaged build must never let the cashier rewrite session time
  if (app.isPackaged) return false;
  return BillingEngine.simulateSessionElapsed(pcId, elapsedMinutes);
});

ipcMain.handle('engine:transfer-session', (_event, { fromPcId, toPcId }) => {
  return BillingEngine.transferSession(fromPcId, toPcId);
});

ipcMain.handle('engine:delete-workstation', (_event, pcId) => {
  BillingEngine.deleteWorkstation(pcId);
  return true;
});

ipcMain.handle('engine:add-workstation', (_event, data) => {
  return BillingEngine.addWorkstation(data);
});

ipcMain.handle('engine:update-workstation-settings', (_event, items) => {
  const denied = denyUnlessAdmin('mengubah tarif PC');
  if (denied) return denied;
  const result = BillingEngine.updateWorkstationSettings(items);
  if (result.success) DbService.addSystemLog({ type: 'server', event: 'Tarif PC diubah', details: `${result.updated} PC`, operator: consoleOperator!.name });
  return result;
});

ipcMain.handle('engine:add-workstation-batch', (_event, { prefix, fromNum, toNum, groupName, pricePerHour }) => {
  return BillingEngine.addWorkstationBatch(String(prefix ?? ''), fromNum, toNum, groupName, pricePerHour);
});

// Network Bridge IPC
// Admin only; the round trip with the booth lives in src/server/network/pcRename.ts
ipcMain.handle('server:rename-pc', async (_event, { pcId, name }: { pcId: unknown; name: unknown }) => {
  const denied = denyUnlessAdmin('mengganti nama PC');
  if (denied) return denied;
  return requestPcRename(pcId, name);
});

ipcMain.handle('server:send-to-client', (_event, { pcId, op, payload }: { pcId: string; op: OpCode; payload?: any }) => {
  if (!isServerMode) return false;
  return ServerNetworkBridge.sendToClient(pcId, op, payload);
});

ipcMain.handle('server:broadcast', (_event, { op, payload }: { op: OpCode; payload?: any }) => {
  if (!isServerMode) return false;
  ServerNetworkBridge.broadcast(op, payload);
  return true;
});

// ==================== POS & F&B ORDERING IPC ====================
ipcMain.handle('pos:get-categories', () => {
  return DbService.getCategories();
});

ipcMain.handle('pos:save-category', (_event, data) => {
  const denied = denyUnlessAdmin('mengubah kategori produk');
  if (denied) return denied;
  const result = DbService.saveCategory(data);
  ServerNetworkBridge.broadcast(OpCode.REMOTE_COMMAND, {
    action: 'sync_catalog',
    params: {
      products: DbService.getBoothProducts(),
      categories: DbService.getCategories()
    }
  });
  return result;
});

ipcMain.handle('pos:delete-category', (_event, id) => {
  const denied = denyUnlessAdmin('menghapus kategori produk');
  if (denied) return denied;
  const result = DbService.deleteCategory(id);
  if (result.success) {
    ServerNetworkBridge.broadcast(OpCode.REMOTE_COMMAND, {
      action: 'sync_catalog',
      params: {
        products: DbService.getBoothProducts(),
        categories: DbService.getCategories()
      }
    });
  }
  return result;
});

ipcMain.handle('pos:counter-sale', (_event, items) => {
  return DbService.counterSale({ items, staff: consoleOperator?.name || 'Kasir' });
});

ipcMain.handle('pos:get-products', () => {
  return DbService.getProducts();
});

// Cost and margin are the owner's numbers, so admin only
ipcMain.handle('pos:get-fnb-margin', (_event, params: { startDate?: unknown; endDate?: unknown; staff?: unknown }) => {
  const denied = denyUnlessAdmin('melihat laba F&B');
  if (denied) return denied;
  const margin = DbService.getFnbMargin(String(params?.startDate ?? ''), String(params?.endDate ?? ''), typeof params?.staff === 'string' ? params.staff : '');
  return margin ? { success: true, margin } : { success: false, message: 'Rentang tanggal tidak valid.' };
});

ipcMain.handle('pos:save-product', (_event, data) => {
  const denied = denyUnlessAdmin('mengubah produk');
  if (denied) return denied;
  const result = DbService.saveProductChecked(data);
  if (!result.success) return result;
  ServerNetworkBridge.broadcast(OpCode.REMOTE_COMMAND, {
    action: 'sync_catalog',
    params: {
      products: DbService.getBoothProducts(),
      categories: DbService.getCategories()
    }
  });
  return result;
});

ipcMain.handle('pos:delete-product', (_event, id) => {
  const denied = denyUnlessAdmin('menghapus produk');
  if (denied) return denied;
  DbService.deleteProduct(id);
  ServerNetworkBridge.broadcast(OpCode.REMOTE_COMMAND, {
    action: 'sync_catalog',
    params: {
      products: DbService.getBoothProducts(),
      categories: DbService.getCategories()
    }
  });
  return true;
});

ipcMain.handle('pos:adjust-stock', (_event, params) => {
  const denied = denyUnlessAdmin('mengoreksi stok');
  if (denied) return denied;
  const result = DbService.adjustStock(params);
  if (result.success) {
    ServerNetworkBridge.broadcast(OpCode.REMOTE_COMMAND, {
      action: 'sync_catalog',
      params: {
        products: DbService.getBoothProducts(),
        categories: DbService.getCategories()
      }
    });
  }
  return result;
});

ipcMain.handle('pos:restock-product', (_event, { productId, addedStock, costPrice }) => {
  // Any logged-in operator may restock; the name in the log comes from the session, not the screen.
  if (!consoleOperator) return { success: false, message: 'Login kasir dulu untuk menambah stok.' };
  const result = DbService.restockProduct(Number(productId), Number(addedStock), costPrice, consoleOperator.name);
  if (result.success) {
    ServerNetworkBridge.broadcast(OpCode.REMOTE_COMMAND, {
      action: 'sync_catalog',
      params: {
        products: DbService.getBoothProducts(),
        categories: DbService.getCategories()
      }
    });
  }
  return result;
});

ipcMain.handle('pos:get-low-stock', () => {
  return DbService.getLowStockProducts();
});

ipcMain.handle('pos:get-inventory-summary', () => {
  return DbService.getInventorySummary();
});

ipcMain.handle('pos:broadcast-catalog', () => {
  ServerNetworkBridge.broadcast(OpCode.REMOTE_COMMAND, {
    action: 'sync_catalog',
    params: {
      products: DbService.getBoothProducts(),
      categories: DbService.getCategories()
    }
  });
  return true;
});

ipcMain.handle('pos:get-pending-orders', () => {
  return DbService.getPendingOrders();
});

ipcMain.handle('pos:create-order', (_event, data) => {
  const order = DbService.createOrder(data);
  BillingEngine.setPendingOrder(order.pcId, order);
  return order;
});

ipcMain.handle('pos:approve-order', (_event, { orderLogId, payMethod, staff }) => {
  const result = DbService.approveOrder({ orderLogId, payMethod, staff });
  if (result.success && result.order) {
    BillingEngine.clearPendingOrder(result.order.pcId, result.order.id);

    ServerNetworkBridge.sendToClient(result.order.pcId, OpCode.ORDER_STATUS_UPDATE, {
      orderId: result.order.orderCode,
      status: 'Disetujui',
      message: `Pesanan F&B Anda (Rp ${result.order.totalPrice.toLocaleString('id-ID')}) telah disetujui kasir (${result.order.payMethodText}) dan sedang diantar.`
    });
  }
  return result;
});

ipcMain.handle('pos:reject-order', (_event, { orderLogId, reason, staff }) => {
  const result = DbService.rejectOrder({ orderLogId, reason, staff });
  if (result.success && result.order) {
    BillingEngine.clearPendingOrder(result.order.pcId, result.order.id);

    ServerNetworkBridge.sendToClient(result.order.pcId, OpCode.ORDER_STATUS_UPDATE, {
      orderId: result.order.orderCode,
      status: 'Ditolak',
      message: `Mohon maaf, pesanan F&B Anda ditolak kasir: ${reason || 'Stok habis'}.`
    });
  }
  return result;
});

ipcMain.handle('pos:get-orders', (_event, limit) => {
  return DbService.getOrders(limit);
});

// ==================== CLOUD BOOKING IPC ====================
ipcMain.handle('supabase:cloud-status', () => SupabaseSyncService.getStatus());

ipcMain.handle('supabase:list-bookings', async () => {
  const result = await SupabaseSyncService.listOpenBookings();
  const workstations = BillingEngine.getLiveWorkstations();
  const links = SupabaseSyncService.getBookingLinks();
  const linkedPcByBooking = new Map(Object.entries(links).map(([pc, id]) => [id, pc]));
  return {
    ...result,
    status: SupabaseSyncService.getStatus(),
    bookings: result.bookings.map(b => ({
      ...b,
      localPcName: b.pc_id ? localPcName(b.pc_id, workstations) : null,
      runningOnPc: linkedPcByBooking.get(b.id) || null,
    })),
  };
});

ipcMain.handle('supabase:start-booking', (_event, { bookingId, pcName }: { bookingId: string; pcName: string }) => {
  const booking = SupabaseSyncService.getCachedBooking(bookingId);
  if (!booking) return { success: false, message: 'Booking tidak ditemukan. Muat ulang daftar booking.' };
  return startBookingOnPc(booking, pcName);
});

ipcMain.handle('supabase:reassign-booking', (_event, { bookingId, pcName }: { bookingId: string; pcName: string }) => {
  if (!findWorkstation(pcName)) return { success: false, message: `PC ${pcName} tidak terdaftar.` };
  SupabaseSyncService.reassignBooking(bookingId, cloudPcId(pcName));
  return { success: true, message: `Booking dialihkan ke ${pcName}.` };
});

ipcMain.handle('supabase:reject-booking', (_event, { bookingId, reason }: { bookingId: string; reason?: string }) => {
  SupabaseSyncService.rejectBooking(bookingId, (reason || '').trim() || 'Dibatalkan kasir');
  return { success: true, message: 'Booking dibatalkan.' };
});

app.whenReady().then(createWindow);

let isCleanExitDone = false;
function performGracefulExit() {
  if (isCleanExitDone) return;
  isCleanExitDone = true;
  console.log('[MAIN] Performing graceful shutdown and flushing persistent data...');
  try {
    if (isServerMode) {
      // Clear all expected_empty_time so web companion stops countdown after server exits
      SupabaseSyncService.clearAllExpectedEmptyTimes().catch(() => {});
      BillingEngine.stop();
      ServerNetworkBridge.stop();
    } else {
      SecurityManager.dispose();
      SystemService.applySecurityPolicies(false);
    }
  } catch (err) {
    console.error('[MAIN] Error during graceful shutdown:', err);
  }
}

app.on('before-quit', () => {
  performGracefulExit();
});

app.on('will-quit', () => {
  performGracefulExit();
});

app.on('window-all-closed', () => {
  performGracefulExit();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
