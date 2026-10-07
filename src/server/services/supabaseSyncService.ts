/**
 * SupabaseSyncService: jembatan GC Hub Server (SQLite, sumber kebenaran lokal) ke Supabase (GC Net Hub).
 *
 * Prinsip:
 * - Billing tidak pernah menunggu cloud. Semua tulisan penting (log omzet, status booking) masuk
 *   outbox SQLite dulu, lalu dikirim berurutan dengan retry + backoff saat internet tersedia.
 * - Status PC dikirim sebagai diff; baris pcs di cloud tidak pernah dihapus (foto & spesifikasi portal aman).
 * - Event realtime yang merupakan pantulan tulisan GC Hub sendiri diabaikan.
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { sqlite } from '../db';
import { DbService } from '../db/dbService';
import { Workstation } from '../../shared/types';

export interface CloudPaket {
  id: string;
  name: string;
  price: number;
  duration_minutes: number | null;
}

export interface CloudBooking {
  id: string;
  pc_id: string | null;
  paket_id: string;
  player_name: string;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  booking_type?: 'queue' | 'slot';
  scheduled_at?: string | null;
  payment_status?: 'paid' | 'unpaid';
  source?: string;
  ss_bukti?: string | null;
  paket?: CloudPaket | null;
}

export type CloudCommandName =
  | 'lock' | 'unlock' | 'restart' | 'shutdown' | 'broadcast_chat'
  | 'start_session' | 'add_time' | 'replace_package' | 'stop_session' | 'move_station';

export interface CloudRemoteCommand {
  id: string;
  workstation_id: string;
  command: CloudCommandName;
  payload?: any;
  status: 'pending' | 'executed' | 'failed';
  created_by?: string;
}

export interface CloudStatus {
  configured: boolean;
  online: boolean;
  lastHeartbeatAt: number | null;
  lastError: string | null;
  pendingOutbox: number;
  deadOutbox: number;
}

export interface SessionLogEntry {
  playerName: string;
  pcName: string;
  paketName: string;
  price: number;
  startTime: string;
  endTime: string;
  status: 'Selesai' | 'Batal';
  reason?: string;
}

type OutboxItem =
  | { kind: 'log'; payload: Record<string, unknown> }
  | { kind: 'booking_status'; payload: { id: string; status: CloudBooking['status']; cancel_reason?: string } }
  | { kind: 'booking_pc'; payload: { id: string; pc_id: string } };

interface InitOptions {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  appVersion?: string;
  getOnlinePcs?: () => number;
  /** Untuk test: suntik client palsu. */
  client?: SupabaseClient;
}

const HEARTBEAT_MS = 30_000;
const FLUSH_MS = 10_000;
const POLL_COMMANDS_MS = 15_000;
const MAX_BACKOFF_MS = 10 * 60_000;
const EXPECTED_TIME_TOLERANCE_MS = 60_000;
const BOOKING_LINKS_KEY = 'cloud_booking_sessions';

/** Id pcs di cloud dari nama PC lokal: 'PC-01' -> 'pc-01', '05' -> 'pc-05'. */
export function cloudPcId(localName: string): string {
  const clean = localName.trim().toLowerCase();
  return clean.startsWith('pc-') ? clean : `pc-${clean}`;
}

/** Cari nama PC lokal untuk id pcs cloud. */
export function localPcName(cloudId: string, workstations: Pick<Workstation, 'name'>[]): string | null {
  const target = (cloudId || '').trim().toLowerCase();
  const ws = workstations.find(w => cloudPcId(w.name) === target || w.name.trim().toLowerCase() === target);
  return ws ? ws.name : null;
}

function sameInstant(a: string | null | undefined, b: string | null | undefined, toleranceMs = 0): boolean {
  if (!a || !b) return !a && !b;
  return Math.abs(Date.parse(a) - Date.parse(b)) <= toleranceMs;
}

/** Error data/integritas Postgres (kelas 22/23) tidak akan sembuh dengan retry. */
function isPermanentError(err: { code?: string } | null | undefined): boolean {
  return !!err?.code && /^2[23]/.test(err.code);
}

