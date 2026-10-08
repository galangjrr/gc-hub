/**
 * GC-Hub Protocol Contract
 * Mapped exactly from Legacy Engine Specification (State Machine & Transitions)
 */
import type { ExeMode } from './exePolicy';

// 1. Session States (Dikonfirmasi dari status strings)
export enum SessionState {
  AVAILABLE = 'AVAILABLE',       // PC tersedia, tidak ada sesi aktif
  ONLINE = 'ONLINE',             // PC online, ada sesi aktif
  DISCONNECTED = 'DISCONNECTED', // PC terputus dari server
  SUSPENDED = 'SUSPENDED',       // Sesi ditangguhkan (logout sementara)
  UNKNOWN = 'UnknownSessionState'// State tidak diketahui
}

// 2. Session Types (Berdasarkan Pembayaran)
export type SessionBillingType = 'prepaid' | 'postpaid' | 'opentime' | 'package' | 'member';

// 3. User Types (Berdasarkan Akun)
export type SessionUserType = 'member' | 'guest' | 'package' | 'admin_local' | 'admin';

// 4. WebSocket OpCodes (Sinyal & Transisi State)
export enum OpCode {
  CLIENT_REGISTER = 'CLIENT_REGISTER',
  SERVER_CONFIG_INIT = 'SERVER_CONFIG_INIT',
  AUTH_REQUEST = 'AUTH_REQUEST',
  SESSION_BEGIN = 'SESSION_BEGIN',
  SESSION_TICK = 'SESSION_TICK',
  SESSION_END = 'SESSION_END',
  SCREEN_LOCK = 'SCREEN_LOCK',
  SCREEN_UNLOCK = 'SCREEN_UNLOCK',
  REMOTE_COMMAND = 'REMOTE_COMMAND',
  ADMIN_BROADCAST = 'ADMIN_BROADCAST',
  ORDER_REQUEST = 'ORDER_REQUEST',
  ORDER_STATUS_UPDATE = 'ORDER_STATUS_UPDATE',
  COUPON_REDEEM = 'COUPON_REDEEM',
  ADMIN_AUTH = 'ADMIN_AUTH', // client -> server AdminAuthRequest; server -> client AdminAuthResult
  HEARTBEAT = 'HEARTBEAT'
}

// 5. Packet Base Structure
export interface Packet<T = any> {
  op: OpCode;           // Operation Code
  ts: number;           // Timestamp
  pcId?: string;        // ID / MAC Address PC Client
  payload?: T;          // Data spesifik
  sig?: string;         // HMAC-SHA256 hex (lihat shared/lanAuth.ts)
}

export interface ClientRegisterPayload {
  pcId: string;
  pcName: string;
  mac: string;
  ip: string;
  os?: string;
  clientVersion?: string;
  sessionSnapshot?: ClientSessionSnapshot;
}

// Snapshot sesi terakhir yang dihitung lokal di client, dikirim saat register
// agar server bisa memotong waktu yang terpakai selama server/LAN putus.
export interface ClientSessionSnapshot {
  username: string;
  elapsedSeconds: number;
  remainingSeconds?: number;
  ended?: boolean; // user logout ketika offline
}

export interface AuthPayload {
  username?: string;
  password?: string;
  voucherCode?: string;
  billingType?: SessionBillingType | string;
  type: SessionUserType;
}

// Verifikasi admin untuk membuka pengaturan bilik. Tidak pernah memulai sesi.
export interface AdminAuthRequest {
  username: string;
  password: string;
  nonce?: string; // challenge from the booth's main process, answered with `grant`
}

export interface AdminAuthResult {
  success: boolean;
  message?: string;
  grant?: string; // signAdminGrant(lanKey, nonce), checked by the booth's main process
}

export interface SessionData {
  sessionId?: string;
  pcId?: string;
  username: string;
  billingType: SessionBillingType | string;
  userType: SessionUserType | string;
  timeRemainingMinutes?: number;
  timeUsedMinutes: number;
  moneyUsed: number;
  remainingSeconds?: number;
  elapsedSeconds?: number;
  totalSpent?: number;
  pricePerHour?: number;
  startTime?: number;
  groupName?: string;
  packageName?: string;
}

