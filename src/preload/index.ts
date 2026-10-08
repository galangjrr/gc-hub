import { contextBridge, ipcRenderer } from 'electron';
import { OpCode, type Packet } from '../shared/protocol';

// Expose safe API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Client & Server Window Control APIs
  setDesktopOverlayMode: (isOverlay: boolean, options?: { isIsland?: boolean; width?: number; height?: number }) => ipcRenderer.invoke('client:set-desktop-overlay-mode', isOverlay, options),
  moveWindow: (deltaX: number, deltaY: number) => ipcRenderer.invoke('client:move-window', { deltaX, deltaY }),
  setWidgetMouseInteractive: (interactive: boolean) => ipcRenderer.invoke('client:set-widget-mouse-interactive', interactive),
  injectRemoteInput: (action: string, params?: any) => ipcRenderer.invoke('client:inject-remote-input', { action, params }),
  exitApp: () => ipcRenderer.invoke('client:exit-app'),
  logoutAndExitServer: (operatorName: string) => ipcRenderer.invoke('server:logout-and-exit', operatorName),
  getClientConfig: () => ipcRenderer.invoke('client:get-config'),
  getMachineInfo: () => ipcRenderer.invoke('client:get-machine-info'),
  saveClientConfig: (config: { serverUrl: string; pcId?: string; lanSecret?: string }) => ipcRenderer.invoke('client:save-config', config),
  setPcName: (name: string) => ipcRenderer.invoke('client:set-pc-name', name),
  beginAdminAuth: () => ipcRenderer.invoke('client:admin-challenge'),
  confirmAdminGrant: (grant?: string) => ipcRenderer.invoke('client:admin-grant', grant),
  verifyAdminLanKey: (key: string) => ipcRenderer.invoke('client:admin-lan-key', key),
  endAdminGrant: () => ipcRenderer.invoke('client:admin-end'),
  lanSign: (packet: Packet) => ipcRenderer.invoke('lan:sign', packet),
  lanVerify: (packet: Packet) => ipcRenderer.invoke('lan:verify', packet),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  focusMainWindow: () => ipcRenderer.invoke('window:focus-main'),
  hideNotificationWindow: () => ipcRenderer.invoke('window:hide-notification'),

  // Native Process & Security APIs
  getRunningProcesses: (includeSystem?: boolean) => ipcRenderer.invoke('system:get-running-processes', includeSystem),
  killProcess: (pid: number, processName: string, isClientRequest?: boolean) => ipcRenderer.invoke('system:kill-process', { pid, processName, isClientRequest }),
  setLockdownMode: (locked: boolean) => ipcRenderer.invoke('security:set-lockdown', locked),
  getKioskEnabled: () => ipcRenderer.invoke('system:get-kiosk'),
  setKioskEnabled: (enabled: boolean) => ipcRenderer.invoke('system:set-kiosk', enabled),
  getExePolicy: () => ipcRenderer.invoke('system:get-exe-policy'),
  setExePolicy: (policy: { mode: string; allowPaths: string[] }) => ipcRenderer.invoke('system:set-exe-policy', policy),
  cleanupSession: () => ipcRenderer.invoke('client:cleanup-session'),
  getTelemetry: (pcId?: string) => ipcRenderer.invoke('system:get-telemetry', pcId),
  resetAudioVolume: (volume?: number) => ipcRenderer.invoke('system:reset-audio', volume),
  captureScreen: (params?: { width?: number; height?: number }) => ipcRenderer.invoke('system:capture-screen', params),
  showNativeNotification: (title: string, body: string, subMessage?: string) => ipcRenderer.invoke('system:show-notification', { title, body, subMessage }),
  launchVncViewer: (ip: string, pcName: string) => ipcRenderer.invoke('system:launch-vnc-viewer', { ip, pcName }),
  executeShutdown: (force?: boolean) => ipcRenderer.invoke('system:shutdown', force),
  executeRestart: (force?: boolean) => ipcRenderer.invoke('system:restart', force),
  setSystemVolume: (volume: number, isMuted?: boolean) => ipcRenderer.invoke('system:set-volume', { volume, isMuted }),
  wakeOnLan: (mac: string, ip?: string) => ipcRenderer.invoke('system:wake-on-lan', { mac, ip }),
  getProvisionStatus: () => ipcRenderer.invoke('system:get-provision-status'),
  provisionClient: () => ipcRenderer.invoke('system:provision-client'),
  revertProvision: () => ipcRenderer.invoke('system:revert-provision'),
  openAdminTool: (toolName: 'sound' | 'settings' | 'devmgmt' | 'network' | 'taskmgr') => ipcRenderer.invoke('system:open-admin-tool', toolName),

  // Server Network APIs
  sendToClient: (pcId: string, op: OpCode, payload?: any) => ipcRenderer.invoke('server:send-to-client', { pcId, op, payload }),
  renamePc: (pcId: string, name: string) => ipcRenderer.invoke('server:rename-pc', { pcId, name }),
  broadcastToClients: (op: OpCode, payload?: any) => ipcRenderer.invoke('server:broadcast', { op, payload }),
  setClientKiosk: (pcId: string, enabled: boolean) => ipcRenderer.invoke('server:set-kiosk', { pcId, enabled }),
  getExePolicySettings: () => ipcRenderer.invoke('server:get-exe-policy'),
  saveExePolicySettings: (settings: { defaultMode: string; allowPaths: string[] }) => ipcRenderer.invoke('server:save-exe-policy', settings),
  setPcExeMode: (pcName: string, mode: string | null) => ipcRenderer.invoke('server:set-pc-exe-mode', { pcName, mode }),

  // Database APIs
  getWorkstations: () => ipcRenderer.invoke('db:get-workstations'),
  getMembers: () => ipcRenderer.invoke('db:get-members'),
  createMember: (data: any) => ipcRenderer.invoke('db:create-member', data),
  updateMember: (id: number, data: any) => ipcRenderer.invoke('db:update-member', { id, data }),
  deleteMember: (id: number) => ipcRenderer.invoke('db:delete-member', id),
  topUpMember: (id: number, amount: number, staff: string) => ipcRenderer.invoke('db:topup-member', { id, amount, staff }),
  getPackages: () => ipcRenderer.invoke('db:get-packages'),
  savePackages: (packages: any[]) => ipcRenderer.invoke('db:save-packages', packages),
  getRates: () => ipcRenderer.invoke('db:get-rates'),
  saveRates: (rates: any[]) => ipcRenderer.invoke('db:save-rates', rates),
  getTransactions: (params?: number | { limit?: number; startDate?: string; endDate?: string }) => ipcRenderer.invoke('db:get-transactions', params),
  correctTransaction: (id: number, price: number, note: string) => ipcRenderer.invoke('db:correct-transaction', { id, price, note }),
  deleteTransaction: (id: number) => ipcRenderer.invoke('db:delete-transaction', id),
  getCoupons: () => ipcRenderer.invoke('db:get-coupons'),
  generateCoupons: (params: any) => ipcRenderer.invoke('db:generate-coupons', params),
  redeemCoupon: (code: string, username: string) => ipcRenderer.invoke('db:redeem-coupon', { code, username }),
  deleteCoupon: (id: number) => ipcRenderer.invoke('db:delete-coupon', id),
  getActiveShift: () => ipcRenderer.invoke('db:get-active-shift'),
  getShiftStatus: () => ipcRenderer.invoke('db:get-shift-status'),
  setShiftEnabled: (enabled: boolean) => ipcRenderer.invoke('db:set-shift-enabled', enabled),
  closeShiftHandover: (params: any) => ipcRenderer.invoke('db:close-shift-handover', params),
  getShiftHistory: (limit?: number) => ipcRenderer.invoke('db:get-shift-history', limit),
  hasAdminAccount: () => ipcRenderer.invoke('db:has-admin-account'),
  setupInitialAdmin: (params: { username: string; password: string; phone?: string }) => ipcRenderer.invoke('db:setup-initial-admin', params),
  getEmployees: () => ipcRenderer.invoke('db:get-employees'),
  verifyEmployeeLogin: (params: { username: string; password: string }) => ipcRenderer.invoke('db:verify-employee-login', params),
  createEmployee: (params: any) => ipcRenderer.invoke('db:create-employee', params),
  updateEmployee: (id: number, params: any) => ipcRenderer.invoke('db:update-employee', { id, params }),
  deleteEmployee: (id: number) => ipcRenderer.invoke('db:delete-employee', id),
  lockServerConsole: (operatorName: string) => ipcRenderer.invoke('db:lock-server-console', operatorName),
  generateGuestToken: (params: any) => ipcRenderer.invoke('db:generate-guest-token', params),
  generateGuestTokenBatch: (params: { count: number; durationMinutes: number; price?: number }) => ipcRenderer.invoke('db:generate-guest-token-batch', params),

  // Authoritative Engine APIs
  startSession: (pcId: string, params: any) => ipcRenderer.invoke('engine:start-session', { pcId, params }),
  pauseSession: (pcId: string) => ipcRenderer.invoke('engine:pause-session', pcId),
  resumeSession: (pcId: string) => ipcRenderer.invoke('engine:resume-session', pcId),
  stopSession: (pcId: string, reason?: string) => ipcRenderer.invoke('engine:stop-session', { pcId, reason }),
  settleUnpaid: (pcId: string) => ipcRenderer.invoke('engine:settle-unpaid', pcId),
  extendSession: (pcId: string, extraMinutes: number, price: number, packageName?: string) => ipcRenderer.invoke('engine:extend-session', { pcId, extraMinutes, price, packageName }),
  replacePackage: (pcId: string, newMinutes: number, price: number, packageName: string) => ipcRenderer.invoke('engine:replace-package', { pcId, newMinutes, price, packageName }),
  addStackedPackage: (pcId: string, extraMinutes: number, price: number, packageName: string) => ipcRenderer.invoke('engine:add-stacked-package', { pcId, extraMinutes, price, packageName }),
  simulateSessionElapsed: (pcId: string, elapsedMinutes: number) => ipcRenderer.invoke('engine:simulate-elapsed', { pcId, elapsedMinutes }),
  transferSession: (fromPcId: string, toPcId: string) => ipcRenderer.invoke('engine:transfer-session', { fromPcId, toPcId }),
  refundSession: (
    pcId: string, 
    options?: { reason?: string; refundToBalance?: boolean; customAmount?: number; penaltyPercent?: number; refundMode?: 'full' | 'queued_only' }
  ) => ipcRenderer.invoke('engine:refund-session', { pcId, ...options }),

  deleteWorkstation: (pcId: string) => ipcRenderer.invoke('engine:delete-workstation', pcId),
  addWorkstation: (data: any) => ipcRenderer.invoke('engine:add-workstation', data),
  updateWorkstationSettings: (items: { id: number; groupName: string; pricePerHour: number }[]) => ipcRenderer.invoke('engine:update-workstation-settings', items),
  editWorkstation: (pcId: string, data: any) => ipcRenderer.invoke('engine:edit-workstation', { pcId, data }),
  addWorkstationBatch: (params: { prefix: string; fromNum: number; toNum: number; groupName?: string; pricePerHour?: number }) => ipcRenderer.invoke('engine:add-workstation-batch', params),

  // Real-time Event Subscriptions
  onWorkstationsUpdated: (callback: (workstations: any[]) => void) => {
    const handler = (_event: any, data: any[]) => callback(data);
    ipcRenderer.on('engine:workstations-updated', handler);
    return () => ipcRenderer.removeListener('engine:workstations-updated', handler);
  },
  onTransactionAdded: (callback: (tx: any) => void) => {
    const handler = (_event: any, tx: any) => callback(tx);
    ipcRenderer.on('db:transaction-added', handler);
    return () => ipcRenderer.removeListener('db:transaction-added', handler);
  },
  onScreenCaptureUpdated: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('client:screen-capture-update', handler);
    return () => ipcRenderer.removeListener('client:screen-capture-update', handler);
  },
  onProcessListUpdated: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('client:process-list-update', handler);
    return () => ipcRenderer.removeListener('client:process-list-update', handler);
  },
  onKillProcessResult: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('client:kill-process-result', handler);
    return () => ipcRenderer.removeListener('client:kill-process-result', handler);
  },
  onClientChatReply: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('client:chat-reply', handler);
    return () => ipcRenderer.removeListener('client:chat-reply', handler);
  },

  // POS & F&B Ordering APIs
  getPosCategories: () => ipcRenderer.invoke('pos:get-categories'),
  savePosCategory: (data: any) => ipcRenderer.invoke('pos:save-category', data),
  deletePosCategory: (id: number) => ipcRenderer.invoke('pos:delete-category', id),
  getPosProducts: () => ipcRenderer.invoke('pos:get-products'),
  counterSale: (items: Array<{ productId: number; quantity: number }>) => ipcRenderer.invoke('pos:counter-sale', items),
  savePosProduct: (data: any) => ipcRenderer.invoke('pos:save-product', data),
  deletePosProduct: (id: number) => ipcRenderer.invoke('pos:delete-product', id),
  adjustPosStock: (params: any) => ipcRenderer.invoke('pos:adjust-stock', params),
  restockPosProduct: (params: any) => ipcRenderer.invoke('pos:restock-product', params),
  getPosLowStock: () => ipcRenderer.invoke('pos:get-low-stock'),
  getPosInventorySummary: () => ipcRenderer.invoke('pos:get-inventory-summary'),
  broadcastPosCatalog: () => ipcRenderer.invoke('pos:broadcast-catalog'),
  getPendingOrders: () => ipcRenderer.invoke('pos:get-pending-orders'),
  createPosOrder: (data: any) => ipcRenderer.invoke('pos:create-order', data),
  approvePosOrder: (params: { orderLogId: number; payMethod: 'cash' | 'saldo'; staff?: string }) => ipcRenderer.invoke('pos:approve-order', params),
  rejectPosOrder: (params: { orderLogId: number; reason?: string; staff?: string }) => ipcRenderer.invoke('pos:reject-order', params),
  getPosOrders: (limit?: number) => ipcRenderer.invoke('pos:get-orders', limit),
  onOrderReceived: (callback: (order: any) => void) => {
    const handler = (_event: any, order: any) => callback(order);
    ipcRenderer.on('pos:order-received', handler);
    return () => ipcRenderer.removeListener('pos:order-received', handler);
  },

  // Cloud Booking & Supabase Sync APIs (bekerja offline lewat outbox)
  getCloudStatus: () => ipcRenderer.invoke('supabase:cloud-status'),
  listBookings: () => ipcRenderer.invoke('supabase:list-bookings'),
  startBooking: (bookingId: string, pcName: string) => ipcRenderer.invoke('supabase:start-booking', { bookingId, pcName }),
  reassignBooking: (bookingId: string, pcName: string) => ipcRenderer.invoke('supabase:reassign-booking', { bookingId, pcName }),
  rejectBooking: (bookingId: string, reason?: string) => ipcRenderer.invoke('supabase:reject-booking', { bookingId, reason }),
  onNewBooking: (callback: (booking: any) => void) => {
    const handler = (_event: any, booking: any) => callback(booking);
    ipcRenderer.on('supabase:new-booking', handler);
    return () => ipcRenderer.removeListener('supabase:new-booking', handler);
  },
  onBookingsChanged: (callback: (change: any) => void) => {
    const handler = (_event: any, change: any) => callback(change);
    ipcRenderer.on('supabase:bookings-changed', handler);
    return () => ipcRenderer.removeListener('supabase:bookings-changed', handler);
  },
  onBookingActivation: (callback: (result: any) => void) => {
    const handler = (_event: any, result: any) => callback(result);
    ipcRenderer.on('supabase:booking-activation', handler);
    return () => ipcRenderer.removeListener('supabase:booking-activation', handler);
  },

  // Auto-Update APIs
  checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('updater:quit-and-install'),
  onUpdateStatusChanged: (callback: (status: any) => void) => {
    const handler = (_event: any, status: any) => callback(status);
    ipcRenderer.on('updater:status-changed', handler);
    return () => ipcRenderer.removeListener('updater:status-changed', handler);
  },

  // Database Settings
  saveSetting: (key: string, value: string) => ipcRenderer.invoke('db:save-setting', { key, value }),
  getSetting: (key: string) => ipcRenderer.invoke('db:get-setting', key),
  listBackups: () => ipcRenderer.invoke('db:list-backups'),
  backupNow: () => ipcRenderer.invoke('db:backup-now'),
  getSystemLogs: (params: { startDate: string; endDate: string }) => ipcRenderer.invoke('db:get-system-logs', params),
  getFnbMargin: (params: { startDate: string; endDate: string; staff?: string }) => ipcRenderer.invoke('pos:get-fnb-margin', params),
  restoreBackup: (name: string) => ipcRenderer.invoke('db:restore-backup', name),
  openBackupFolder: () => ipcRenderer.invoke('db:open-backup-folder')
});