export class SupabaseSyncService {
  private static supabase: SupabaseClient | null = null;
  private static channel: RealtimeChannel | null = null;
  private static timers: NodeJS.Timeout[] = [];
  private static options: InitOptions = {};

  private static lastHeartbeatAt: number | null = null;
  private static lastError: string | null = null;

  private static flushPromise: Promise<void> | null = null;
  private static flushAgain = false;
  private static syncing = false;
  private static pendingSnapshot: Workstation[] | null = null;
  private static lastPcWrite = new Map<string, { status: string; expected: string | null }>();
  private static executingCommands = new Set<string>();
  private static openBookingsCache: CloudBooking[] = [];

  private static onRemoteCommand?: (cmd: CloudRemoteCommand) => Promise<boolean>;
  private static onBookingActivated?: (booking: CloudBooking) => void;
  private static onBookingsChanged?: (event: 'created' | 'updated', booking: CloudBooking) => void;

  // ==================== LIFECYCLE ====================

  /**
   * Hubungkan ke Supabase. Urutan penting: bersihkan status basi dulu, baru subscribe realtime,
   * supaya pembersihan itu tidak memantul balik sebagai perintah stop untuk sesi yang baru dipulihkan.
   */
  public static async init(options: InitOptions = {}): Promise<boolean> {
    this.ensureOutboxTable();
    this.options = options;

    const url = options.supabaseUrl || DbService.getSetting('supabaseUrl') || process.env.SUPABASE_URL || '';
    const key = options.serviceRoleKey || DbService.getSetting('supabaseServiceKey') || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!options.client && (!url || !key)) {
      console.log('[SUPABASE SYNC] Kredensial cloud belum diisi. Berjalan mode lokal.');
      return false;
    }