export interface SessionTickPayload {
  pcId: string;
  remainingSeconds: number;
  elapsedSeconds: number;
  totalCost: number;
  isPaused: boolean;
  timeRemainingMinutes: number;
  timeUsedMinutes: number;
  moneyUsed: number;
}

export interface CouponRedeemPayload {
  code: string;
  username?: string;
}

export interface CouponRedeemResultPayload {
  success: boolean;
  message: string;
  coupon?: any;
}

export interface RemoteCommandPayload {
  action: 'shutdown' | 'restart' | 'lock' | 'unlock' | 'set_volume' | 'capture_screen' | 'screen_capture_response' | 'send_message' | 'broadcast_message' | 'client_chat_reply' | 'wake_on_lan' | 'vnc_signal' | 'remote_mouse_move' | 'remote_mouse_click' | 'remote_mouse_scroll' | 'remote_key_event' | 'remote_key_combo' | 'remote_text_input'
    | 'fetch_processes' | 'kill_process' | 'sync_catalog' | 'rename_pc' | 'set_kiosk' | 'set_exe_policy'
    // client -> server
    | 'telemetry' | 'process_list' | 'kill_process_result' | 'rename_pc_result';
  params?: any;
}

/** Server -> client `rename_pc`: the booth saves this as its PC name and registers again under it. */
export interface RenamePcPayload {
  name: string;
}

/** Client -> server `rename_pc_result`, sent before the booth registers under the new name. */
export interface RenamePcResultPayload {
  name: string;
  success: boolean;
  message?: string;
}

// Saklar kiosk total: false = policy Windows dilepas dan watchdog berhenti sampai dinyalakan lagi.
export interface SetKioskPayload {
  enabled: boolean;
}

// set_exe_policy membawa ExePolicy dari src/shared/exePolicy.ts: allowlist exe efektif untuk PC ini.
export type { ExePolicy as SetExePolicyPayload } from './exePolicy';

export interface ScreenCaptureResponsePayload {
  pcId: string;
  imageBase64: string;
  timestamp: number;
  width?: number;
  height?: number;
}

export interface BroadcastMessagePayload {
  message: string;
  title?: string;
  sender?: string;
  priority?: 'normal' | 'warning' | 'urgent';
  timestamp?: number;
}

export interface OrderItemPayload {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

export interface OrderRequestPayload {
  orderId: string;
  pcId: string;
  items: OrderItemPayload[];
  totalPrice: number;
}

export interface RemoteProcessItem {
  pid: number;
  name: string;
  windowTitle?: string;
  category: 'game' | 'browser' | 'app' | 'background' | 'system' | 'other';
  memoryMb: number;
  cpuPercent?: number;
  status: 'running' | 'not_responding' | 'suspended';
  isProtected?: boolean;
  company?: string;
}

export interface FetchProcessListReqPayload {
  includeSystem?: boolean;
}

export interface FetchProcessListPayload {
  pcId: string;
  processes: RemoteProcessItem[];
  totalMemoryUsedMb: number;
  includeSystem?: boolean;
}

export interface KillProcessPayload {
  pid: number;
  processName: string;
  force?: boolean;
  isClientRequest?: boolean;
}

export interface KillProcessResultPayload {
  pid: number;
  processName: string;
  success: boolean;
  message?: string;
}

export interface HardwareTelemetryPayload {
  pcId: string;
  cpuUsagePercent: number;
  ramTotalMb: number;
  ramUsedMb: number;
  ramUsagePercent: number;
  diskTotalGb?: number;
  diskFreeGb?: number;
  diskUsagePercent?: number;
  gpuName?: string;
  activeWindowTitle?: string;
  activeApp?: string;          // friendly name of the foreground app (exe description), shown on the PC card
  audioVolumePercent?: number;
  isMuted?: boolean;
  uptimeSeconds?: number;
  kioskEnabled?: boolean;      // saklar kiosk di gc-agent; undefined = agent belum terpasang
  exeMode?: ExeMode;           // mode allowlist exe yang tersimpan di gc-agent
  timestamp: number;
}

