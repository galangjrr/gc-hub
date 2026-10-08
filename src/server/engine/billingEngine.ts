import { eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../db/schema';
import { DbService } from '../db/dbService';
import { ServerNetworkBridge } from '../network/serverNetwork';
import { OpCode, SessionBillingType, SessionUserType, SessionData, ClientSessionSnapshot } from '../../shared/protocol';
import { Workstation, StackedPackageItem } from '../../shared/types';
import { calcPersonalBill, normalizeAccumulationMinutes, normalizeRoundingStep, roundDownToStep, RoundingStep } from '../../shared/personalBilling';
import { isPackageOnSale, saleWindowText } from '../../shared/packageRules';
import { TRANSFER_NOTE } from '../../shared/transactions';
import { parseExeSettings, EXE_SETTINGS_KEY, type ExeMode } from '../../shared/exePolicy';

export interface SessionEndedEvent {
  pcId: string;
  username: string;
  userType: SessionUserType;
  billingType: SessionBillingType;
  packageName?: string;
  totalCost: number;
  refundedAmount: number; // uang yang dikembalikan kasir saat sesi dihentikan (refund)
  startTime: number;
  endTime: number;
  reason: string;
}

export interface ActiveSessionState {
  pcId: string;
  username: string;
  userType: SessionUserType;
  billingType: SessionBillingType;
  initialTotalSeconds: number;
  remainingSeconds: number;
  elapsedSeconds: number;
  totalCost: number;
  pricePerHour: number;
  packageName?: string;
  startTime: number;
  isPaused: boolean;
  pausedDurationMs: number;
  lastPauseTimestamp?: number;
  memberId?: number;
  rateConfig?: {
    firstHourPrice: number;
    nextHoursPrice: number;
    accumulationMinutes?: number;
    name?: string;
  };
  stackedPackages?: StackedPackageItem[];
}

export type EngineChangeCallback = (workstations: Workstation[]) => void;

/**
 * Authoritative Billing Engine for GC-Hub Server
 * Runs a high-precision 1-second authoritative tick loop to manage session countdowns,
 * live balance deductions, and automatic cutoff.
 */
export class BillingEngine {
  private static activeSessions: Map<string, ActiveSessionState> = new Map();
  private static pendingOrdersMap: Map<string, any[]> = new Map();
  private static tickIntervalId: NodeJS.Timeout | null = null;
  private static sessionEndedListeners: ((event: SessionEndedEvent) => void)[] = [];

  /** Dipanggil sekali setiap sesi berakhir (logout, waktu habis, dihentikan kasir/web). */
  public static onSessionEnded(listener: (event: SessionEndedEvent) => void): () => void {
    this.sessionEndedListeners.push(listener);
    return () => {
      this.sessionEndedListeners = this.sessionEndedListeners.filter(l => l !== listener);
    };
  }
  private static listeners: EngineChangeCallback[] = [];
  // Foreground app reported by client telemetry; shown on the PC card only while a session runs.
  private static activeApps = new Map<string, string>();

  public static setActiveApp(pcId: string, app: string | undefined): void {
    const key = pcId.trim().toUpperCase();
    const next = (app || '').trim();
    if ((this.activeApps.get(key) || '') === next) return;
    if (next) this.activeApps.set(key, next); else this.activeApps.delete(key);
    this.notifyListeners();
  }

  // gc-agent state per PC (kiosk switch, exe allowlist mode) as last reported by client telemetry.
  private static agentStates = new Map<string, { kioskEnabled?: boolean; exeMode?: ExeMode }>();

  public static setAgentState(pcId: string, state: { kioskEnabled?: boolean; exeMode?: ExeMode }): void {
    const key = pcId.trim().toUpperCase();
    const prev = this.agentStates.get(key);
    if (prev?.kioskEnabled === state.kioskEnabled && prev?.exeMode === state.exeMode) return;
    this.agentStates.set(key, state);
    this.notifyListeners();
  }

  public static findUnpaidWorkstation(pcId: string): Workstation | undefined {
    const key = pcId.trim().toUpperCase();
    return DbService.getWorkstations().find(w =>
      w.state === 'unpaid' && (w.name.toUpperCase() === key || (w.pcId || '').toUpperCase() === key));
  }

  /**
   * Kasir menerima pembayaran tagihan personal yang ditahan saat sesi berhenti:
   * baru di sini uangnya dicatat ke kas, lalu PC kembali tersedia.
   */
  public static settleUnpaid(pcId: string, staff = 'Operator'): { success: boolean; message: string; amount?: number } {
    const ws = this.findUnpaidWorkstation(pcId);
    if (!ws) return { success: false, message: `${pcId} tidak punya tagihan belum bayar.` };
    const amount = Math.max(0, Number(ws.unpaidAmount) || 0);
    if (amount > 0) {
      DbService.addTransaction({
        username: ws.username || ws.name,
        date: new Date().toLocaleDateString('id-ID'),
        time: new Date().toTimeString().split(' ')[0],
        price: amount,
        timeUsed: `${ws.timeUsedMinutes || 0}m`,
        staff,
        note: `Pembayaran Sesi Pasca-Bayar [${ws.name}]`
      });
    }
    DbService.updateWorkstationState(ws.pcId || ws.name, 'idle');
    this.notifyListeners();
    return { success: true, message: `Tagihan ${ws.name} lunas: Rp ${amount.toLocaleString('id-ID')}.`, amount };
  }

  /**
   * Start 1-second server tick engine
   */
  /**
   * Start 1-second server tick engine with full SQLite Crash & Power-Outage Recovery
   */
  public static start(): void {
    if (this.tickIntervalId) return;

    // Load and recover all active sessions from SQLite database
    const rows = db.select().from(schema.workstations).all();
    const now = Date.now();
    let recoveredCount = 0;

    rows.forEach(ws => {
      const isSessionActive = ws.state === 'in_use' || 
                              ws.state === 'active_guest' || 
                              ws.state === 'active_member' || 
                              ws.state === 'suspended' || 
                              ws.state === 'locked';

      if (isSessionActive && ws.currentUser) {
        const rem = Number(ws.remainingSeconds) || 0;
        const elap = Number(ws.elapsedSeconds) || 0;
        const spent = Number(ws.totalSpent) || 0;
        const isMem = ws.currentUser.toLowerCase().includes('member') || ws.billingType === 'member';

        let stackedList: StackedPackageItem[] = [
          {
            id: `stk-${Date.now()}`,
            name: ws.packageName || 'Paket Aktif',
            minutes: Math.ceil((rem + elap) / 60) || 60,
            minutesFormatted: `${Math.ceil((rem + elap) / 60) || 60}m`,
            price: spent,
            purchasedAt: new Date().toLocaleTimeString('id-ID'),
            expiredAt: '-',
            status: 'In Use'
          }
        ];

        this.activeSessions.set(ws.name, {
          pcId: ws.name,
          username: ws.currentUser,
          userType: (isMem ? 'member' : 'guest') as SessionUserType,
          billingType: (ws.billingType || (rem > 0 ? 'package' : 'postpaid')) as SessionBillingType,
          initialTotalSeconds: rem + elap,
          remainingSeconds: rem,
          elapsedSeconds: elap,
          totalCost: spent,
          pricePerHour: Number(ws.sessionPricePerHour) || Number(ws.pricePerHour) || 4000,
          packageName: ws.packageName || undefined,
          startTime: now - elap * 1000,
          isPaused: ws.state === 'suspended' || ws.state === 'locked',
          pausedDurationMs: 0,
          stackedPackages: stackedList
        });
        recoveredCount++;
      }
    });

    console.log(`[BILLING ENGINE] Authoritative Tick Started. Recovered ${recoveredCount} active session(s) from SQLite.`);

    // Auto update UI on client connect / disconnect
    ServerNetworkBridge.onConnectionChange(() => {
      this.notifyListeners();
    });

    let tickCounter = 0;
    this.tickIntervalId = setInterval(() => {
      tickCounter++;
      this.tick(tickCounter % 5 === 0); // Periodic SQLite sync every 5 seconds
    }, 1000);
  }

  public static stop(): void {
    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
    // Flush state to SQLite before shutdown
    this.activeSessions.forEach((session, pcId) => {
      DbService.updateWorkstationState(pcId, session.isPaused ? 'locked' : 'in_use', {
        username: session.username,
        type: session.billingType,
        remainingSeconds: session.remainingSeconds,
        elapsedSeconds: session.elapsedSeconds,
        totalCost: session.totalCost,
        pricePerHour: session.pricePerHour,
        packageName: session.packageName
      });
    });
  }

  /**
   * Activates the next queued package once the running one is used up, carrying the time used past
   * its end into the next one. That overflow is up to a second on a normal tick, but can be hours
   * after reconcileClientSnapshot books time the client used while the server was not counting; it
   * keeps rolling through the queue until it fits. Returns the package now running, or undefined
   * when nothing is queued (the caller then applies the cutoff).
   */
  public static rollOverStackedPackages(session: ActiveSessionState, now: number): StackedPackageItem | undefined {
    const queued = () => (session.stackedPackages || []).find(p => p.status === 'Not Used');
    let next: StackedPackageItem | undefined = queued();
    if (!next) return undefined;

    let overflowSec = Math.max(0, session.elapsedSeconds - session.initialTotalSeconds);
    let active = next;
    while (next) {
      (session.stackedPackages || []).forEach(p => {
        if (p.status === 'In Use') p.status = 'Used';
      });
      next.status = 'In Use';
      active = next;
      const durSec: number = next.minutes * 60;
      next = overflowSec >= durSec ? queued() : undefined;
      if (next) overflowSec -= durSec;
    }

    const durSec = active.minutes * 60;
    session.initialTotalSeconds = durSec;
    session.elapsedSeconds = overflowSec;
    session.remainingSeconds = Math.max(0, durSec - overflowSec);
    // Elapsed restarts per package, so the pause total of the old one must not carry over: it would
    // hold the new package's clock at zero for that long.
    session.startTime = now - overflowSec * 1000;
    session.pausedDurationMs = 0;
    session.packageName = active.name;
    return active;
  }

  /**
   * 1-Second Authoritative Tick Loop synced to System Wall Clock
   */
  private static tick(shouldPersistDb: boolean = false): void {
    const now = Date.now();
    let hasChanges = false;

    // Broadcast system real-time clock to all workstations
    ServerNetworkBridge.broadcast(OpCode.SESSION_TICK, {
      serverTime: now,
      isGlobalTimeSync: true
    });

    const connectedClients = ServerNetworkBridge.getConnectedClients();
    const connectedPcIds = new Set(connectedClients.map(c => (c.pcName || c.pcId).toUpperCase()));

    this.activeSessions.forEach((session, pcId) => {
      const isConnected = connectedPcIds.has(pcId.toUpperCase()) || 
                          connectedClients.some(c => c.pcId.toUpperCase() === pcId.toUpperCase());

      // Jika Client tertutup / tidak terdeteksi / tidak connect LAN: durasi waktu distop (dijeda)
      if (!isConnected || session.isPaused) {
        session.pausedDurationMs = (session.pausedDurationMs || 0) + 1000;
        return;
      }

      // Compute exact elapsed time from system clock Date.now()
      const totalElapsedMs = Math.max(0, now - session.startTime - (session.pausedDurationMs || 0));
      const currentElapsedSec = Math.floor(totalElapsedMs / 1000);
      session.elapsedSeconds = currentElapsedSec;
      hasChanges = true;

      // 1. Package or Prepaid Countdown
      if (session.billingType === 'package' || session.billingType === 'prepaid' || session.billingType === 'member') {
        session.remainingSeconds = Math.max(0, session.initialTotalSeconds - currentElapsedSec);

        // Saldo member berjalan: biaya = waktu terpakai x tarif per jam, dipotong dari saldo saat sesi berhenti
        if (session.billingType === 'member') {
          session.totalCost = Math.round(currentElapsedSec * (session.pricePerHour / 3600));
        }

        // Check if time ran out
        if (session.remainingSeconds <= 0) {
          // Check if there is next stacked package in queue (Not Used)
          const nextStack = this.rollOverStackedPackages(session, now);
          if (nextStack) {
            console.log(`[BILLING ENGINE] Package on ${pcId} finished. Activating stacked package [${nextStack.name}]...`);

            // Notify client workstation
            ServerNetworkBridge.sendToClient(pcId, OpCode.SESSION_BEGIN, {
              sessionId: `SES-${now}`,
              pcId,
              username: session.username,
              userType: session.userType,
              billingType: session.billingType,
              remainingSeconds: session.remainingSeconds,
              elapsedSeconds: session.elapsedSeconds,
              timeRemainingMinutes: Math.ceil(session.remainingSeconds / 60),
              timeUsedMinutes: Math.floor(session.elapsedSeconds / 60),
              totalSpent: session.totalCost,
              moneyUsed: session.totalCost,
              pricePerHour: session.pricePerHour,
              startTime: session.startTime,
              packageName: session.packageName
            });

            ServerNetworkBridge.sendToClient(pcId, OpCode.REMOTE_COMMAND, {
              action: 'send_message',
              params: { message: `Paket antrian [${nextStack.name}] telah otomatis aktif!` }
            });

            DbService.updateWorkstationState(pcId, 'in_use', {
              username: session.username,
              type: session.billingType,
              remainingSeconds: session.remainingSeconds,
              elapsedSeconds: session.elapsedSeconds,
              totalCost: session.totalCost,
              pricePerHour: session.pricePerHour,
              packageName: session.packageName
            });

            this.notifyListeners();
            return;
          }

          // Auto Cutoff when all packages are exhausted, after the grace seconds set by the cashier
          // (the clock stays at 00:00 meanwhile, so a player can still save or buy more time).
          // Members get no grace: their balance keeps draining per second and would go negative.
          const overdueSec = currentElapsedSec - session.initialTotalSeconds;
          const grace = session.billingType === 'member' ? 0 : this.cutoffGraceSeconds();
          if (overdueSec >= grace) {
            console.log(`[BILLING ENGINE] Session on ${pcId} for [${session.username}] EXPIRED. Triggering Auto-Cutoff...`);
            this.stopSession(pcId, 'Waktu sewa habis (Auto-Cutoff)');
            return;
          }
        }
      }

      // 2. Postpaid (Open Time) Calculation based on Authoritative PersonalRateConfig
      else if (session.billingType === 'postpaid') {
        const isAdmin = session.userType === 'admin' || session.username.toLowerCase() === 'admin';
        if (isAdmin) {
          session.totalCost = 0;
        } else {
          // Parking-style: every started hour is billed in full (src/shared/personalBilling.ts).
          const rate = session.rateConfig ?? { firstHourPrice: session.pricePerHour, nextHoursPrice: session.pricePerHour };
          session.totalCost = calcPersonalBill(rate, session.elapsedSeconds, this.roundingStep()).total;
        }
      }

      // Total remaining duration includes active package + all queued packages (Not Used)
      const queuedSeconds = (session.stackedPackages || [])
        .filter(p => p.status === 'Not Used')
        .reduce((sum, p) => sum + (p.minutes * 60), 0);
      const totalRemainingSec = session.remainingSeconds + queuedSeconds;

      // 4. Send Realtime Authoritative Session Tick + Server Timestamp to Client
      ServerNetworkBridge.sendToClient(pcId, OpCode.SESSION_TICK, {
        pcId,
        serverTime: now,
        remainingSeconds: totalRemainingSec,
        elapsedSeconds: session.elapsedSeconds,
        totalCost: session.totalCost,
        isPaused: session.isPaused,
        timeRemainingMinutes: Math.ceil(totalRemainingSec / 60),
        timeUsedMinutes: Math.floor(session.elapsedSeconds / 60),
        moneyUsed: session.totalCost
      });

      // 5. Periodic SQLite persistence for crash/power-outage recovery
      if (shouldPersistDb) {
        DbService.updateWorkstationState(pcId, session.isPaused ? 'locked' : 'in_use', {
          username: session.username,
          type: session.billingType,
          remainingSeconds: totalRemainingSec, // Store total (current + queued) to survive crashes
          elapsedSeconds: session.elapsedSeconds,
          totalCost: session.totalCost,
          pricePerHour: session.pricePerHour,
          packageName: session.packageName
        });
      }
    });

    // Notify UI on state change
    if (hasChanges) {
      this.notifyListeners();
    }
  }

  // ==================== SESSION CONTROLS ====================

  // Seconds a finished prepaid session keeps running at 00:00 before the PC locks (0-60).
  private static cutoffGraceSeconds(): number {
    const n = Math.floor(Number(DbService.getSetting('autoCutoffToleranceSec', '0')));
    return Number.isFinite(n) ? Math.max(0, Math.min(60, n)) : 0;
  }

  // Cashier rounding step from Pengaturan > Tarif > Aturan Billing (postpaid bills up, refunds down).
  private static roundingStep(): RoundingStep {
    return normalizeRoundingStep(DbService.getSetting('cashierRoundingStep', '100'));
  }

  // Refuses packages the catalog does not allow right now: extension-only packages cannot open
  // a session, and Happy Hour packages are only sold inside their window. Unknown names pass
  // (vouchers, mobile companion and custom amounts are not catalog packages).
  private static packageSaleBlock(packageName: string | undefined, startsSession: boolean): string | null {
    if (!packageName) return null;
    const pkg = DbService.getPackages().find(p => p.name === packageName);
    if (!pkg) return null;
    if (startsSession && pkg.isExtensionOnly) return `Paket ${pkg.name} hanya untuk tambah waktu, tidak bisa membuka sesi baru.`;
    if (!isPackageOnSale(pkg)) return `Paket ${pkg.name} hanya dijual pukul ${saleWindowText(pkg)}.`;
    return null;
  }

  /**
   * Start a new billing session on a workstation
   */
  public static startSession(
    pcId: string,
    params: {
      username: string;
      userType?: SessionUserType;
      billingType?: SessionBillingType;
      durationMinutes?: number;
      price?: number;
      pricePerHour?: number;
      packageName?: string;
      memberId?: number;
      rateConfig?: {
        firstHourPrice: number;
        nextHoursPrice: number;
        accumulationMinutes?: number;
        name?: string;
      };
      // Booking already paid online: logged as revenue, but not as drawer cash
      paidOnline?: boolean;
    }
  ): boolean {
    // Overwriting a running session would silently drop the player's time and bill.
    if (this.getSession(pcId)) {
      console.warn(`[BILLING ENGINE] ${pcId} masih punya sesi berjalan; sesi baru ditolak. Hentikan sesi lama dulu.`);
      return false;
    }

    // A postpaid bill that has not been paid keeps the PC blocked until the cashier settles it.
    if (this.findUnpaidWorkstation(pcId)) {
      console.warn(`[BILLING ENGINE] ${pcId} masih belum bayar; sesi baru ditolak sampai kasir menyelesaikan pembayaran.`);
      return false;
    }

    const blocked = this.packageSaleBlock(params.packageName, true);
    if (blocked) {
      console.warn(`[BILLING ENGINE] ${pcId}: ${blocked}`);
      return false;
    }

    const isAdmin = (params.userType === 'admin' || params.username.toLowerCase() === 'admin');
    const durationSec = Math.max(0, (params.durationMinutes || 60) * 60);
    // Harga 0 itu sah (member, kupon, postpaid dibayar di akhir); jangan diganti default,
    // karena price > 0 langsung dicatat sebagai transaksi omzet di bawah.
    const price = isAdmin ? 0 : Math.max(0, Number(params.price) || 0);
    const pph = isAdmin ? 0 : Math.max(0, params.pricePerHour || (params.rateConfig?.firstHourPrice) || 4000);

    const newSession: ActiveSessionState = {
      pcId,
      username: params.username,
      userType: params.userType || (isAdmin ? 'admin' : 'guest'),
      billingType: params.billingType || 'package',
      initialTotalSeconds: durationSec,
      remainingSeconds: durationSec,
      elapsedSeconds: 0,
      totalCost: price,
      pricePerHour: pph,
      packageName: params.packageName,
      startTime: Date.now(),
      isPaused: false,
      pausedDurationMs: 0,
      memberId: params.memberId,
      rateConfig: params.rateConfig
    };

    this.activeSessions.set(pcId, newSession);

    // Update SQLite Workstations table
    DbService.updateWorkstationState(pcId, 'in_use', {
      username: newSession.username,
      type: newSession.billingType,
      remainingSeconds: newSession.remainingSeconds,
      elapsedSeconds: 0,
      totalCost: newSession.totalCost,
      pricePerHour: newSession.pricePerHour,
      packageName: newSession.packageName
    });

    // Send unlock packet to client
    const sessionPayload: SessionData = {
      sessionId: `SES-${Date.now()}`,
      pcId,
      username: newSession.username,
      userType: newSession.userType,
      billingType: newSession.billingType,
      remainingSeconds: newSession.remainingSeconds,
      elapsedSeconds: 0,
      timeRemainingMinutes: Math.ceil(newSession.remainingSeconds / 60),
      timeUsedMinutes: 0,
      totalSpent: newSession.totalCost,
      moneyUsed: newSession.totalCost,
      pricePerHour: newSession.pricePerHour,
      startTime: newSession.startTime,
      packageName: newSession.packageName
    };

    ServerNetworkBridge.sendToClient(pcId, OpCode.SESSION_BEGIN, sessionPayload);
    ServerNetworkBridge.sendToClient(pcId, OpCode.SCREEN_UNLOCK, {});

    // Log transaction if paid upfront and NOT admin
    if (price > 0 && !isAdmin) {
      const durMin = params.durationMinutes || 60;
      const formattedDur = durMin >= 60 ? `${Math.floor(durMin / 60)}j ${durMin % 60}m` : `${durMin}m`;
      DbService.addTransaction({
        username: newSession.username,
        date: new Date().toLocaleDateString('id-ID'),
        time: new Date().toTimeString().split(' ')[0],
        price,
        timeUsed: formattedDur,
        staff: 'GCNET',
        note: `GCNET Sesi paket dimulai [paket: ${params.packageName || 'Paket'}], [harga: ${price.toLocaleString('id-ID')}]${params.paidOnline ? ` ${TRANSFER_NOTE}` : ''}`
      });
    }

    this.notifyListeners();
    return true;
  }

  /**
   * Pause workstation session (AFK lock)
   */
  public static pauseSession(pcId: string): void {
    const session = this.getSession(pcId);
    if (!session || session.isPaused) return;

    session.isPaused = true;
    session.lastPauseTimestamp = Date.now();
    DbService.updateWorkstationState(session.pcId, 'suspended', {
      username: session.username,
      type: session.billingType,
      remainingSeconds: session.remainingSeconds,
      elapsedSeconds: session.elapsedSeconds,
      totalCost: session.totalCost,
      pricePerHour: session.pricePerHour,
      packageName: session.packageName
    });

    ServerNetworkBridge.sendToClient(session.pcId, OpCode.SCREEN_LOCK, {});
    this.notifyListeners();
  }

  /**
   * Resume paused workstation session
   */
  public static resumeSession(pcId: string): void {
    const session = this.getSession(pcId);
    if (!session || !session.isPaused) return;

    if (session.lastPauseTimestamp) {
      session.pausedDurationMs = (session.pausedDurationMs || 0) + (Date.now() - session.lastPauseTimestamp);
      session.lastPauseTimestamp = undefined;
    }
    session.isPaused = false;

    DbService.updateWorkstationState(session.pcId, 'in_use', {
      username: session.username,
      type: session.billingType,
      remainingSeconds: session.remainingSeconds,
      elapsedSeconds: session.elapsedSeconds,
      totalCost: session.totalCost,
      pricePerHour: session.pricePerHour,
      packageName: session.packageName
    });

    ServerNetworkBridge.sendToClient(session.pcId, OpCode.SCREEN_UNLOCK, {});
    this.notifyListeners();
  }

  /**
   * Staff unlocked a locked PC at the booth: resume a cashier pause, or release the
   * player's own AFK lock. The running session and its bill stay untouched.
   */
  public static operatorUnlock(pcId: string): boolean {
    const session = this.getSession(pcId);
    if (!session) return false;
    if (session.isPaused) {
      this.resumeSession(pcId);
    } else {
      ServerNetworkBridge.sendToClient(session.pcId, OpCode.SCREEN_UNLOCK, {});
    }
    return true;
  }

  /**
   * Stop active workstation session
   */
  public static stopSession(pcId: string, reason: string = 'Selesai', refundedAmount: number = 0, settleNow = false): void {
    const session = this.getSession(pcId);
    let heldBill: { username: string; elapsedSeconds: number; totalCost: number; pricePerHour: number; packageName?: string } | null = null;
    if (session) {
      const minutesUsed = Math.ceil(session.elapsedSeconds / 60);
      const isAdmin = session.userType === 'admin' || session.username.toLowerCase() === 'admin';

      // Bill postpaid on the elapsed time at stop, not on the last tick (which may lag or never have run)
      if (session.billingType === 'postpaid' && !isAdmin) {
        const rate = session.rateConfig ?? { firstHourPrice: session.pricePerHour, nextHoursPrice: session.pricePerHour };
        session.totalCost = calcPersonalBill(rate, session.elapsedSeconds, this.roundingStep()).total;
      }

      // 1. Potong Saldo Member Otomatis dari SQLite Database
      if ((session.billingType === 'member' || session.userType === 'member') && !isAdmin) {
        const spent = session.totalCost;
        if (spent > 0) {
          try {
            const member = session.memberId
              ? db.select().from(schema.userAccounts).where(eq(schema.userAccounts.id, session.memberId)).get()
              : db.select().from(schema.userAccounts).where(eq(schema.userAccounts.name, session.username)).get();

            if (member) {
              let remainingCost = spent;
              const ratePerMin = session.pricePerHour / 60;
              
              // 1. Potong Free Minutes
              let currentFreeMinutes = member.freeMinutes || 0;
              const freeMinutesMoney = currentFreeMinutes * ratePerMin;
              
              if (currentFreeMinutes > 0) {
                if (freeMinutesMoney >= remainingCost) {
                  const usedFreeMins = Math.ceil(remainingCost / ratePerMin);
                  currentFreeMinutes -= usedFreeMins;
                  remainingCost = 0;
                } else {
                  remainingCost -= freeMinutesMoney;
                  currentFreeMinutes = 0;
                }
              }

              // 2. Potong Free Money
              let currentFreeMoney = member.freeMoney || 0;
              if (remainingCost > 0 && currentFreeMoney > 0) {
                if (currentFreeMoney >= remainingCost) {
                  currentFreeMoney -= remainingCost;
                  remainingCost = 0;
                } else {
                  remainingCost -= currentFreeMoney;
                  currentFreeMoney = 0;
                }
              }

              // 3. Potong Real Money
              const currentMoney = member.money || 0;
              const newBalance = Math.max(0, currentMoney - remainingCost);
              const newUsedAmount = (member.usedAmount || 0) + spent; // total spent across all balances
              
              db.update(schema.userAccounts)
                .set({
                  freeMinutes: currentFreeMinutes,
                  freeMoney: currentFreeMoney,
                  money: newBalance,
                  usedAmount: newUsedAmount,
                  lastLogoutDT: Date.now()
                })
                .where(eq(schema.userAccounts.id, member.id))
                .run();

              console.log(`[BILLING ENGINE] Member [${session.username}] balance deducted: -Rp ${remainingCost.toLocaleString('id-ID')} (Remaining: Rp ${newBalance.toLocaleString('id-ID')}). FreeMin/FreeMoney utilized if available.`);
            }
          } catch (err) {
            console.error(`[BILLING ENGINE ERROR] Failed to deduct member balance:`, err);
          }

          DbService.addTransaction({
            username: session.username,
            date: new Date().toLocaleDateString('id-ID'),
            time: new Date().toTimeString().split(' ')[0],
            price: spent,
            timeUsed: `${minutesUsed}m`,
            staff: 'Operator',
            note: `Pemakaian Saldo Member [${session.username}] (${minutesUsed}m) - ${reason}`
          });
        }
      }

      // 2. Postpaid: hold the bill as unpaid until the cashier settles it (settleUnpaid);
      //    settleNow is only for flows that cannot keep a pending bill, like deleting the PC.
      else if (session.billingType === 'postpaid' && !isAdmin && session.totalCost > 0 && !settleNow
        && DbService.getWorkstations().some(w => [w.name, w.pcId].some(k => (k || '').toUpperCase() === session.pcId.toUpperCase()))) {
        heldBill = {
          username: session.username,
          elapsedSeconds: session.elapsedSeconds,
          totalCost: session.totalCost,
          pricePerHour: session.pricePerHour,
          packageName: session.packageName
        };
      }
      else if (session.billingType === 'postpaid' && !isAdmin && session.totalCost > 0) {
        DbService.addTransaction({
          username: session.username,
          date: new Date().toLocaleDateString('id-ID'),
          time: new Date().toTimeString().split(' ')[0],
          price: session.totalCost,
          timeUsed: `${minutesUsed}m`,
          staff: 'Operator',
          note: `Pembayaran Sesi Pasca-Bayar [${pcId}] - ${reason}`
        });
      }

      // 3. Commit Session Log ke SQLite SessionLogs Table
      try {
        db.insert(schema.sessionLogs).values({
          sessionId: Math.floor(session.startTime / 1000),
          workstationId: Number(pcId.replace(/\D/g, '')) || 1,
          accountId: session.memberId || 0,
          username: session.username,
          accountType: session.userType === 'member' ? 1 : session.billingType === 'postpaid' ? 2 : 0,
          startDate: new Date(session.startTime).toLocaleDateString('id-ID'),
          startTime: new Date(session.startTime).toLocaleTimeString('id-ID'),
          stopDate: new Date().toLocaleDateString('id-ID'),
          stopTime: new Date().toLocaleTimeString('id-ID'),
          minutesAvailable: Math.ceil(session.initialTotalSeconds / 60),
          minutesUsed: minutesUsed,
          timePrice: session.totalCost,
          realMoneyUsed: session.totalCost,
          paidMoney: heldBill ? 0 : session.totalCost,
          status: heldBill ? 'unpaid' : 'completed',
          note: reason,
          staff: 'Operator'
        }).run();
      } catch (err) {
        console.error(`[BILLING ENGINE ERROR] Failed to record session log:`, err);
      }

      this.activeSessions.delete(session.pcId);
      this.activeSessions.delete(pcId);

      const ended: SessionEndedEvent = {
        pcId: session.pcId,
        username: session.username,
        userType: session.userType,
        billingType: session.billingType,
        packageName: session.packageName,
        totalCost: isAdmin ? 0 : session.totalCost,
        refundedAmount: isAdmin ? 0 : Math.max(0, refundedAmount),
        startTime: session.startTime,
        endTime: Date.now(),
        reason
      };
      this.sessionEndedListeners.forEach(listener => {
        try {
          listener(ended);
        } catch (err) {
          console.error('[BILLING ENGINE] Listener sesi berakhir gagal:', err);
        }
      });
    }

    // Reset workstation in SQLite, or keep it blocked with the pending bill
    if (heldBill) {
      DbService.updateWorkstationState(session!.pcId, 'unpaid', {
        username: heldBill.username,
        type: 'postpaid',
        remainingSeconds: 0,
        elapsedSeconds: heldBill.elapsedSeconds,
        totalCost: heldBill.totalCost,
        pricePerHour: heldBill.pricePerHour,
        packageName: heldBill.packageName
      });
    } else if (session || !this.findUnpaidWorkstation(pcId)) {
      // A repeat stop (e.g. the client's own logout after SESSION_END) must not wipe a pending bill
      DbService.updateWorkstationState(pcId, 'idle');
    }

    // Send cutoff packet to client
    ServerNetworkBridge.sendToClient(pcId, OpCode.SESSION_END, { reason });
    ServerNetworkBridge.sendToClient(pcId, OpCode.SCREEN_LOCK, {});

    this.notifyListeners();
  }


  public static hasActiveSessions(): boolean {
    return this.activeSessions.size > 0;
  }

  public static getSession(pcId: string): ActiveSessionState | undefined {
    if (this.activeSessions.has(pcId)) return this.activeSessions.get(pcId);
    const upper = pcId.toUpperCase();
    for (const [key, session] of this.activeSessions.entries()) {
      if (key.toUpperCase() === upper || session.pcId.toUpperCase() === upper || session.username.toUpperCase() === upper) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Refund / Kembalikan Sisa Waktu
   * Aturan: Harga refund = Sisa waktu * (pricePerHour/60) * 0.5 (Penalti 50% lebih murah)
   */
  public static refundSession(
    pcId: string,
    options?: {
      reason?: string;
      refundToBalance?: boolean;
      customAmount?: number;
      penaltyPercent?: number;
      refundMode?: 'full' | 'queued_only';
    }
  ): { success: boolean; message: string; refundAmount?: number } {
    const session = this.getSession(pcId);
    if (!session) return { success: false, message: `Tidak ada sesi aktif di workstation ${pcId}.` };
    if (session.billingType === 'postpaid') return { success: false, message: `Sesi pasca-bayar tidak bisa di-refund.` };
    // Member balance is only charged for time actually used when the session stops, so there is nothing to give back.
    if (session.billingType === 'member') return { success: false, message: 'Sesi saldo member tidak perlu refund. Saldo hanya dipotong sesuai waktu yang dipakai saat sesi selesai.' };
    // Never hand back more cash than this session took in (free, admin and voucher sessions took nothing).
    const paid = Math.max(0, Math.round(session.totalCost || 0));
    if (paid <= 0) return { success: false, message: 'Sesi ini tidak dibayar, jadi tidak ada uang yang bisa dikembalikan.' };

    // 0% is a valid setting (full refund), so only a missing or broken value falls back to 50%.
    const rawPenalty = DbService.getSetting('refundPenaltyPercent', '50').trim();
    const storedPenalty = rawPenalty === '' ? NaN : Number(rawPenalty);
    const configuredPenalty = Number.isFinite(storedPenalty) ? Math.max(0, Math.min(100, storedPenalty)) : 50;
    const penalty = options?.penaltyPercent !== undefined ? Math.max(0, Math.min(100, options.penaltyPercent)) : configuredPenalty;

    const queuedStacks = (session.stackedPackages || []).filter(p => p.status === 'Not Used');
    const queuedPrice = queuedStacks.reduce((sum, p) => sum + (p.price || 0), 0);

    // KASUS 1: Hanya batalkan antrian paket belum terpakai (Paket aktif tetap jalan)
    if (options?.refundMode === 'queued_only') {
      if (queuedStacks.length === 0) {
        return { success: false, message: 'Tidak ada antrian paket belum terpakai untuk dibatalkan.' };
      }

      const refundAmount = Math.max(0, Math.min(Math.round(options?.customAmount ?? queuedPrice), queuedPrice));
      
      // Hapus paket Not Used dari antrian (remainingSeconds hanya milik paket aktif, jadi tidak ikut dikurangi)
      session.stackedPackages = (session.stackedPackages || []).filter(p => p.status !== 'Not Used');
      session.totalCost = Math.max(0, (session.totalCost || 0) - queuedPrice);

      const isAdmin = session.userType === 'admin' || session.username.toLowerCase() === 'admin';
      if (!isAdmin) {
        if (options?.refundToBalance && session.userType === 'member') {
          const members = DbService.getMembers();
          const mem = members.find(m => m.username.toLowerCase() === session.username.toLowerCase());
          if (mem) {
            DbService.topUpMember(mem.id, refundAmount, 'Kasir (Batal Antrian Paket)');
          }
        }
        DbService.addTransaction({
          username: session.username,
          date: new Date().toLocaleDateString('id-ID'),
          time: new Date().toTimeString().split(' ')[0],
          price: -refundAmount,
          timeUsed: '0m',
          staff: 'GCNET',
          note: `Batal Antrian Paket [${queuedStacks.map(p => p.name).join(', ')}] - ${options?.reason || 'Refund 100%'}${options?.refundToBalance ? ' (Kredit Saldo Member)' : ' (Tunai Kasir)'}`
        });
      }

      // Update status workstation di SQLite
      DbService.updateWorkstationState(session.pcId, session.isPaused ? 'locked' : 'in_use', {
        username: session.username,
        type: session.billingType,
        remainingSeconds: session.remainingSeconds,
        elapsedSeconds: session.elapsedSeconds,
        totalCost: session.totalCost,
        pricePerHour: session.pricePerHour,
        packageName: session.packageName,
      });

      return {
        success: true,
        message: `Berhasil membatalkan ${queuedStacks.length} antrian paket. ${options?.refundToBalance ? 'Kredit saldo member bertambah' : 'Kasir mengembalikan tunai'} Rp ${refundAmount.toLocaleString('id-ID')}`,
        refundAmount
      };
    }

    // KASUS 2: Refund Total (Stop Sesi & Keluar)
    // Sisa detik pada paket aktif (in_use)
    const activeRemainingSec = Math.max(0, session.remainingSeconds); // active package only; queue is refunded in full below
    const activeRemainingMin = Math.ceil(activeRemainingSec / 60);

    const ratePerMin = (session.pricePerHour || 4000) / 60;
    const rawActiveRefund = activeRemainingMin * ratePerMin * ((100 - penalty) / 100);
    const roundedActiveRefund = roundDownToStep(rawActiveRefund, this.roundingStep());

    // Paket Not Used selalu dikembalikan 100% penuh tanpa penalti karena belum disentuh sama sekali
    const calculatedTotalRefund = queuedPrice + roundedActiveRefund;
    const finalRefund = Math.max(0, Math.min(Math.round(options?.customAmount ?? calculatedTotalRefund), paid));

    if (finalRefund <= 0) return { success: false, message: `Sisa waktu terlalu sedikit atau penalti 100%, nominal refund Rp 0.` };

    const remainingMin = Math.ceil(session.remainingSeconds / 60);
    const isAdmin = session.userType === 'admin' || session.username.toLowerCase() === 'admin';
    if (!isAdmin) {
      if (options?.refundToBalance && session.userType === 'member') {
        const members = DbService.getMembers();
        const mem = members.find(m => m.username.toLowerCase() === session.username.toLowerCase());
        if (mem) {
          DbService.topUpMember(mem.id, finalRefund, 'Kasir (Refund)');
        }
      }
      DbService.addTransaction({
        username: session.username,
        date: new Date().toLocaleDateString('id-ID'),
        time: new Date().toTimeString().split(' ')[0],
        price: -finalRefund, // Negatif karena kasir kembalikan uang
        timeUsed: `${remainingMin}m`,
        staff: 'GCNET',
        note: `Refund Sisa Waktu [${remainingMin}m] - ${options?.reason || `Penalti ${penalty}%`}${queuedStacks.length > 0 ? ` + Antrian ${queuedStacks.length} Paket` : ''}${options?.refundToBalance ? ' (Kredit Saldo Member)' : ' (Tunai Kasir)'}`
      });
    }

    this.stopSession(pcId, 'Dihentikan oleh Kasir (Refund)', finalRefund);
    
    return { 
      success: true, 
      message: `Berhasil refund sisa waktu ${remainingMin}m. ${options?.refundToBalance ? 'Kredit saldo member bertambah' : 'Kasir mengembalikan tunai'} Rp ${finalRefund.toLocaleString('id-ID')}`,
      refundAmount: finalRefund 
    };
  }

  /**
   * 1. GANTI PAKET (Replace / Upgrade Active Package In-Use)
   * Mengganti paket yang sedang in_use sekarang juga dengan paket baru.
   * - Mempertahankan waktu/timer yang sudah berjalan (elapsedSeconds tetap).
   * - Menghitung sisa waktu baru = durasi paket baru - waktu yang sudah berjalan.
   * - Menghitung total harga baru dan mencatat selisih bayar di kasir.
   * - Menolak jika durasi paket baru <= waktu terpakai atau harga/durasi lebih kecil dari paket aktif saat ini.
   */
  public static replacePackage(pcId: string, newMinutes: number, price: number, packageName: string): { success: boolean; message: string; diff?: number; remainingMinutes?: number } {
    const session = this.getSession(pcId);
    if (!session) return { success: false, message: `Tidak ada sesi aktif di workstation ${pcId}.` };
    if (session.billingType === 'postpaid') return { success: false, message: `${pcId} memakai tarif personal yang ditagih per waktu main, tidak bisa ditambah atau diganti paket. Akhiri sesi dulu lalu beli paket.` };
    const blocked = this.packageSaleBlock(packageName, false);
    if (blocked) return { success: false, message: blocked };

    newMinutes = Math.max(0, newMinutes);
    price = Math.max(0, price);

    let oldActivePrice = session.totalCost || 0;
    let oldPackageName = session.packageName || 'Paket Aktif';
    if (session.stackedPackages && session.stackedPackages.length > 0) {
      const activeStack = session.stackedPackages.find(p => p.status === 'In Use');
      if (activeStack) {
        oldActivePrice = activeStack.price;
        oldPackageName = activeStack.name;
      }
    }

    const currentElapsedSec = session.elapsedSeconds || 0;
    const currentElapsedMin = Math.floor(currentElapsedSec / 60);
    const newDurationSec = newMinutes * 60;

    // 1. VALIDASI & ATURAN PENOLAKAN:
    // Tolak hanya jika durasi paket baru <= waktu yang sudah terpakai (hasilnya <= 0 / minus)
    if (newMinutes <= currentElapsedMin) {
      const errMsg = `Ganti paket ditolak! Durasi paket tujuan (${newMinutes} menit) lebih kecil atau sama dengan waktu yang sudah dihabiskan (${currentElapsedMin} menit).`;
      console.warn(`[BILLING ENGINE] ${errMsg}`);
      return { success: false, message: errMsg };
    }

    // 2. PERHITUNGAN HARGA & SELISIH KASIR (TANPA REFUND):
    const priceDiff = Math.max(0, price - oldActivePrice);

    // 3. PERHITUNGAN WAKTU & PERTAHANKAN TIMER:
    // Sisa waktu baru = Durasi Paket Baru - Waktu yang sudah berjalan
    session.initialTotalSeconds = newDurationSec;
    session.remainingSeconds = Math.max(0, newDurationSec - currentElapsedSec);
    const newRemainingMin = Math.ceil(session.remainingSeconds / 60);

    // Sinkronisasi timestamp agar tick interval tidak mereset waktu berjalan
    session.startTime = Date.now() - (currentElapsedSec * 1000) - (session.pausedDurationMs || 0);
    session.packageName = packageName;
    session.billingType = 'package';
    session.totalCost = (session.totalCost || 0) + priceDiff; // Tambahkan selisih harga paket baru ke total biaya sesi

    // 4. UPDATE STACKED PACKAGES:
    const newStackItem: StackedPackageItem = {
      id: `stk-${Date.now()}`,
      name: packageName,
      minutes: newMinutes,
      minutesFormatted: `${newMinutes}m`,
      price,
      purchasedAt: new Date().toLocaleTimeString('id-ID'),
      expiredAt: '-',
      status: 'In Use'
    };

    const remainingQueued = (session.stackedPackages || []).filter(p => p.status === 'Not Used');
    session.stackedPackages = [newStackItem, ...remainingQueued];

    // 5. UPDATE SQLITE DATABASE:
    DbService.updateWorkstationState(session.pcId, 'in_use', {
      username: session.username,
      type: session.billingType,
      remainingSeconds: session.remainingSeconds,
      elapsedSeconds: session.elapsedSeconds,
      totalCost: session.totalCost,
      pricePerHour: session.pricePerHour,
      packageName: session.packageName
    });

    // 6. BROADCAST KE CLIENT WORKSTATION:
    ServerNetworkBridge.sendToClient(session.pcId, OpCode.SESSION_BEGIN, {
      sessionId: `SES-${Date.now()}`,
      pcId: session.pcId,
      username: session.username,
      userType: session.userType,
      billingType: session.billingType,
      remainingSeconds: session.remainingSeconds,
      elapsedSeconds: session.elapsedSeconds,
      timeRemainingMinutes: newRemainingMin,
      timeUsedMinutes: currentElapsedMin,
      totalSpent: session.totalCost,
      moneyUsed: session.totalCost,
      pricePerHour: session.pricePerHour,
      startTime: session.startTime,
      packageName: session.packageName
    });

    ServerNetworkBridge.sendToClient(session.pcId, OpCode.REMOTE_COMMAND, {
      action: 'send_message',
      params: { message: `Paket Anda telah diganti ke [${packageName}]! Terpakai: ${currentElapsedMin}m, Sisa waktu: ${newRemainingMin}m.` }
    });

    // 7. PENCATATAN TRANSAKSI SELISIH KASIR (NON-ADMIN):
    // timeUsed = durasi total paket baru (bukan delta) agar tabel log terbaca jelas
    const newTotalFormatted = newMinutes >= 60 ? `${Math.floor(newMinutes / 60)}j ${newMinutes % 60}m` : `${newMinutes}m`;
    const isAdmin = session.userType === 'admin' || session.username.toLowerCase() === 'admin';
    if (priceDiff > 0 && !isAdmin) {
      DbService.addTransaction({
        username: session.username,
        date: new Date().toLocaleDateString('id-ID'),
        time: new Date().toTimeString().split(' ')[0],
        price: priceDiff,
        timeUsed: newTotalFormatted,
        staff: 'GCNET',
        note: `GCNET Ganti Paket dari [${oldPackageName}] ke [${packageName}], [tambah bayar: ${priceDiff.toLocaleString('id-ID')}], [sisa: ${newRemainingMin}m]`
      });
    }

    this.notifyListeners();
    return {
      success: true,
      message: `Berhasil ganti paket ${session.pcId} ke [${packageName}]. Waktu terpakai ${currentElapsedMin}m dipertahankan, sisa waktu baru: ${newRemainingMin}m. Tambah bayar kasir: Rp ${priceDiff.toLocaleString('id-ID')}`,
      diff: priceDiff,
      remainingMinutes: newRemainingMin
    };
  }

  /**
   * 2. TAMBAH PAKET (Stacking Queue / Not Used)
   * Memasukkan paket ke dalam antrian stacking untuk digunakan otomatis saat paket in-use habis.
   */
  public static addStackedPackage(pcId: string, extraMinutes: number, price: number, packageName: string): { success: boolean; message: string } {
    const session = this.getSession(pcId);
    if (!session) return { success: false, message: `Tidak ada sesi aktif di workstation ${pcId}.` };
    if (session.billingType === 'postpaid') return { success: false, message: `${pcId} memakai tarif personal yang ditagih per waktu main, tidak bisa ditambah atau diganti paket. Akhiri sesi dulu lalu beli paket.` };
    const blocked = this.packageSaleBlock(packageName, false);
    if (blocked) return { success: false, message: blocked };

    // SECURITY VALIDATION: Prevent negative bounds
    extraMinutes = Math.max(0, extraMinutes);
    price = Math.max(0, price);
    if (extraMinutes === 0) return { success: false, message: 'Durasi paket tambahan harus lebih dari 0 menit.' };

    // Setting allowStackedPackages=false: no queue, the bought minutes join the running package now.
    const stacking = DbService.getSetting('allowStackedPackages', 'true') !== 'false';
    if (stacking) {
      if (!session.stackedPackages || session.stackedPackages.length === 0) {
        session.stackedPackages = [
          {
            id: `stk-${Date.now() - 100}`,
            name: session.packageName || 'Paket Aktif',
            minutes: Math.ceil(session.initialTotalSeconds / 60),
            minutesFormatted: `${Math.ceil(session.initialTotalSeconds / 60)}m`,
            price: session.totalCost || 0,
            purchasedAt: new Date(session.startTime).toLocaleTimeString('id-ID'),
            expiredAt: '-',
            status: 'In Use'
          }
        ];
      }

      const newItem: StackedPackageItem = {
        id: `stk-${Date.now()}`,
        name: packageName,
        minutes: extraMinutes,
        minutesFormatted: `${extraMinutes}m`,
        price,
        purchasedAt: new Date().toLocaleTimeString('id-ID'),
        expiredAt: '-',
        status: 'Not Used'
      };

      session.stackedPackages.push(newItem);

      // We DO NOT modify session.initialTotalSeconds or session.remainingSeconds directly here!
      // The queue engine in tick() will automatically activate it when the current package expires.
    } else {
      session.initialTotalSeconds += extraMinutes * 60;
      session.remainingSeconds += extraMinutes * 60;
      const running = (session.stackedPackages || []).find(p => p.status === 'In Use');
      if (running) {
        running.minutes += extraMinutes;
        running.minutesFormatted = `${running.minutes}m`;
        running.price += price;
      }
    }

    session.totalCost = (session.totalCost || 0) + price;
    
    const queuedSeconds = (session.stackedPackages || [])
      .filter(p => p.status === 'Not Used')
      .reduce((sum, p) => sum + (p.minutes * 60), 0);
    const totalRemainingSec = session.remainingSeconds + queuedSeconds;
    const totalRemainingMin = Math.ceil(totalRemainingSec / 60);

    // Update SQLite
    DbService.updateWorkstationState(session.pcId, 'in_use', {
      username: session.username,
      type: session.billingType,
      remainingSeconds: totalRemainingSec,
      elapsedSeconds: session.elapsedSeconds,
      totalCost: session.totalCost,
      pricePerHour: session.pricePerHour,
      packageName: session.packageName
    });

    // Broadcast ke client
    ServerNetworkBridge.sendToClient(session.pcId, OpCode.SESSION_BEGIN, {
      sessionId: `SES-${Date.now()}`,
      pcId: session.pcId,
      username: session.username,
      userType: session.userType,
      billingType: session.billingType,
      remainingSeconds: totalRemainingSec,
      elapsedSeconds: session.elapsedSeconds,
      timeRemainingMinutes: totalRemainingMin,
      timeUsedMinutes: Math.floor(session.elapsedSeconds / 60),
      totalSpent: session.totalCost,
      moneyUsed: session.totalCost,
      pricePerHour: session.pricePerHour,
      startTime: session.startTime,
      packageName: session.packageName
    });

    ServerNetworkBridge.sendToClient(session.pcId, OpCode.REMOTE_COMMAND, {
      action: 'send_message',
      params: { message: stacking
        ? `Paket antrian [${packageName}] (${extraMinutes}m) berhasil ditambahkan! Total sisa waktu: ${totalRemainingMin}m.`
        : `Waktu bertambah ${extraMinutes}m dari [${packageName}]. Total sisa waktu: ${totalRemainingMin}m.` }
    });

    const isStackAdmin = session.userType === 'admin' || session.username.toLowerCase() === 'admin';
    if (price > 0 && !isStackAdmin) {
      const formattedExtraDur = extraMinutes >= 60 ? `${Math.floor(extraMinutes / 60)}j ${extraMinutes % 60}m` : `${extraMinutes}m`;
      DbService.addTransaction({
        username: session.username,
        date: new Date().toLocaleDateString('id-ID'),
        time: new Date().toTimeString().split(' ')[0],
        price,
        timeUsed: formattedExtraDur,
        staff: 'GCNET',
        note: `GCNET Paket terbeli, [paket: ${packageName}], [harga: ${price.toLocaleString('id-ID')}]`
      });
    }

    this.notifyListeners();
    return { success: true, message: stacking ? `${packageName} (${extraMinutes}m) masuk antrian ${pcId}.` : `${packageName} (${extraMinutes}m) langsung ditambahkan ke paket aktif ${pcId}.` };
  }

  /**
   * Extend active workstation duration
   */
  public static extendSession(pcId: string, extraMinutes: number, price: number, packageName?: string): { success: boolean; message: string } {
    return this.addStackedPackage(pcId, extraMinutes, price, packageName || 'Tambah Waktu');
  }

  /**
   * DEV / TESTING TOOL: Fast-forward / set simulated elapsed minutes on active session
   */
  public static simulateSessionElapsed(pcId: string, elapsedMinutes: number): boolean {
    const session = this.getSession(pcId);
    if (!session) return false;

    const elapSec = elapsedMinutes * 60;
    session.elapsedSeconds = elapSec;
    session.startTime = Date.now() - (elapSec * 1000);
    session.remainingSeconds = Math.max(0, session.initialTotalSeconds - elapSec);

    DbService.updateWorkstationState(session.pcId, session.isPaused ? 'locked' : 'in_use', {
      username: session.username,
      type: session.billingType,
      remainingSeconds: session.remainingSeconds,
      elapsedSeconds: session.elapsedSeconds,
      totalCost: session.totalCost,
      pricePerHour: session.pricePerHour,
      packageName: session.packageName
    });

    this.notifyListeners();
    return true;
  }

  /**
   * Transfer active session from one PC to another
   */
  public static transferSession(fromPcId: string, toPcId: string): boolean {
    const session = this.activeSessions.get(fromPcId);
    if (!session) return false;

    // Remove from old PC and stop it
    this.activeSessions.delete(fromPcId);
    DbService.updateWorkstationState(fromPcId, 'idle');
    ServerNetworkBridge.sendToClient(fromPcId, OpCode.SESSION_END, { reason: `Pindah ke ${toPcId}` });
    ServerNetworkBridge.sendToClient(fromPcId, OpCode.SCREEN_LOCK, {});

    // Set to new PC
    session.pcId = toPcId;
    this.activeSessions.set(toPcId, session);
    DbService.updateWorkstationState(toPcId, 'in_use', {
      username: session.username,
      type: session.billingType,
      remainingSeconds: session.remainingSeconds,
      elapsedSeconds: session.elapsedSeconds,
      totalCost: session.totalCost,
      pricePerHour: session.pricePerHour,
      packageName: session.packageName
    });

    ServerNetworkBridge.sendToClient(toPcId, OpCode.SESSION_BEGIN, {
      sessionId: `SES-${Date.now()}`,
      pcId: toPcId,
      username: session.username,
      userType: session.userType,
      billingType: session.billingType,
      remainingSeconds: session.remainingSeconds,
      elapsedSeconds: session.elapsedSeconds,
      timeRemainingMinutes: Math.ceil(session.remainingSeconds / 60),
      timeUsedMinutes: Math.floor(session.elapsedSeconds / 60),
      totalSpent: session.totalCost,
      moneyUsed: session.totalCost,
      pricePerHour: session.pricePerHour,
      startTime: session.startTime,
      packageName: session.packageName
    });
    ServerNetworkBridge.sendToClient(toPcId, OpCode.SCREEN_UNLOCK, {});

    this.notifyListeners();
    return true;
  }

  // ==================== LISTENERS & SYNC ====================

  /**
   * Resync active session to a reconnected client (Reboot / Power-Outage Auto Unlock)
   */
  /**
   * Potong waktu yang dipakai client selama server mati / LAN putus (server menjeda countdown saat client disconnect).
   * Hanya menambah elapsed, tidak pernah mengurangi, jadi snapshot palsu tidak bisa memberi waktu gratis.
   */
  public static reconcileClientSnapshot(pcId: string, snap?: ClientSessionSnapshot): void {
    if (!snap || typeof snap.elapsedSeconds !== 'number' || !Number.isFinite(snap.elapsedSeconds)) return;
    const session = this.getSession(pcId);
    if (!session || session.username.toLowerCase() !== String(snap.username || '').toLowerCase()) return;

    const offlineSec = Math.floor(snap.elapsedSeconds - session.elapsedSeconds);
    if (offlineSec > 0) {
      // Geser startTime mundur = elapsed bertambah; tick berikutnya menghitung ulang sisa waktu, memotong
      // kelebihan ke paket antrian lewat rollOverStackedPackages, lalu auto-cutoff kalau semua habis.
      session.startTime -= offlineSec * 1000;
      session.elapsedSeconds += offlineSec;
      console.log(`[BILLING ENGINE] ${pcId}: potong ${offlineSec}s pemakaian offline (User: ${session.username}).`);
    }

    if (snap.ended) {
      this.stopSession(session.pcId, 'Logout Selesai (Pengguna, saat offline)');
    }
  }

  public static resyncClient(pcId: string): void {
    let session = this.getSession(pcId);

    // Fallback: jika server baru restart, pulihkan sesi aktif langsung dari SQLite
    if (!session) {
      const rows = db.select().from(schema.workstations).all();
      const cleanId = pcId.trim().toUpperCase();
      const ws = rows.find(r => r.pcId?.toUpperCase() === cleanId || r.name?.toUpperCase() === cleanId);
      
      if (ws && ws.currentUser && (ws.state === 'in_use' || ws.state === 'suspended' || ws.state === 'locked' || ws.state === 'active_guest' || ws.state === 'active_member')) {
        const rem = Number(ws.remainingSeconds) || 0;
        const elap = Number(ws.elapsedSeconds) || 0;
        const spent = Number(ws.totalSpent) || 0;
        const isMem = ws.currentUser.toLowerCase().includes('member') || ws.billingType === 'member';

        session = {
          pcId: ws.name || pcId,
          username: ws.currentUser,
          userType: (isMem ? 'member' : 'guest') as SessionUserType,
          billingType: (ws.billingType || (rem > 0 ? 'package' : 'postpaid')) as SessionBillingType,
          initialTotalSeconds: rem + elap,
          remainingSeconds: rem,
          elapsedSeconds: elap,
          totalCost: spent,
          pricePerHour: Number(ws.sessionPricePerHour) || Number(ws.pricePerHour) || 4000,
          packageName: ws.packageName || undefined,
          startTime: Date.now() - elap * 1000,
          isPaused: ws.state === 'suspended' || ws.state === 'locked',
          pausedDurationMs: 0,
          stackedPackages: [
            {
              id: `stk-${Date.now()}`,
              name: ws.packageName || 'Paket Aktif',
              minutes: Math.ceil((rem + elap) / 60) || 60,
              minutesFormatted: `${Math.ceil((rem + elap) / 60) || 60}m`,
              price: spent,
              purchasedAt: new Date().toLocaleTimeString('id-ID'),
              expiredAt: '-',
              status: 'In Use'
            }
          ]
        };
        this.activeSessions.set(session.pcId, session);
        console.log(`[BILLING ENGINE] Recovered persisted session from SQLite for ${pcId} (User: ${session.username}, Sisa: ${Math.ceil(rem / 60)}m).`);
      }
    }

    if (!session) return;

    const totalRemainingSec = session.remainingSeconds;
    const sessionPayload: SessionData = {
      sessionId: `SES-${session.startTime}`,
      pcId,
      username: session.username,
      userType: session.userType,
      billingType: session.billingType,
      remainingSeconds: totalRemainingSec,
      elapsedSeconds: session.elapsedSeconds,
      timeRemainingMinutes: Math.ceil(totalRemainingSec / 60),
      timeUsedMinutes: Math.floor(session.elapsedSeconds / 60),
      totalSpent: session.totalCost,
      moneyUsed: session.totalCost,
      pricePerHour: session.pricePerHour,
      startTime: session.startTime,
      packageName: session.packageName
    };

    ServerNetworkBridge.sendToClient(pcId, OpCode.SESSION_BEGIN, sessionPayload);
    
    if (session.isPaused) {
      ServerNetworkBridge.sendToClient(pcId, OpCode.SCREEN_LOCK, {});
    } else {
      ServerNetworkBridge.sendToClient(pcId, OpCode.SCREEN_UNLOCK, {});
    }
  }

  public static getLiveWorkstations(): Workstation[] {
    const workstations = DbService.getWorkstations();
    const connectedClients = ServerNetworkBridge.getConnectedClients();
    const connectedPcIds = new Set(connectedClients.map(c => (c.pcName || c.pcId).toUpperCase()));
    const exeOverrides = parseExeSettings(DbService.getSetting(EXE_SETTINGS_KEY))?.overrides ?? {};

    return workstations.map((ws): Workstation => {
      // Matched by name only: every connecting client registers its own row (upsertWorkstation),
      // and an IP match marked unrelated rows online when they shared a stale or placeholder IP.
      const isConnected = connectedPcIds.has(ws.name.toUpperCase()) ||
                          connectedPcIds.has(`PC-${ws.id}`.toUpperCase());
      const session = this.getSession(ws.name);

      const pcKey = ws.name.toUpperCase();
      const pendingOrders = this.pendingOrdersMap.get(pcKey) || [];
      const hasPendingOrder = pendingOrders.length > 0;
      const firstOrder = pendingOrders[0];
      const pendingSummary = hasPendingOrder && firstOrder
        ? `${firstOrder.items?.length || 1} Item (Rp ${(firstOrder.totalPrice || 0).toLocaleString('id-ID')})`
        : undefined;

      // Pending postpaid bill survives restarts and power-offs until the cashier settles it
      if (!session && ws.state === 'unpaid') {
        return {
          ...ws,
          billingType: 'postpaid',
          hasPendingOrder,
          pendingOrderCount: pendingOrders.length,
          pendingOrderSummary: pendingSummary,
          isDisconnected: !isConnected
        };
      }

      if (!isConnected && !session) {
        return {
          ...ws,
          state: 'offline',
          hasPendingOrder,
          pendingOrderCount: pendingOrders.length,
          pendingOrderSummary: pendingSummary
        };
      }

      if (session) {
        const isAdmin = session.userType === 'admin' || session.username.toLowerCase() === 'admin';
        const queuedSeconds = (session.stackedPackages || [])
          .filter(p => p.status === 'Not Used')
          .reduce((sum, p) => sum + (p.minutes * 60), 0);
        const totalRemainingSec = session.remainingSeconds + queuedSeconds;

        let computedState: Workstation['state'] = isAdmin ? 'active_guest' : (session.userType === 'member' ? 'active_member' : 'active_guest');
        if (session.isPaused) {
          computedState = 'locked';
        }

        return {
          ...ws,
          state: computedState,
          username: session.username,
          userType: isAdmin ? 'admin' : (session.userType === 'member' ? 'member' : 'guest'),
          timeUsedMinutes: Math.floor(session.elapsedSeconds / 60),
          timeRemainingMinutes: isAdmin ? undefined : (totalRemainingSec > 0 ? Math.ceil(totalRemainingSec / 60) : undefined),
          remainingSeconds: isAdmin ? undefined : totalRemainingSec,
          moneyUsed: isAdmin ? 0 : session.totalCost,
          packageName: session.packageName,
          stackedPackages: session.stackedPackages,
          billingType: session.billingType,
          sessionStartedAt: session.startTime,
          activeApp: this.activeApps.get(pcKey) || this.activeApps.get(session.pcId.toUpperCase()),
          ...(session.billingType === 'postpaid' && !isAdmin ? (() => {
            const rate = session.rateConfig ?? { firstHourPrice: session.pricePerHour, nextHoursPrice: session.pricePerHour };
            return {
              personalBill: calcPersonalBill(rate, session.elapsedSeconds, this.roundingStep()),
              personalRate: { ...rate, accumulationMinutes: normalizeAccumulationMinutes(rate.accumulationMinutes) }
            };
          })() : {}),
          hasPendingOrder,
          pendingOrderCount: pendingOrders.length,
          pendingOrderSummary: pendingSummary,
          isDisconnected: !isConnected // Kasir perlu tahu PC mati tapi waktu jalan
        };
      }

      return {
        ...ws,
        state: 'idle',
        hasPendingOrder,
        pendingOrderCount: pendingOrders.length,
        pendingOrderSummary: pendingSummary
      };
    }).map(w => {
      const key = w.name.toUpperCase();
      const agent = this.agentStates.get(key);
      return { ...w, kioskEnabled: agent?.kioskEnabled, exeMode: agent?.exeMode, exeOverride: exeOverrides[key] };
    });
  }

  public static setPendingOrder(pcId: string, order: any): void {
    const key = pcId.trim().toUpperCase();
    const existing = this.pendingOrdersMap.get(key) || [];
    this.pendingOrdersMap.set(key, [order, ...existing.filter(o => o.id !== order.id)]);
    this.notifyListeners();
  }

  public static clearPendingOrder(pcId: string, orderId?: number): void {
    const key = pcId.trim().toUpperCase();
    if (orderId) {
      const existing = this.pendingOrdersMap.get(key) || [];
      const updated = existing.filter(o => o.id !== orderId);
      if (updated.length > 0) {
        this.pendingOrdersMap.set(key, updated);
      } else {
        this.pendingOrdersMap.delete(key);
      }
    } else {
      this.pendingOrdersMap.delete(key);
    }
    this.notifyListeners();
  }


  public static addWorkstation(data: { name: string; ip?: string; mac?: string; groupName?: string; pricePerHour?: number }): { success: boolean; message?: string } {
    const result = DbService.addWorkstation(data);
    if (result.success) this.notifyListeners();
    return result;
  }

  public static addWorkstationBatch(prefix: string, fromNum: number, toNum: number, groupName = 'Area Reguler', pricePerHour = 4000) {
    const result = DbService.addWorkstationBatch(prefix, fromNum, toNum, groupName, pricePerHour);
    if (result.added.length) this.notifyListeners();
    return result;
  }

  public static updateWorkstationSettings(items: { id: number; groupName: string; pricePerHour: number }[]) {
    const result = DbService.updateWorkstationSettings(items);
    if (result.success) this.notifyListeners();
    return result;
  }

  /** Why a PC cannot be renamed right now, or null. Sessions, bills and orders are keyed by the name. */
  public static renameBlock(pcId: string): string | null {
    if (this.getSession(pcId)) return `${pcId} sedang dipakai. Ganti nama setelah sesinya selesai.`;
    const key = pcId.trim().toUpperCase();
    const ws = DbService.getWorkstations().find(w => w.name.toUpperCase() === key || (w.pcId || '').toUpperCase() === key);
    if (ws?.state === 'unpaid') return `${pcId} masih punya tagihan belum bayar. Lunasi dulu.`;
    if ((this.pendingOrdersMap.get(key) || []).length > 0) return `${pcId} masih punya pesanan yang belum diproses.`;
    return null;
  }

  public static renameWorkstation(pcId: string, newName: string): { success: boolean; message: string } {
    const blocked = this.renameBlock(pcId);
    if (blocked) return { success: false, message: blocked };
    const res = DbService.renameWorkstation(pcId, newName);
    if (!res.success) return res;
    this.activeApps.delete(pcId.trim().toUpperCase());
    this.notifyListeners();
    return res;
  }

  public static deleteWorkstation(identifier: { id?: number; name?: string; pcId?: string } | string | number): void {
    let nameStr = '';
    let pcIdStr = '';
    if (typeof identifier === 'object' && identifier !== null) {
      nameStr = identifier.name || '';
      pcIdStr = identifier.pcId || '';
    } else {
      nameStr = String(identifier);
      pcIdStr = String(identifier);
    }

    const keysToClean = [nameStr, pcIdStr, nameStr.toUpperCase(), pcIdStr.toUpperCase()].filter(Boolean);

    keysToClean.forEach(key => {
      if (this.activeSessions.has(key)) {
        this.stopSession(key, 'Workstation Dihapus', 0, true);
      }
      this.activeSessions.delete(key);
      this.pendingOrdersMap.delete(key);
    });

    DbService.deleteWorkstation(identifier);
    this.notifyListeners();
  }

  public static onStateChange(listener: EngineChangeCallback): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public static notifyListeners(): void {
    const workstations = this.getLiveWorkstations();
    this.listeners.forEach(fn => fn(workstations));
  }
}