    try {
      this.supabase = options.client ?? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 10 } },
      });
    } catch (err: any) {
      this.lastError = err?.message || String(err);
      console.error(`[SUPABASE SYNC] Gagal inisialisasi: ${this.lastError}`);
      return false;
    }

    await this.clearAllExpectedEmptyTimes();
    this.subscribeRealtime();
    await this.heartbeat();
    await this.flushOutbox();

    this.timers.push(
      setInterval(() => this.heartbeat(), HEARTBEAT_MS),
      setInterval(() => this.flushOutbox(), FLUSH_MS),
      setInterval(() => this.pollRemoteCommands(), POLL_COMMANDS_MS),
    );
    console.log(`[SUPABASE SYNC] Tersambung ke ${url || 'client uji'}`);
    return true;
  }

  public static setListeners(handlers: {
    onRemoteCommand?: (cmd: CloudRemoteCommand) => Promise<boolean>;
    onBookingActivated?: (booking: CloudBooking) => void;
    onBookingsChanged?: (event: 'created' | 'updated', booking: CloudBooking) => void;
  }): void {
    this.onRemoteCommand = handlers.onRemoteCommand ?? this.onRemoteCommand;
    this.onBookingActivated = handlers.onBookingActivated ?? this.onBookingActivated;
    this.onBookingsChanged = handlers.onBookingsChanged ?? this.onBookingsChanged;
  }

  public static isConfigured(): boolean {
    return this.supabase !== null;
  }

  public static getStatus(): CloudStatus {
    const counts = sqlite.prepare(`SELECT
      SUM(CASE WHEN dead = 0 THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN dead = 1 THEN 1 ELSE 0 END) AS dead
      FROM CloudOutbox`).get() as { pending: number | null; dead: number | null };
    return {
      configured: this.isConfigured(),
      online: this.lastHeartbeatAt !== null && Date.now() - this.lastHeartbeatAt < HEARTBEAT_MS * 3,
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastError: this.lastError,
      pendingOutbox: counts.pending || 0,
      deadOutbox: counts.dead || 0,
    };
  }

  public static disconnect(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
    if (this.supabase && this.channel) this.supabase.removeChannel(this.channel);
    this.channel = null;
    this.supabase = null;
  }

  // ==================== HEARTBEAT ====================

  private static async heartbeat(): Promise<void> {
    if (!this.supabase) return;
    const { error } = await this.supabase.from('branches').update({
      last_seen_at: new Date().toISOString(),
      app_version: this.options.appVersion || null,
      online_pcs: this.options.getOnlinePcs?.() ?? 0,
    }).eq('id', 'main');

    if (error) {
      this.lastError = `Heartbeat: ${error.message}`;
      return;
    }
    this.lastHeartbeatAt = Date.now();
    this.lastError = null;
  }

  // ==================== OUTBOX ====================

  private static ensureOutboxTable(): void {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS CloudOutbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      nextAttemptAt INTEGER NOT NULL DEFAULT 0,
      lastError TEXT,
      dead INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    )`);
  }

  private static enqueue(item: OutboxItem): void {
    if (!this.supabase) return; // mode lokal: tidak ada cloud yang perlu disinkronkan
    sqlite.prepare('INSERT INTO CloudOutbox (kind, payload, createdAt) VALUES (?, ?, ?)')
      .run(item.kind, JSON.stringify(item.payload), Date.now());
    void this.flushOutbox();
  }

  /**
   * Kirim antrean berurutan. Berhenti di item gagal pertama agar urutan terjaga
   * (contoh: 'active' tidak boleh terkirim setelah 'completed').
   * ponytail: satu item macet menahan antrean di belakangnya sampai sukses atau jadi dead letter.
   */
  public static flushOutbox(): Promise<void> {
    if (!this.supabase) return Promise.resolve();
    if (this.flushPromise) {
      // Sedang jalan: ikut menunggu, lalu jalan sekali lagi untuk item yang masuk di tengah
      this.flushAgain = true;
      return this.flushPromise;
    }
    this.flushPromise = this.runFlush().finally(() => {
      this.flushPromise = null;
      if (this.flushAgain) {
        this.flushAgain = false;
        void this.flushOutbox();
      }
    });
    return this.flushPromise;
  }

  private static async runFlush(): Promise<void> {
    const rows = sqlite.prepare('SELECT * FROM CloudOutbox WHERE dead = 0 ORDER BY id LIMIT 25').all() as
      { id: number; kind: OutboxItem['kind']; payload: string; attempts: number; nextAttemptAt: number }[];

    let stoppedEarly = false;
    for (const row of rows) {
      if (row.nextAttemptAt > Date.now()) {
        stoppedEarly = true;
        break;
      }
      const error = await this.applyOutboxItem({ kind: row.kind, payload: JSON.parse(row.payload) } as OutboxItem);

      if (!error) {
        sqlite.prepare('DELETE FROM CloudOutbox WHERE id = ?').run(row.id);
        continue;
      }

      if (isPermanentError(error)) {
        sqlite.prepare('UPDATE CloudOutbox SET dead = 1, lastError = ? WHERE id = ?').run(`${error.code}: ${error.message}`, row.id);
        console.error(`[SUPABASE SYNC] Outbox #${row.id} (${row.kind}) ditolak permanen: ${error.message}`);
        continue;
      }

      const attempts = row.attempts + 1;
      const backoff = Math.min(MAX_BACKOFF_MS, 5000 * 2 ** Math.min(attempts, 10));
      sqlite.prepare('UPDATE CloudOutbox SET attempts = ?, nextAttemptAt = ?, lastError = ? WHERE id = ?')
        .run(attempts, Date.now() + backoff, error.message, row.id);
      this.lastError = `Outbox: ${error.message}`;
      stoppedEarly = true;
      break;
    }
    if (!stoppedEarly && rows.length === 25) this.flushAgain = true; // masih ada sisa antrean
  }

  private static async applyOutboxItem(item: OutboxItem): Promise<{ message: string; code?: string } | null> {
    const db = this.supabase!;
    try {
      if (item.kind === 'log') {
        let { error } = await db.from('logs').upsert([item.payload], { onConflict: 'id', ignoreDuplicates: true });
        // Kolom reason baru ada setelah migration 003; kirim ulang tanpa reason bila belum ada
        if (error && error.message?.includes('reason')) {
          const { reason: _omit, ...rest } = item.payload;
          ({ error } = await db.from('logs').upsert([rest], { onConflict: 'id', ignoreDuplicates: true }));
        }
        return error;
      }
      if (item.kind === 'booking_status') {
        const { id, ...fields } = item.payload;
        return (await db.from('bookings').update(fields).eq('id', id)).error;
      }
      const { id, pc_id } = item.payload;
      return (await db.from('bookings').update({ pc_id }).eq('id', id)).error;
    } catch (err: any) {
      return { message: err?.message || String(err) };
    }
  }

  // ==================== LOG OMZET ====================

  /** Catat sesi selesai ke tabel logs (rekap GC Net Hub). Id stabil, jadi retry tidak menggandakan. */
  public static recordSessionLog(log: SessionLogEntry): void {
    const payload: Record<string, unknown> = {
      id: `log-hub-${Date.parse(log.startTime) || Date.now()}-${log.pcName}`.toLowerCase(),
      player_name: log.playerName,
      pc_name: log.pcName,
      paket_name: log.paketName,
      price: Math.round(log.price),
      start_time: log.startTime,
      end_time: log.endTime,
      status: log.status,
    };
    if (log.reason) payload.reason = log.reason;
    this.enqueue({ kind: 'log', payload });
  }

  // ==================== STATUS PC ====================

  /** Kirim status PC sebagai diff. Panggilan beruntun digabung: hanya snapshot terakhir yang dikirim. */
  public static async syncWorkstations(workstations: Workstation[]): Promise<void> {
    if (!this.supabase) return;
    if (this.syncing) {
      this.pendingSnapshot = workstations;
      return;
    }
    this.syncing = true;
    try {
      await this.pushWorkstations(workstations);
    } catch (err: any) {
      this.lastError = `Sync PC: ${err?.message || err}`;
    } finally {
      this.syncing = false;
      const next = this.pendingSnapshot;
      this.pendingSnapshot = null;
      if (next) void this.syncWorkstations(next);
    }
  }

  private static async pushWorkstations(workstations: Workstation[]): Promise<void> {
    const db = this.supabase!;
    const { data: cloudPcs, error } = await db.from('pcs').select('id, name, status, expected_empty_time');
    if (error) {
      this.lastError = `Sync PC: ${error.message}`;
      return;
    }
    const byId = new Map((cloudPcs || []).map((p: any) => [String(p.id).toLowerCase(), p]));

    for (const pc of workstations) {
      const id = cloudPcId(pc.name);
      const cloud = byId.get(id) ?? byId.get(pc.name.trim().toLowerCase());
      const targetId = cloud?.id ?? id;

      const isSessionActive = pc.state === 'active_guest' || pc.state === 'active_member' || pc.state === 'in_use' || pc.state === 'locked';
      const remSec = pc.state === 'locked' || pc.state === 'offline' ? 0
        : typeof pc.remainingSeconds === 'number' ? pc.remainingSeconds
        : (pc.timeRemainingMinutes ?? 0) * 60;
      const expected = isSessionActive && remSec > 0 ? new Date(Date.now() + remSec * 1000).toISOString() : null;
      const status = isSessionActive ? 'occupied' : 'available';

      // Maintenance diatur dari web; GC Hub hanya menimpanya bila PC benar-benar sedang dipakai
      if (cloud?.status === 'maintenance' && status !== 'occupied') continue;

      const unchanged = cloud && cloud.status === status && cloud.name === pc.name
        && sameInstant(cloud.expected_empty_time, expected, EXPECTED_TIME_TOLERANCE_MS);
      if (unchanged) continue;

      this.lastPcWrite.set(String(targetId).toLowerCase(), { status, expected });
      const result = cloud
        ? await db.from('pcs').update({ name: pc.name, status, expected_empty_time: expected }).eq('id', targetId)
        : await db.from('pcs').insert({ id: targetId, name: pc.name, status, expected_empty_time: expected });
      if (result.error) this.lastError = `Sync PC ${pc.name}: ${result.error.message}`;
    }
  }

  /** Saat server mati/start: jangan biarkan web menghitung mundur sesi yang tidak berjalan. */
  public static async clearAllExpectedEmptyTimes(): Promise<void> {
    if (!this.supabase) return;
    const { error } = await this.supabase.from('pcs')
      .update({ expected_empty_time: null, status: 'available' })
      .neq('status', 'maintenance');
    if (error) this.lastError = `Reset status PC: ${error.message}`;
    this.lastPcWrite.clear();
  }

  // ==================== BOOKING ====================

  /** Booking pending/active + detail paket. Saat offline mengembalikan cache terakhir. */
  public static async listOpenBookings(): Promise<{ bookings: CloudBooking[]; fromCache: boolean; error: string | null }> {
    if (!this.supabase) return { bookings: [], fromCache: true, error: 'Cloud belum dikonfigurasi.' };

    const [bookingsRes, paketsRes] = await Promise.all([
      this.supabase.from('bookings').select('*').in('status', ['pending', 'active']).order('created_at', { ascending: true }),
      this.supabase.from('pakets').select('id, name, price, duration_minutes'),
    ]);
    const error = bookingsRes.error || paketsRes.error;
    if (error) return { bookings: this.openBookingsCache, fromCache: true, error: error.message };

    const pakets = new Map((paketsRes.data || []).map((p: any) => [p.id, p as CloudPaket]));
    this.openBookingsCache = (bookingsRes.data || []).map((b: any) => ({
      ...b,
      booking_type: b.booking_type ?? 'queue',
      payment_status: b.payment_status ?? (b.ss_bukti ? 'paid' : 'unpaid'),
      paket: pakets.get(b.paket_id) ?? null,
    }));
    return { bookings: this.openBookingsCache, fromCache: false, error: null };
  }

  public static getCachedBooking(id: string): CloudBooking | undefined {
    return this.openBookingsCache.find(b => b.id === id);
  }

  /** Booking -> sesi lokal, disimpan di SQLite agar bertahan saat server restart. */
  public static getBookingLinks(): Record<string, string> {
    try {
      return JSON.parse(DbService.getSetting(BOOKING_LINKS_KEY) || '{}');
    } catch {
      return {};
    }
  }

  private static saveBookingLinks(links: Record<string, string>): void {
    DbService.setSetting(BOOKING_LINKS_KEY, JSON.stringify(links));
  }

  public static isBookingLinked(bookingId: string): boolean {
    return Object.values(this.getBookingLinks()).includes(bookingId);
  }

  /** Tandai booking dimulai di PC lokal. Booking lama yang masih tertaut di PC itu otomatis diselesaikan. */
  public static markBookingStarted(bookingId: string, pcName: string, cloudPcIdValue: string, movedFromCloudPc: string | null): void {
    const links = this.getBookingLinks();
    const key = pcName.toUpperCase();
    const previous = links[key];
    if (previous && previous !== bookingId) {
      this.enqueue({ kind: 'booking_status', payload: { id: previous, status: 'completed' } });
    }
    if (movedFromCloudPc !== cloudPcIdValue) {
      this.enqueue({ kind: 'booking_pc', payload: { id: bookingId, pc_id: cloudPcIdValue } });
    }
    this.enqueue({ kind: 'booking_status', payload: { id: bookingId, status: 'active' } });
    links[key] = bookingId;
    this.saveBookingLinks(links);
    this.updateCache(bookingId, { status: 'active', pc_id: cloudPcIdValue });
  }

  /** Dipanggil saat sesi di PC berakhir: booking yang tertaut jadi completed. */
  public static markSessionEnded(pcName: string): string | null {
    const links = this.getBookingLinks();
    const key = pcName.toUpperCase();
    const bookingId = links[key];
    if (!bookingId) return null;
    delete links[key];
    this.saveBookingLinks(links);
    this.enqueue({ kind: 'booking_status', payload: { id: bookingId, status: 'completed' } });
    this.openBookingsCache = this.openBookingsCache.filter(b => b.id !== bookingId);
    return bookingId;
  }

  public static reassignBooking(bookingId: string, newCloudPcId: string): void {
    this.enqueue({ kind: 'booking_pc', payload: { id: bookingId, pc_id: newCloudPcId } });
    this.updateCache(bookingId, { pc_id: newCloudPcId });
  }

  public static rejectBooking(bookingId: string, reason: string): void {
    this.enqueue({ kind: 'booking_status', payload: { id: bookingId, status: 'cancelled', cancel_reason: reason } });
    this.openBookingsCache = this.openBookingsCache.filter(b => b.id !== bookingId);
  }

  private static updateCache(bookingId: string, fields: Partial<CloudBooking>): void {
    this.openBookingsCache = this.openBookingsCache.map(b => (b.id === bookingId ? { ...b, ...fields } : b));
  }

  // ==================== REALTIME & PERINTAH REMOTE ====================

  private static subscribeRealtime(): void {
    if (!this.supabase) return;
    if (this.channel) this.supabase.removeChannel(this.channel);

    this.channel = this.supabase
      .channel('gc-hub-server')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, payload => {
        const booking = payload.new as CloudBooking;
        if (booking?.status === 'pending') this.onBookingsChanged?.('created', booking);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, payload => {
        const booking = payload.new as CloudBooking;
        if (!booking) return;
        // Booking disetujui dari HP kasir/owner: mulai sesi di PC-nya, kecuali memang GC Hub sendiri yang memulai
        if (booking.status === 'active' && !this.isBookingLinked(booking.id)) {
          this.onBookingActivated?.(booking);
        }
        this.onBookingsChanged?.('updated', booking);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'remote_commands' }, payload => {
        const cmd = payload.new as CloudRemoteCommand;
        if (cmd?.status === 'pending') void this.executeRemoteCommand(cmd);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pcs' }, payload => {
        this.handlePcUpdate(payload.new as any);
      })
      .subscribe(status => {
        console.log(`[SUPABASE SYNC] Realtime: ${status}`);
      });
  }

  /** Perubahan pcs dari web companion: 'available' tanpa jam = hentikan sesi, 'maintenance' = kunci PC. */
  public static handlePcUpdate(pc: { id: string; name?: string; status: string; expected_empty_time: string | null } | null): void {
    if (!pc) return;
    const mine = this.lastPcWrite.get(String(pc.id).toLowerCase());
    if (mine && mine.status === pc.status && sameInstant(mine.expected, pc.expected_empty_time)) return; // pantulan tulisan sendiri

    const workstation = pc.name || pc.id;
    if (pc.status === 'available' && !pc.expected_empty_time && mine?.status === 'occupied') {
      void this.onRemoteCommand?.({ id: `web-stop-${Date.now()}`, workstation_id: workstation, command: 'stop_session', payload: { reason: 'Dihentikan via Web Companion' }, status: 'pending' });
    } else if (pc.status === 'maintenance') {
      void this.onRemoteCommand?.({ id: `web-lock-${Date.now()}`, workstation_id: workstation, command: 'lock', status: 'pending' });
    }
  }

  private static async pollRemoteCommands(): Promise<void> {
    if (!this.supabase) return;
    const { data, error } = await this.supabase.from('remote_commands')
      .select('*').eq('status', 'pending').order('created_at', { ascending: true }).limit(10);
    if (error) return;
    for (const cmd of data || []) await this.executeRemoteCommand(cmd as CloudRemoteCommand);
  }

  private static async executeRemoteCommand(cmd: CloudRemoteCommand): Promise<void> {
    if (!this.supabase || this.executingCommands.has(cmd.id)) return;
    this.executingCommands.add(cmd.id);
    try {
      let ok = false;
      try {
        ok = (await this.onRemoteCommand?.(cmd)) ?? false;
      } catch (err) {
        console.error(`[SUPABASE SYNC] Perintah ${cmd.command} gagal:`, err);
      }
      await this.supabase.from('remote_commands')
        .update({ status: ok ? 'executed' : 'failed', executed_at: new Date().toISOString() })
        .eq('id', cmd.id);
    } finally {
      this.executingCommands.delete(cmd.id);
    }
  }
}
