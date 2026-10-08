import { eq, desc, or, and, ne, sql } from 'drizzle-orm';
import { db, sqlite } from './index';
import * as schema from './schema';
import { hashPassword, verifyPassword } from './password';
import { normalizeAccumulationMinutes } from '../../shared/personalBilling';
import { classifyTransaction, isoDayStart, summarizeCash, txTimestamp } from '../../shared/transactions';
import { pcNameError } from '../../shared/pcName';
import {
  BillingPackage,
  PersonalRateConfig,
  MemberAccount,
  CouponAccount,
  TransactionRecord,
  Workstation,
  WorkstationState,
  ProductItem,
  ProductCategoryItem,
  InventorySummary,
  StockAdjustmentParams,
  OrderRecord,
  OrderItemDetail,
  SystemLogRecord,
  ShiftRecord,
  ShiftAuditSummary,
  ShiftHandoverParams,
  ShiftHandoverResult,
  EmployeeAccount,
  EmployeeRole,
  EmployeeLoginResult
} from '../../shared/types';

/**
 * DbService: Central SQLite Database Service for GC-Hub Server
 * Handles CRUD operations and auto-seeds initial default datasets.
 */
function formatPackageTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  return `${hours > 0 ? `${hours}j ` : ''}${totalMinutes % 60}m`;
}

// ponytail: slot is only a label from the clock at open time (07/15/23); make the boundaries a setting if a warnet needs other hours
function shiftSlotAt(date: Date): number {
  const h = date.getHours();
  if (h >= 7 && h < 15) return 1;
  return h >= 15 && h < 23 ? 2 : 3;
}

function shiftLabel(slot: number): string {
  return slot === 1 ? 'Shift Pagi' : slot === 2 ? 'Shift Sore' : 'Shift Malam';
}

export class DbService {
  private static isInitialized = false;

  /**
   * Initialize tables and seed default data if empty
   */
  public static async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.seedDefaults();
      this.isInitialized = true;
      console.log('[DB SERVICE] SQLite Database Initialized & Seeded Successfully.');
    } catch (err) {
      console.error('[DB SERVICE ERROR] Failed to initialize SQLite tables:', err);
      throw err;
    }
  }

  private static async seedDefaults(): Promise<void> {
    // 1. Seed Charging Rates (Default templates)
    const existingRates = db.select().from(schema.chargingRates).all();
    if (existingRates.length === 0) {
      db.insert(schema.chargingRates).values([
        { id: 'rate-reguler', name: 'Tarif Reguler (Rp 4.000/jam)', pricePerHour: 4000, minimumCharge: 2000, roundingMinutes: 5, gracePeriodMinutes: 2, isDefault: 1 },
        { id: 'rate-vip', name: 'Tarif VIP Room (Rp 6.000/jam)', pricePerHour: 6000, minimumCharge: 3000, roundingMinutes: 5, gracePeriodMinutes: 2, isDefault: 0 },
        { id: 'rate-happy-hour', name: 'Tarif Happy Hour (Rp 3.000/jam)', pricePerHour: 3000, minimumCharge: 1500, roundingMinutes: 5, gracePeriodMinutes: 2, isDefault: 0 }
      ]).run();
    }

    // 2. Seed Billing Packages (Default templates)
    const existingPackages = db.select().from(schema.billingPackages).all();
    if (existingPackages.length === 0) {
      db.insert(schema.billingPackages).values([
        { id: 'pkt-1', name: 'Paket 1 Jam', durationMinutes: 60, price: 4000, type: 'hourly', allowedGroupsJson: '["Reguler", "VIP"]', isEnabled: 1 },
        { id: 'pkt-2', name: 'Paket 2 Jam', durationMinutes: 120, price: 8000, type: 'hourly', allowedGroupsJson: '["Reguler", "VIP"]', isEnabled: 1 },
        { id: 'pkt-3', name: 'Paket 3 Jam', durationMinutes: 180, price: 12000, type: 'hourly', allowedGroupsJson: '["Reguler", "VIP"]', isEnabled: 1, badge: 'Terlaris' },
        { id: 'pkt-4', name: 'Paket 5 Jam', durationMinutes: 300, price: 18000, type: 'hourly', allowedGroupsJson: '["Reguler", "VIP"]', isEnabled: 1, badge: 'Hemat' },
        { id: 'pkt-night-1', name: 'Paket Malam 6 Jam', durationMinutes: 360, price: 16000, type: 'night', startTime: '22:00', endTime: '06:00', allowedGroupsJson: '["Reguler", "VIP"]', isEnabled: 1, badge: 'Night Owl' },
      ]).run();
    }

    // 3. Seed Product Categories (Makanan, Minuman, Snack)
    const existingCategories = db.select().from(schema.productCategories).all();
    if (existingCategories.length === 0) {
      db.insert(schema.productCategories).values([
        { id: 1, name: 'Makanan', enabled: 1 },
        { id: 2, name: 'Minuman', enabled: 1 },
        { id: 3, name: 'Snack', enabled: 1 }
      ]).run();
    }

    // 4. Seed OrderItems (Katalog Produk F&B)
    const existingProducts = db.select().from(schema.orderItems).all();
    if (existingProducts.length === 0) {
      db.insert(schema.orderItems).values([
        { categoryId: 1, name: 'Mie Goreng Jumbo + Telur', unitPrice: 10000, costPrice: 6000, stock: 25, alertStock: 5, unitName: 'Porsi', enabled: 1 },
        { categoryId: 1, name: 'Indomie Rebus Telur', unitPrice: 9000, costPrice: 5000, stock: 20, alertStock: 5, unitName: 'Porsi', enabled: 1 },
        { categoryId: 1, name: 'Nasi Goreng Spesial', unitPrice: 12000, costPrice: 7000, stock: 15, alertStock: 3, unitName: 'Porsi', enabled: 1 },
        { categoryId: 1, name: 'Roti Bakar Coklat Keju', unitPrice: 8000, costPrice: 4000, stock: 15, alertStock: 3, unitName: 'Pcs', enabled: 1 },
        { categoryId: 2, name: 'Es Teh Manis Dingin', unitPrice: 3000, costPrice: 1000, stock: 50, alertStock: 10, unitName: 'Gelas', enabled: 1 },
        { categoryId: 2, name: 'Es Jeruk Peras', unitPrice: 5000, costPrice: 2000, stock: 30, alertStock: 5, unitName: 'Gelas', enabled: 1 },
        { categoryId: 2, name: 'Kopi Hitam Panas / Dingin', unitPrice: 4000, costPrice: 1500, stock: 40, alertStock: 5, unitName: 'Gelas', enabled: 1 },
        { categoryId: 2, name: 'Air Mineral 600ml', unitPrice: 3000, costPrice: 1500, stock: 48, alertStock: 10, unitName: 'Botol', enabled: 1 },
        { categoryId: 3, name: 'Chitato Sapi Panggang', unitPrice: 5000, costPrice: 3500, stock: 20, alertStock: 5, unitName: 'Pcs', enabled: 1 },
        { categoryId: 3, name: 'Oreo Vanilla', unitPrice: 4000, costPrice: 2500, stock: 20, alertStock: 5, unitName: 'Pcs', enabled: 1 },
        { categoryId: 3, name: 'Coklat Silverqueen 62g', unitPrice: 12000, costPrice: 9000, stock: 10, alertStock: 3, unitName: 'Pcs', enabled: 1 }
      ]).run();
    }

    // 5. Employees & Shifts start empty on fresh install, initialized strictly upon Administrator Setup.

    // 6. Workstations are dynamically populated via GC-Hub Client handshake (CLIENT_REGISTER) or manual cashier creation.
    // No hardcoded mock workstations are seeded.

    // 7. Seed Initial Sample Vouchers (CouponCards)
    const existingCoupons = db.select().from(schema.coupons).all();
    if (existingCoupons.length === 0) {
      const todayStr = new Date().toLocaleDateString('id-ID');
      db.insert(schema.coupons).values([
        { code: 'GC-1001-TEST', type: 'time', name: 'Voucher 1 Jam (Promo)', detail: 'Default Starter Voucher', prefix: 'GC', value: 4000, money: 0, durationMinutes: 60, isUsed: 0, createdAt: todayStr, expiredAt: '31-12-2027', expireDays: 365, enabled: 1 },
        { code: 'GC-1002-TEST', type: 'time', name: 'Voucher 2 Jam (Promo)', detail: 'Default Starter Voucher', prefix: 'GC', value: 8000, money: 0, durationMinutes: 120, isUsed: 0, createdAt: todayStr, expiredAt: '31-12-2027', expireDays: 365, enabled: 1 },
        { code: 'GC-1003-TEST', type: 'money', name: 'Voucher Saldo Rp 10.000', detail: 'Default Starter Voucher', prefix: 'GC', value: 10000, money: 10000, durationMinutes: 0, isUsed: 0, createdAt: todayStr, expiredAt: '31-12-2027', expireDays: 365, enabled: 1 }
      ]).run();
    }
  }

  /**
   * Add a single real workstation manually from Cashier
   */
  public static addWorkstation(data: { name: string; ip?: string; mac?: string; groupName?: string; pricePerHour?: number }): { success: boolean; message?: string } {
    const pcId = (data.name || '').trim();
    const nameError = pcNameError(pcId);
    if (nameError) return { success: false, message: nameError };
    // Unknown IP stays empty until the client connects and reports its own (upsertWorkstation).
    const ip = (data.ip || '').trim();
    if (ip && !/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(ip)) {
      return { success: false, message: `IP ${ip} tidak valid. Contoh: 192.168.1.21, atau kosongkan.` };
    }
    const price = Number(data.pricePerHour ?? 4000);
    if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
      return { success: false, message: 'Tarif per jam harus lebih dari Rp 0.' };
    }
    const groupName = (data.groupName || '').trim().slice(0, 32) || 'Area Reguler';
    const key = pcId.toLowerCase();
    const existing = db.select().from(schema.workstations)
      .where(or(eq(sql`lower(${schema.workstations.pcId})`, key), eq(sql`lower(${schema.workstations.name})`, key)))
      .get();
    if (existing) {
      return { success: false, message: `Nama ${existing.name} sudah dipakai PC lain.` };
    }
    db.insert(schema.workstations).values({
      pcId,
      name: pcId,
      ip,
      mac: data.mac || '00:00:00:00:00:00',
      groupName,
      state: 'offline',
      pricePerHour: Math.round(price),
      lastSeen: Date.now()
    }).run();
    return { success: true };
  }

  /**
   * Change the member rate and group of existing PCs. All rows are validated before any is written,
   * so one bad row leaves the table untouched. Running sessions keep the rate they started with.
   */
  public static updateWorkstationSettings(items: { id: number; groupName: string; pricePerHour: number }[]): { success: boolean; message: string; updated: number } {
    if (!Array.isArray(items) || items.length === 0) return { success: false, message: 'Tidak ada perubahan untuk disimpan.', updated: 0 };
    const known = new Map(db.select().from(schema.workstations).all().map(w => [w.id, w.name]));
    const clean: { id: number; groupName: string; pricePerHour: number }[] = [];
    for (const item of items) {
      const id = Number(item?.id);
      const name = known.get(id);
      if (!name) return { success: false, message: 'Ada PC yang sudah dihapus. Muat ulang daftar PC.', updated: 0 };
      const price = Number(item.pricePerHour);
      if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
        return { success: false, message: `Tarif ${name} harus lebih dari Rp 0.`, updated: 0 };
      }
      const groupName = String(item.groupName ?? '').trim().slice(0, 32);
      if (!groupName) return { success: false, message: `Grup ${name} tidak boleh kosong.`, updated: 0 };
      clean.push({ id, groupName, pricePerHour: Math.round(price) });
    }
    db.transaction(tx => {
      for (const c of clean) {
        tx.update(schema.workstations).set({ groupName: c.groupName, pricePerHour: c.pricePerHour }).where(eq(schema.workstations.id, c.id)).run();
      }
    });
    return { success: true, message: `${clean.length} PC diperbarui.`, updated: clean.length };
  }

  /**
   * Add a numbered range (e.g. prefix "PC-", 1 to 20 gives PC-01 .. PC-20). Names already taken are skipped.
   */
  public static addWorkstationBatch(prefix: string, fromNum: number, toNum: number, groupName = 'Area Reguler', pricePerHour = 4000): { success: boolean; message: string; added: string[]; skipped: string[] } {
    const from = Number(fromNum);
    const to = Number(toNum);
    const fail = (message: string) => ({ success: false, message, added: [], skipped: [] });
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 999 || from > to) {
      return fail('Nomor harus 1 sampai 999, dan nomor awal tidak boleh lebih besar dari nomor akhir.');
    }
    if (to - from + 1 > 100) return fail('Maksimal 100 PC sekali tambah.');

    const added: string[] = [];
    const skipped: string[] = [];
    for (let i = from; i <= to; i++) {
      const name = `${prefix || ''}${String(i).padStart(2, '0')}`;
      const res = this.addWorkstation({ name, groupName, pricePerHour });
      if (res.success) {
        added.push(name);
      } else if (res.message?.includes('sudah dipakai')) {
        skipped.push(name);
      } else {
        // Invalid prefix, rate, or a name grown past 24 characters: stop at the first bad name
        return { success: false, message: res.message || `Nama ${name} tidak valid.`, added, skipped };
      }
    }
    const message = added.length
      ? `${added.length} PC ditambahkan${skipped.length ? `, ${skipped.length} dilewati karena namanya sudah ada` : ''}.`
      : `Semua ${skipped.length} nama sudah ada, tidak ada PC baru.`;
    return { success: added.length > 0, message, added, skipped };
  }

  /**
   * Sync & Seed real warnet workstations from Cloud Database
   */
  public static syncWithCloudPcs(cloudPcs: any[]): void {
    if (!Array.isArray(cloudPcs) || cloudPcs.length === 0) return;
    
    for (let i = 0; i < cloudPcs.length; i++) {
      const pc = cloudPcs[i];
      const pcId = pc.id || `PC-${i + 1}`;
      const pcName = pc.name || pc.id;
      const existing = db.select().from(schema.workstations).where(or(eq(schema.workstations.pcId, pcId), eq(schema.workstations.name, pcName))).get();
      if (!existing) {
        db.insert(schema.workstations).values({
          pcId,
          name: pcName,
          ip: `192.168.1.${101 + i}`,
          mac: `00:1A:2B:3C:4D:${String(i + 1).padStart(2, '0')}`,
          groupName: 'Area Reguler',
          state: 'idle',
          pricePerHour: 4000,
          lastSeen: Date.now()
        }).run();
      } else {
        if (existing.name !== pcName) {
          db.update(schema.workstations)
            .set({ name: pcName })
            .where(eq(schema.workstations.id, existing.id))
            .run();
        }
      }
    }
  }

  /**
   * Auto-register / update Workstation dynamically when client connects
   */
  public static upsertWorkstation(pcId: string, name: string, ip: string, mac?: string): void {
    // Case-insensitive like addWorkstation: a PC added as "pc-05" must not get a second row when
    // its client reports "PC-05"
    const key = (pcId || '').trim().toLowerCase();
    const existing = db.select().from(schema.workstations)
      .where(or(eq(sql`lower(${schema.workstations.pcId})`, key), eq(sql`lower(${schema.workstations.name})`, key)))
      .get();
    if (!existing) {
      db.insert(schema.workstations).values({
        pcId,
        name: name || pcId,
        ip: ip || '',
        mac: mac || '00:00:00:00:00:00',
        groupName: 'Area Reguler',
        state: 'idle',
        pricePerHour: 4000,
        lastSeen: Date.now()
      }).run();
    } else {
      db.update(schema.workstations)
        .set({
          name: name || pcId,
          ip: ip || existing.ip,
          mac: mac || existing.mac,
          lastSeen: Date.now()
        })
        .where(eq(schema.workstations.id, existing.id))
        .run();
    }
  }

  /**
   * Rename one PC row (pcId and name move together). Matching is case-insensitive like addWorkstation;
   * renaming to a different case of its own name is allowed, taking another PC's name is not.
   */
  public static renameWorkstation(currentId: string, newName: string): { success: boolean; message: string } {
    const name = (newName || '').trim();
    const nameError = pcNameError(name);
    if (nameError) return { success: false, message: nameError };
    const byKey = (key: string) => db.select().from(schema.workstations)
      .where(or(eq(sql`lower(${schema.workstations.pcId})`, key), eq(sql`lower(${schema.workstations.name})`, key)))
      .get();
    const row = byKey((currentId || '').trim().toLowerCase());
    if (!row) return { success: false, message: `PC ${currentId} tidak ditemukan.` };
    const taken = byKey(name.toLowerCase());
    if (taken && taken.id !== row.id) return { success: false, message: `Nama ${taken.name} sudah dipakai PC lain.` };

    db.update(schema.workstations).set({ pcId: name, name }).where(eq(schema.workstations.id, row.id)).run();
    db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: 1,
      description: `Nama PC ${row.name} diganti jadi ${name}.`,
      level: 1
    }).run();
    return { success: true, message: `Nama PC ${row.name} diganti jadi ${name}.` };
  }

  public static deleteWorkstation(identifier: { id?: number; name?: string; pcId?: string } | string | number): void {
    let targetId: number | undefined;
    let targetName: string | undefined;
    let targetPcId: string | undefined;

    if (typeof identifier === 'object' && identifier !== null) {
      targetId = identifier.id;
      targetName = identifier.name ? String(identifier.name).trim() : undefined;
      targetPcId = identifier.pcId ? String(identifier.pcId).trim() : undefined;
    } else if (typeof identifier === 'number') {
      targetId = identifier;
    } else {
      const str = String(identifier).trim();
      targetName = str;
      targetPcId = str;
      const parsed = parseInt(str, 10);
      if (!isNaN(parsed) && String(parsed) === str) {
        targetId = parsed;
      }
    }

    const conditions = [];
    if (targetId !== undefined && !isNaN(targetId)) {
      conditions.push(eq(schema.workstations.id, targetId));
    }
    if (targetPcId) {
      conditions.push(eq(schema.workstations.pcId, targetPcId));
      conditions.push(eq(schema.workstations.name, targetPcId));
    }
    if (targetName) {
      conditions.push(eq(schema.workstations.name, targetName));
      conditions.push(eq(schema.workstations.pcId, targetName));
    }

    if (conditions.length > 0) {
      db.delete(schema.workstations)
        .where(or(...conditions))
        .run();

      db.insert(schema.systemLogs).values({
        eventTime: Date.now(),
        eventType: 1,
        description: `Menghapus bilik workstation [${targetName || targetPcId || targetId}] dari database.`,
        level: 1
      }).run();
    }
  }

  // ==================== WORKSTATIONS ====================
  public static getWorkstations(): Workstation[] {
    const rows = db.select().from(schema.workstations).all();
    return rows.map(r => {
      const rawState = r.state || 'idle';
      let mappedState: WorkstationState = 'idle';
      if (rawState === 'in_use') {
        mappedState = (r.currentUser && r.currentUser.toLowerCase().includes('member')) ? 'active_member' : 'active_guest';
      } else if (rawState === 'suspended') {
        mappedState = 'locked';
      } else if (rawState === 'unpaid' || rawState === 'offline' || rawState === 'idle' || rawState === 'locked' || rawState === 'active_member' || rawState === 'active_guest') {
        mappedState = rawState as WorkstationState;
      }

      const remSec = Number(r.remainingSeconds) || 0;
      const elapSec = Number(r.elapsedSeconds) || 0;
      const spent = Number(r.totalSpent) || 0;

      return {
        id: r.id,
        pcId: r.pcId || r.name,
        name: r.name,
        ip: r.ip || '',
        mac: r.mac || '00:00:00:00:00:00',
        state: mappedState,
        username: r.currentUser || undefined,
        userType: (r.currentUser && r.currentUser.toLowerCase().includes('member')) ? 'member' : 'guest',
        timeUsedMinutes: Math.floor(elapSec / 60),
        timeRemainingMinutes: remSec > 0 ? Math.ceil(remSec / 60) : undefined,
        moneyUsed: spent,
        groupName: r.groupName || 'Area Reguler',
        packageName: r.packageName || undefined,
        packageTime: r.packageName ? `${Math.ceil((remSec || 60) / 60)}m` : undefined,
        packagePrice: spent,
        pricePerHour: Number(r.pricePerHour) || 4000,
        sessionPricePerHour: Number(r.sessionPricePerHour) || undefined,
        isUnpaid: mappedState === 'unpaid',
        unpaidAmount: spent
      };
    });
  }

  public static updateWorkstationState(
    pcId: string, 
    state: string, 
    user?: {
      username: string;
      type: string;
      remainingSeconds: number;
      elapsedSeconds: number;
      totalCost: number;
      pricePerHour: number;
      packageName?: string;
    }
  ): void {
    db.update(schema.workstations)
      .set({
        state,
        currentUser: user ? user.username : null,
        billingType: user ? user.type : null,
        remainingSeconds: user ? user.remainingSeconds : 0,
        elapsedSeconds: user ? user.elapsedSeconds : 0,
        totalSpent: user ? user.totalCost : 0,
        // Not pricePerHour: that is the PC's member rate and must survive every session
        sessionPricePerHour: user ? user.pricePerHour : null,
        packageName: user ? (user.packageName || null) : null,
        lastSeen: Date.now()
      })
      .where(eq(schema.workstations.pcId, pcId))
      .run();
  }

  // ==================== MEMBERS ====================
  public static getMembers(): MemberAccount[] {
    const rows = db.select().from(schema.userAccounts).all();
    const today = new Date().toLocaleDateString('id-ID');
    return rows.map(r => ({
      id: r.id,
      username: r.name,
      firstName: r.firstName || '',
      lastName: r.lastName || '',
      money: r.money || 0,
      groupName: r.groupName || 'Reguler',
      status: (r.status as any) || 'Normal',
      createdAt: r.createdAt || today,
      expiredAt: r.expiredAt || '31-12-2027',
      phone: r.phone || '',
      email: r.email || ''
    }));
  }

  public static createMember(data: Partial<MemberAccount> & { password?: string }): MemberAccount {
    const now = new Date().toLocaleDateString('id-ID');
    const cleanName = (data.username || `user_${Date.now()}`).trim();
    const existing = db.select().from(schema.userAccounts).where(eq(schema.userAccounts.name, cleanName)).get();
    if (existing) {
      throw new Error(`Username member '${cleanName}' sudah terdaftar.`);
    }
    const pass = (data.password || '').trim();
    if (pass.length < 4) {
      throw new Error('Password member minimal 4 karakter.');
    }

    const result = db.insert(schema.userAccounts).values({
      name: cleanName,
      passwordHash: hashPassword(pass),
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      phone: data.phone || '',
      email: data.email || '',
      groupName: data.groupName || 'Reguler',
      money: data.money || 0,
      status: data.status || 'Normal',
      createdAt: now,
      expiredAt: '31-12-2027'
    }).returning().get();

    return {
      id: result.id,
      username: result.name,
      firstName: result.firstName || '',
      lastName: result.lastName || '',
      money: result.money || 0,
      groupName: result.groupName || 'Reguler',
      status: (result.status as any) || 'Normal',
      createdAt: result.createdAt || now,
      expiredAt: result.expiredAt || '',
      phone: result.phone || '',
      email: result.email || ''
    };
  }

  public static updateMember(id: number, data: Partial<MemberAccount> & { password?: string }): void {
    const pass = (data.password || '').trim();
    if (pass && pass.length < 4) {
      throw new Error('Password member minimal 4 karakter.');
    }
    db.update(schema.userAccounts)
      .set({
        name: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email,
        groupName: data.groupName,
        money: data.money,
        status: data.status,
        ...(pass ? { passwordHash: hashPassword(pass) } : {})
      })
      .where(eq(schema.userAccounts.id, id))
      .run();
  }

  /** Login member dari PC client. Member tanpa password (data lama) ditolak sampai kasir mengaturnya. */
  public static verifyMemberLogin(username: string, password: string): { success: boolean; message: string; member?: MemberAccount } {
    const u = (username || '').trim();
    if (!u || !password) return { success: false, message: 'Masukkan username dan password.' };

    const row = db.select().from(schema.userAccounts).where(eq(sql`lower(${schema.userAccounts.name})`, u.toLowerCase())).get();
    if (!row) return { success: false, message: 'Username atau password salah.' };
    if (!row.passwordHash) return { success: false, message: 'Password member belum diatur. Hubungi kasir.' };

    const check = verifyPassword(password, row.passwordHash);
    if (!check.ok) return { success: false, message: 'Username atau password salah.' };
    if (check.needsRehash) {
      db.update(schema.userAccounts).set({ passwordHash: hashPassword(password) }).where(eq(schema.userAccounts.id, row.id)).run();
    }

    const member = this.getMembers().find(m => m.id === row.id);
    return member ? { success: true, message: 'OK', member } : { success: false, message: 'Username atau password salah.' };
  }

  public static deleteMember(id: number): void {
    db.delete(schema.userAccounts).where(eq(schema.userAccounts.id, id)).run();
  }

  public static topUpMember(id: number, amount: number, staff: string = 'Kasir'): { newBalance: number } {
    const member = db.select().from(schema.userAccounts).where(eq(schema.userAccounts.id, id)).get();
    if (!member) throw new Error('Member tidak ditemukan.');

    const newBalance = (member.money || 0) + amount;
    db.update(schema.userAccounts)
      .set({ money: newBalance })
      .where(eq(schema.userAccounts.id, id))
      .run();

    // Log transaction
    this.addTransaction({
      username: member.name,
      date: new Date().toLocaleDateString('id-ID'),
      time: new Date().toTimeString().split(' ')[0],
      price: amount,
      timeUsed: '0m',
      staff,
      note: `Top Up Saldo Member [Rp ${amount.toLocaleString('id-ID')}]`
    });

    return { newBalance };
  }

  // ==================== PACKAGES & RATES ====================
  public static getPackages(): BillingPackage[] {
    const rows = db.select().from(schema.billingPackages).all();
    if (rows.length === 0) {
      return [
        { id: 'pkg-1', name: '1 Jam', time: '1j 0m', minutes: 60, price: 4000, popular: true, category: 'Jam' },
        { id: 'pkg-2', name: '2 Jam', time: '2j 0m', minutes: 120, price: 8000, popular: true, category: 'Jam' },
        { id: 'pkg-3', name: '3 Jam', time: '3j 0m', minutes: 180, price: 12000, popular: false, category: 'Jam' },
        { id: 'pkg-4', name: '5 Jam (Hemat)', time: '5j 0m', minutes: 300, price: 18000, popular: true, category: 'Jam' },
        { id: 'pkg-5', name: 'Paket Rp. 3.000', time: '45m', minutes: 45, price: 3000, popular: false, category: 'Nominal' },
        { id: 'pkg-6', name: 'Paket Rp. 5.000', time: '1j 15m', minutes: 75, price: 5000, popular: true, category: 'Nominal' },
        { id: 'pkg-7', name: 'Paket Rp. 10.000', time: '2j 30m', minutes: 150, price: 10000, popular: false, category: 'Nominal' },
        { id: 'pkg-8', name: 'Paket Malam (Midnight)', time: '8j 0m', minutes: 480, price: 20000, popular: true, category: 'Happy Hour', happyHourStart: '22:00', happyHourEnd: '06:00' },
        { id: 'pkg-9', name: 'Paket Pagi (Early Bird)', time: '6j 0m', minutes: 360, price: 15000, popular: false, category: 'Happy Hour', happyHourStart: '06:00', happyHourEnd: '12:00' },
        { id: 'pkg-10', name: 'Tambah Rp. 1.000', time: '10m', minutes: 10, price: 1000, popular: false, category: 'Tambah Waktu', isExtensionOnly: true },
        { id: 'pkg-11', name: 'Tambah Rp. 2.000', time: '30m', minutes: 30, price: 2000, popular: false, category: 'Tambah Waktu', isExtensionOnly: true }
      ];
    }
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      time: formatPackageTime(r.durationMinutes || 60),
      minutes: r.durationMinutes || 60,
      price: Number(r.price) || 0,
      popular: r.badge === 'POPULER',
      category: (r.type as any) || 'Jam',
      isExtensionOnly: r.type === 'Tambah Waktu',
      // Only Happy Hour rows carry a sale window; the legacy INTEGER endTime column defaults to 0.
      happyHourStart: r.startTime || undefined,
      happyHourEnd: r.startTime && r.endTime ? String(r.endTime) : undefined,
    }));
  }

  public static savePackages(packages: BillingPackage[]): void {
    const tx = sqlite.transaction(() => {
      db.delete(schema.billingPackages).run();
      if (packages.length > 0) {
        db.insert(schema.billingPackages).values(
          packages.map(p => ({
            id: p.id,
            name: p.name,
            durationMinutes: p.minutes || (parseInt(p.time) ? parseInt(p.time) * 60 : 60),
            price: p.price,
            type: p.category || (p.isExtensionOnly ? 'Tambah Waktu' : 'Jam'),
            startTime: p.happyHourStart || null,
            endTime: p.happyHourEnd || null,
            allowedGroupsJson: JSON.stringify(['Reguler', 'VIP']),
            isEnabled: 1,
            badge: p.popular ? 'POPULER' : null
          }))
        ).run();
      }
    });
    tx();
  }

  public static getChargingRates(): PersonalRateConfig[] {
    const rows = db.select().from(schema.chargingRates).all();
    if (rows.length === 0) {
      return [
        {
          id: 'prate-standard',
          name: 'Tarif Reguler Personal',
          firstHourPrice: 4000,
          nextHoursPrice: 3500,
          accumulationMinutes: 60,
          targetUserType: 'all',
          description: 'Tarif standar pascabayar untuk tamu dan member umum.'
        },
        {
          id: 'prate-vip',
          name: 'Personal Member VIP',
          firstHourPrice: 3500,
          nextHoursPrice: 3000,
          accumulationMinutes: 60,
          targetUserType: 'member',
          description: 'Tarif khusus akun member ruang VIP.'
        }
      ];
    }
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      firstHourPrice: Number(r.pricePerHour) || 4000,
      nextHoursPrice: r.nextHoursPrice !== null && r.nextHoursPrice !== undefined ? Number(r.nextHoursPrice) : Number(r.pricePerHour) || 4000,
      // stored as text like '30m' in the legacy accumulationStep column
      accumulationMinutes: normalizeAccumulationMinutes(parseInt(String(r.accumulationStep ?? ''), 10)),
      targetUserType: (r.targetUserType || 'all') as 'all' | 'member' | 'guest',
      description: r.description || 'Skema tarif personal dari database.'
    }));
  }

  public static saveChargingRates(rates: PersonalRateConfig[]): void {
    const tx = sqlite.transaction(() => {
      db.delete(schema.chargingRates).run();
      if (rates.length > 0) {
        db.insert(schema.chargingRates).values(
          rates.map(r => ({
            id: r.id,
            name: r.name,
            pricePerHour: Number(r.firstHourPrice) || 4000,
            nextHoursPrice: Number(r.nextHoursPrice) || 3500,
            accumulationStep: `${normalizeAccumulationMinutes(r.accumulationMinutes)}m`,
            // ponytail: legacy grace/minimum/rounding columns keep their DB defaults and are never read;
            // billing rules live in src/shared/personalBilling.ts.
            targetUserType: r.targetUserType || 'all',
            description: r.description || '',
            isDefault: r.id === 'prate-standard' ? 1 : 0
          }))
        ).run();
      }
    });
    tx();
  }

  // ==================== TRANSACTIONS ====================
  private static txListeners: ((tx: TransactionRecord) => void)[] = [];

  public static onTransactionAdded(listener: (tx: TransactionRecord) => void): () => void {
    this.txListeners.push(listener);
    return () => {
      this.txListeners = this.txListeners.filter(l => l !== listener);
    };
  }

  // startDate/endDate are "YYYY-MM-DD" (inclusive days). With a range the limit is ignored:
  // a report must see every row of the days it covers.
  public static getTransactions(limit: number = 500, startDate?: string, endDate?: string): TransactionRecord[] {
    const query = db.select()
      .from(schema.recentTransactionLogs)
      .orderBy(desc(schema.recentTransactionLogs.id));

    let rows: any[];
    const from = startDate ? isoDayStart(startDate) : null;
    const toDay = endDate ? isoDayStart(endDate) : null;
    if (from !== null || toDay !== null) {
      // Dates are stored as id-ID text ("27/9/2026"), which SQL cannot range-compare.
      // ponytail: scans the whole log in JS; fine for years of warnet traffic, upgrade path is
      // an epoch column with an index.
      const to = toDay !== null ? toDay + 86_400_000 : Infinity;
      rows = query.all().filter((r: any) => {
        const ts = txTimestamp(r.date, r.time);
        return ts !== null && ts >= (from ?? -Infinity) && ts < to;
      });
    } else {
      rows = query.limit(limit).all();
    }
    return rows.map((r: any) => ({
      id: r.id,
      username: r.username,
      date: r.date,
      time: r.time,
      price: r.price,
      timeUsed: r.timeUsed || '0m',
      staff: r.staff || 'Operator',
      note: r.note || ''
    }));
  }

  public static addTransaction(record: Omit<TransactionRecord, 'id'>): TransactionRecord | null {
    // Sesi Admin internal gratis (Rp 0) tidak dimasukkan ke catatan transaksi
    const isExcluded = (record.username.toLowerCase() === 'admin' || record.username.toLowerCase() === 'administrator') && Number(record.price) === 0 && !record.note?.includes('F&B') && !record.note?.includes('Handover');
    if (isExcluded) {
      return null;
    }

    const result = db.insert(schema.recentTransactionLogs).values({
      username: record.username,
      date: record.date,
      time: record.time,
      price: record.price,
      timeUsed: record.timeUsed,
      staff: record.staff || 'Operator',
      note: record.note
    }).returning().get();

    const tx: TransactionRecord = {
      id: result.id,
      username: result.username || '',
      date: result.date || '',
      time: result.time || '',
      price: result.price || 0,
      timeUsed: result.timeUsed || '0m',
      staff: result.staff || 'Operator',
      note: result.note || ''
    };

    // Notify realtime listeners
    this.txListeners.forEach(fn => {
      try { fn(tx); } catch (e) {}
    });

    return tx;
  }

  // Fix a row entered wrong. Only amount and note change; username, time and staff stay as
  // recorded, and a price change leaves a trail in the note plus the system log.
  public static correctTransaction(id: number, price: number, note: string, admin: string): { success: boolean; message: string } {
    if (!Number.isInteger(id)) return { success: false, message: 'ID transaksi tidak valid.' };
    if (!Number.isFinite(price) || Math.abs(price) > 100_000_000) return { success: false, message: 'Nominal tidak valid.' };
    const cleanNote = String(note ?? '').trim().slice(0, 500);
    if (!cleanNote) return { success: false, message: 'Catatan wajib diisi.' };

    const row = db.select().from(schema.recentTransactionLogs).where(eq(schema.recentTransactionLogs.id, id)).get();
    if (!row) return { success: false, message: 'Transaksi tidak ditemukan.' };
    if (classifyTransaction(row.note || '', Number(row.price) || 0).kind === 'handover') {
      return { success: false, message: 'Catatan serah terima shift tidak bisa dikoreksi.' };
    }

    const oldPrice = Number(row.price) || 0;
    const stamp = new Date().toLocaleString('id-ID');
    const trail = oldPrice !== price
      ? ` [dikoreksi ${admin} ${stamp}: Rp ${oldPrice.toLocaleString('id-ID')} jadi Rp ${price.toLocaleString('id-ID')}]`
      : '';
    db.update(schema.recentTransactionLogs)
      .set({ price, note: cleanNote + trail })
      .where(eq(schema.recentTransactionLogs.id, id))
      .run();
    db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: 1,
      description: `${admin} mengoreksi transaksi #${id} (${row.username}): Rp ${oldPrice.toLocaleString('id-ID')} jadi Rp ${price.toLocaleString('id-ID')}. Catatan lama: ${row.note || '-'}`,
      level: 1
    }).run();
    return { success: true, message: `Transaksi #${id} dikoreksi.` };
  }

  // Remove a row that should never have existed (double entry, wrong execution).
  // The deleted content is kept in the system log so the drawer can still be audited.
  public static deleteTransaction(id: number, admin: string): { success: boolean; message: string } {
    if (!Number.isInteger(id)) return { success: false, message: 'ID transaksi tidak valid.' };
    const row = db.select().from(schema.recentTransactionLogs).where(eq(schema.recentTransactionLogs.id, id)).get();
    if (!row) return { success: false, message: 'Transaksi tidak ditemukan.' };
    if (classifyTransaction(row.note || '', Number(row.price) || 0).kind === 'handover') {
      return { success: false, message: 'Catatan serah terima shift tidak bisa dihapus.' };
    }
    sqlite.transaction(() => {
      db.delete(schema.recentTransactionLogs).where(eq(schema.recentTransactionLogs.id, id)).run();
      db.insert(schema.systemLogs).values({
        eventTime: Date.now(),
        eventType: 1,
        description: `${admin} menghapus transaksi #${id}: ${row.username}, ${row.date} ${row.time}, Rp ${(Number(row.price) || 0).toLocaleString('id-ID')}, ${row.note || '-'}`,
        level: 1
      }).run();
    })();
    return { success: true, message: `Transaksi #${id} dihapus.` };
  }

  // ==================== COUPONS & VOUCHERS ====================
  public static getCoupons(): CouponAccount[] {
    const rows = db.select().from(schema.coupons).orderBy(desc(schema.coupons.id)).all();
    const today = new Date();

    return rows.map(r => {
      const isUsed = r.isUsed === 1;
      let status: 'Tersedia' | 'Terpakai' | 'Expired' = isUsed ? 'Terpakai' : 'Tersedia';

      if (!isUsed && r.expiredAt) {
        const parts = r.expiredAt.split('-');
        if (parts.length === 3) {
          const expDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
          if (expDate < today) {
            status = 'Expired';
          }
        }
      }

      return {
        id: r.id,
        code: r.code || `GC-${r.id}`,
        type: (r.type as any) || 'time',
        name: r.name || (r.type === 'time' ? `Voucher ${r.durationMinutes} Menit` : `Voucher Rp ${(r.value || r.money || 0).toLocaleString('id-ID')}`),
        detail: r.detail || undefined,
        prefix: r.prefix || undefined,
        value: Number(r.value || r.money) || 0,
        price: Number(r.value || r.money) || 0,
        money: Number(r.value || r.money) || 0,
        durationMinutes: r.durationMinutes || 0,
        userGroupId: r.userGroupId || 1,
        groupName: r.userGroupId === 2 ? 'VIP' : 'Reguler',
        status,
        isUsed,
        usedBy: r.usedBy || undefined,
        usedAt: r.usedAt || undefined,
        createdAt: r.createdAt || '',
        expiredAt: r.expiredAt || '',
        expireDays: r.expireDays || 30
      };
    });
  }

  public static generateCouponsBatch(
    paramsOrCount: any,
    typeArg?: 'time' | 'money',
    valueArg: number = 0,
    durationArg: number = 0,
    expiredAtArg?: string
  ): CouponAccount[] {
    let params: any;
    if (typeof paramsOrCount === 'number') {
      params = {
        count: paramsOrCount,
        type: typeArg || 'time',
        value: valueArg || 0,
        durationMinutes: durationArg || 0,
        expiredAt: expiredAtArg
      };
    } else {
      params = paramsOrCount || {};
    }

    const count = Math.max(1, Math.min(params.count || 10, 200));
    const prefix = (params.prefix || 'GC').toUpperCase().trim().replace(/[^A-Z0-9]/g, '') || 'GC';
    const now = new Date();
    const createdAtStr = now.toLocaleDateString('id-ID');
    const expireDays = params.expireDays || 30;

    const expDate = new Date(now.getTime() + expireDays * 24 * 3600 * 1000);
    const expiredAtStr = params.expiredAt || `${String(expDate.getDate()).padStart(2, '0')}-${String(expDate.getMonth() + 1).padStart(2, '0')}-${expDate.getFullYear()}`;
    const valueNum = Number(params.value) || 0;

    // 1. Update or insert PrepaidCardHistory
    const cardHistory = db.select().from(schema.prepaidCardHistory).where(eq(schema.prepaidCardHistory.prefix, prefix)).get();
    let currentAutoInc = cardHistory ? (cardHistory.lastAutoIncId || 0) : 0;

    const generated: typeof schema.coupons.$inferInsert[] = [];

    for (let i = 0; i < count; i++) {
      currentAutoInc++;
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const paddedSerial = String(currentAutoInc).padStart(4, '0');
      const code = `${prefix}-${paddedSerial}-${randomSuffix}`;

      generated.push({
        code,
        type: params.type || 'time',
        name: params.type === 'time' ? `Voucher ${params.durationMinutes || 0} Menit` : `Voucher Rp ${valueNum.toLocaleString('id-ID')}`,
        detail: `Batch Generated by ${params.staff || 'Kasir'}`,
        prefix,
        money: params.type === 'money' ? valueNum : 0,
        value: valueNum,
        durationMinutes: params.durationMinutes || 0,
        userGroupId: params.userGroupId || 1,
        isUsed: 0,
        startDate: createdAtStr,
        createdAt: createdAtStr,
        expiredAt: expiredAtStr,
        expireDays,
        enabled: 1
      });
    }

    if (!cardHistory) {
      db.insert(schema.prepaidCardHistory).values({
        prefix,
        lastId: currentAutoInc,
        lastAutoIncId: currentAutoInc,
        lastUsed: Date.now()
      }).run();
    } else {
      db.update(schema.prepaidCardHistory).set({
        lastId: currentAutoInc,
        lastAutoIncId: currentAutoInc,
        lastUsed: Date.now()
      }).where(eq(schema.prepaidCardHistory.prefix, prefix)).run();
    }

    // 2. Insert into CouponCards
    const inserted = db.insert(schema.coupons).values(generated).returning().all();

    // 3. Log into SystemLogs
    db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: 2, // Voucher Batch
      description: `Generate ${count} voucher [Prefix: ${prefix}, Tipe: ${params.type}, Nilai: ${params.value}] oleh ${params.staff || 'Kasir'}`,
      level: 0
    }).run();

    return inserted.map(r => ({
      id: r.id,
      code: r.code || `GC-${r.id}`,
      type: (r.type as any) || 'time',
      name: r.name || '',
      detail: r.detail || undefined,
      prefix: r.prefix || undefined,
      value: Number(r.value || r.money) || 0,
      price: Number(r.value || r.money) || 0,
      money: Number(r.value || r.money) || 0,
      durationMinutes: r.durationMinutes || 0,
      userGroupId: r.userGroupId || 1,
      groupName: r.userGroupId === 2 ? 'VIP' : 'Reguler',
      status: 'Tersedia',
      isUsed: false,
      createdAt: r.createdAt || createdAtStr,
      expiredAt: r.expiredAt || expiredAtStr,
      expireDays
    }));
  }

  public static redeemCoupon(code: string, username: string): {
    success: boolean;
    message: string;
    durationMinutes?: number;
    value?: number;
    type?: 'time' | 'money';
    coupon?: CouponAccount;
  } {
    const coupon = db.select().from(schema.coupons).where(eq(schema.coupons.code, (code || '').toUpperCase().trim())).get();
    if (!coupon) {
      return { success: false, message: 'Kode kupon/voucher tidak ditemukan.' };
    }
    if (coupon.isUsed === 1) {
      return { success: false, message: `Kupon sudah digunakan oleh [${coupon.usedBy}].` };
    }

    if (coupon.expiredAt) {
      const parts = coupon.expiredAt.split('-');
      if (parts.length === 3) {
        const expDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), 23, 59, 59);
        if (expDate < new Date()) {
          return { success: false, message: `Voucher [${coupon.code}] sudah kadaluarsa sejak ${coupon.expiredAt}.` };
        }
      }
    }

    const now = new Date();
    const nowStr = now.toLocaleDateString('id-ID');
    db.update(schema.coupons)
      .set({
        isUsed: 1,
        usedBy: username,
        usedAt: nowStr
      })
      .where(eq(schema.coupons.id, coupon.id))
      .run();

    // Log to SystemLogs
    db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: 4, // Voucher Redeem
      description: `Voucher [${coupon.code}] senilai Rp ${coupon.value || coupon.money} di-redeem oleh [${username}]`,
      level: 0
    }).run();

    return {
      success: true,
      message: 'Kupon berhasil digunakan!',
      durationMinutes: coupon.durationMinutes || 0,
      value: Number(coupon.value || coupon.money) || 0,
      type: (coupon.type as any) || 'time',
      coupon: {
        id: coupon.id,
        code: coupon.code || '',
        type: (coupon.type as any) || 'time',
        value: Number(coupon.value || coupon.money) || 0,
        price: Number(coupon.value || coupon.money) || 0,
        money: Number(coupon.value || coupon.money) || 0,
        durationMinutes: coupon.durationMinutes || 0,
        userGroupId: coupon.userGroupId || 1,
        groupName: coupon.userGroupId === 2 ? 'VIP' : 'Reguler',
        status: 'Terpakai',
        isUsed: true,
        usedBy: username,
        usedAt: nowStr,
        createdAt: coupon.createdAt || '',
        expiredAt: coupon.expiredAt || ''
      }
    };
  }

  public static deleteCoupon(id: number): void {
    db.delete(schema.coupons).where(eq(schema.coupons.id, id)).run();
  }

  public static getSystemLogs(limit: number = 100): SystemLogRecord[] {
    const rows = db.select()
      .from(schema.systemLogs)
      .orderBy(desc(schema.systemLogs.id))
      .limit(limit)
      .all();

    return rows.map(r => ({
      id: r.id.toString(),
      time: new Date(r.eventTime || Date.now()).toLocaleTimeString('id-ID'),
      type: r.eventType === 1 ? 'client' : 'server',
      level: r.level === 2 ? 'error' : r.level === 1 ? 'warning' : 'info',
      action: r.description || '',
      details: `Event #${r.eventType}`
    }));
  }

  /** Catat event ke SystemLogs (tampil di menu Log). type 'client' = event dari PC client. */
  public static addSystemLog(entry: { type: 'client' | 'server'; event: string; details?: string; operator?: string; targetPc?: string; level?: 0 | 1 | 2 }): void {
    const target = entry.targetPc ? ` [${entry.targetPc}]` : '';
    const by = entry.operator ? ` oleh ${entry.operator}` : '';
    db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: entry.type === 'client' ? 1 : 0,
      description: `${entry.event}${target}${by}${entry.details ? `: ${entry.details}` : ''}`.slice(0, 500),
      level: entry.level ?? 0
    }).run();
  }

  public static getLogs(limit: number = 100): SystemLogRecord[] {
    return this.getSystemLogs(limit);
  }

  public static hasAdminAccount(): boolean {
    const rows = db.select().from(schema.employees).all();
    return rows.length > 0;
  }

  public static setupInitialAdmin(params: {
    username: string;
    password: string;
    phone?: string;
  }): EmployeeLoginResult {
    // Only for a fresh install; otherwise this would let anyone reset an account to admin.
    if (this.hasAdminAccount()) {
      return { success: false, message: 'Akun administrator sudah ada. Login dengan akun yang terdaftar.' };
    }
    const u = (params.username || '').trim();
    const p = (params.password || '').trim();

    if (!u) {
      return { success: false, message: 'Username administrator tidak boleh kosong.' };
    }
    if (!p || p.length < 3) {
      return { success: false, message: 'Password minimal 3 karakter.' };
    }

    const existing = db.select().from(schema.employees).where(eq(schema.employees.name, u)).get();
    let adminRecord: typeof schema.employees.$inferSelect;

    if (existing) {
      db.update(schema.employees)
        .set({ passwordHash: hashPassword(p), role: 2, enabled: 1 })
        .where(eq(schema.employees.id, existing.id))
        .run();
      adminRecord = existing;
    } else {
      adminRecord = db.insert(schema.employees).values({
        name: u,
        passwordHash: hashPassword(p),
        role: 2, // Admin
        phone: params.phone || '',
        enabled: 1
      }).returning().get();
    }

    // Admin (role 2) is a superuser account and is not bound to a cashier shift.

    db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: 1,
      operatorId: adminRecord.id,
      description: `Setup Administrator Server Baru: ${u} berhasil dibuat.`,
      level: 0
    }).run();

    return {
      success: true,
      message: `Setup administrator ${u} berhasil!`,
      employee: {
        id: adminRecord.id,
        name: adminRecord.name,
        role: 2,
        roleText: 'Admin',
        phone: adminRecord.phone || undefined
      }
    };
  }

  public static getEmployees(): EmployeeAccount[] {
    const rows = db.select().from(schema.employees).all();
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      role: (r.role as EmployeeRole) || 0,
      roleText: r.role === 2 ? 'Admin' : r.role === 1 ? 'Manager' : 'Kasir',
      phone: r.phone || undefined,
      enabled: r.enabled === 1
    }));
  }

  public static verifyEmployeeLogin(params: {
    username: string;
    password: string;
  }): EmployeeLoginResult {
    const u = (params.username || '').trim();
    const p = (params.password || '').trim();

    if (!u) {
      return { success: false, message: 'Masukkan username operator.' };
    }
    if (!p) {
      return { success: false, message: 'Masukkan password operator.' };
    }

    const allEmpls = db.select().from(schema.employees).all();
    const empl = allEmpls.find(e => e.name.toLowerCase() === u.toLowerCase());

    if (!empl) {
      return { success: false, message: 'Username operator tidak ditemukan.' };
    }

    if (empl.enabled === 0) {
      return { success: false, message: 'Akun operator ini telah dinonaktifkan oleh administrator.' };
    }

    const check = verifyPassword(p, empl.passwordHash || '');
    if (!check.ok) {
      return { success: false, message: 'Password operator salah. Silakan coba lagi.' };
    }
    if (check.needsRehash) {
      db.update(schema.employees).set({ passwordHash: hashPassword(p) }).where(eq(schema.employees.id, empl.id)).run();
    }

    // Log successful server login to system logs
    const roleLabel = empl.role === 2 ? 'Admin' : empl.role === 1 ? 'Manager' : 'Kasir';
    db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: 1, // Server event
      operatorId: empl.id,
      description: `Operator ${empl.name} (${roleLabel}) berhasil login ke server GC-Hub`,
      level: 0
    }).run();

    return {
      success: true,
      message: `Selamat datang, ${empl.name}.`,
      employee: {
        id: empl.id,
        name: empl.name,
        role: empl.role,
        roleText: roleLabel,
        phone: empl.phone || undefined
      }
    };
  }

  /** Staff login that also requires the admin role (booth settings, technician mode, closing the client app). */
  public static verifyAdminLogin(params: { username: string; password: string }): EmployeeLoginResult {
    const res = this.verifyEmployeeLogin(params);
    if (!res.success || !res.employee) return res;
    if (res.employee.role !== 2) {
      return { success: false, message: 'Aksi ini hanya untuk akun admin.' };
    }
    return res;
  }

  public static createEmployee(params: {
    name: string;
    password: string;
    role?: number;
    phone?: string;
  }): { success: boolean; message: string; employee?: EmployeeAccount } {
    const name = (params.name || '').trim();
    if (!name) {
      return { success: false, message: 'Nama operator tidak boleh kosong.' };
    }

    const existing = db.select().from(schema.employees).where(eq(schema.employees.name, name)).get();
    if (existing) {
      return { success: false, message: `Operator dengan nama "${name}" sudah terdaftar.` };
    }

    const pass = (params.password || '').trim();
    if (!pass || pass.length < 3) {
      return { success: false, message: 'Password operator minimal 3 karakter.' };
    }

    const roleVal = params.role !== undefined ? Number(params.role) : 0;
    const newEmpl = db.insert(schema.employees).values({
      name,
      passwordHash: hashPassword(pass),
      role: roleVal,
      phone: params.phone || '',
      enabled: 1
    }).returning().get();

    db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: 1,
      operatorId: newEmpl.id,
      description: `Menambahkan operator baru: ${name} (Role: ${roleVal === 2 ? 'Admin' : roleVal === 1 ? 'Manager' : 'Kasir'})`,
      level: 0
    }).run();

    return {
      success: true,
      message: `Operator ${name} berhasil ditambahkan.`,
      employee: {
        id: newEmpl.id,
        name: newEmpl.name,
        role: (newEmpl.role as EmployeeRole) || 0,
        roleText: newEmpl.role === 2 ? 'Admin' : newEmpl.role === 1 ? 'Manager' : 'Kasir',
        phone: newEmpl.phone || undefined,
        enabled: true
      }
    };
  }

  public static updateEmployee(
    id: number,
    params: {
      name?: string;
      password?: string;
      role?: number;
      phone?: string;
      enabled?: boolean;
    }
  ): { success: boolean; message: string; employee?: EmployeeAccount } {
    const existing = db.select().from(schema.employees).where(eq(schema.employees.id, id)).get();
    if (!existing) {
      return { success: false, message: 'Operator tidak ditemukan.' };
    }

    const updates: any = {};
    if (params.name !== undefined) updates.name = params.name.trim();
    if (params.password !== undefined && params.password.trim().length > 0) updates.passwordHash = hashPassword(params.password.trim());
    if (params.role !== undefined) updates.role = Number(params.role);
    if (params.phone !== undefined) updates.phone = params.phone.trim();
    if (params.enabled !== undefined) updates.enabled = params.enabled ? 1 : 0;

    db.update(schema.employees).set(updates).where(eq(schema.employees.id, id)).run();

    const updated = db.select().from(schema.employees).where(eq(schema.employees.id, id)).get();

    return {
      success: true,
      message: `Data operator ${updated?.name || id} berhasil diperbarui.`,
      employee: updated ? {
        id: updated.id,
        name: updated.name,
        role: (updated.role as EmployeeRole) || 0,
        roleText: updated.role === 2 ? 'Admin' : updated.role === 1 ? 'Manager' : 'Kasir',
        phone: updated.phone || undefined,
        enabled: updated.enabled === 1
      } : undefined
    };
  }

  public static deleteEmployee(id: number): { success: boolean; message: string } {
    const existing = db.select().from(schema.employees).where(eq(schema.employees.id, id)).get();
    if (!existing) {
      return { success: false, message: 'Operator tidak ditemukan.' };
    }

    // Scraped Legacy Law: Can't delete employee that is on shift.
    const activeShift = db.select().from(schema.shifts).where(eq(schema.shifts.status, 1)).get();
    if (activeShift && activeShift.emplId === id) {
      return {
        success: false,
        message: "Can't delete employee that is on shift. Please handover shift first."
      };
    }

    db.delete(schema.employees).where(eq(schema.employees.id, id)).run();

    db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: 1,
      description: `Menghapus akun operator: ${existing.name}`,
      level: 1
    }).run();

    return {
      success: true,
      message: `Akun operator ${existing.name} berhasil dihapus.`
    };
  }

  public static lockServerConsole(operatorName: string): { success: boolean; message: string } {
    db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: 1,
      description: `Konsol Server GC-Hub dikunci oleh operator: ${operatorName || 'Kasir'}`,
      level: 0
    }).run();

    return {
      success: true,
      message: 'Konsol server berhasil dikunci.'
    };
  }

  public static logoutAndExitServer(operatorName: string): { success: boolean; message: string } {
    db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: 1,
      description: `Operator ${operatorName || 'Kasir'} logout. Sesi login server ditutup & aplikasi keluar.`,
      level: 1
    }).run();

    return {
      success: true,
      message: 'Sesi login operator ditutup dan server keluar.'
    };
  }



  // Shift system is opt-in: an admin-only cafe never sees it. The admin switches it on in
  // Pengaturan > Ganti Shift, and only once at least one enabled non-admin staff account exists.
  public static hasActiveStaff(): boolean {
    return !!db.select().from(schema.employees)
      .where(and(eq(schema.employees.enabled, 1), ne(schema.employees.role, 2))).get();
  }

  public static getShiftStatus(): { enabled: boolean; hasStaff: boolean } {
    const hasStaff = this.hasActiveStaff();
    return { enabled: hasStaff && this.getSetting('shiftEnabled') === '1', hasStaff };
  }

  public static setShiftEnabled(enabled: boolean, operatorName = 'Admin'): { success: boolean; message: string } {
    if (enabled && !this.hasActiveStaff()) {
      return { success: false, message: 'Buat minimal satu akun staf (Kasir atau Manager) di Manajemen Staff sebelum mengaktifkan shift.' };
    }
    if (!enabled) {
      // Close whatever shift is open so no staff stays "on shift" and blocks deleting accounts.
      db.update(schema.shifts).set({ status: 0, endDT: Date.now() }).where(eq(schema.shifts.status, 1)).run();
    }
    this.setSetting('shiftEnabled', enabled ? '1' : '0');
    db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: 1,
      description: `Sistem shift ${enabled ? 'diaktifkan' : 'dinonaktifkan'} oleh ${operatorName}`,
      level: 0
    }).run();
    return { success: true, message: `Sistem shift ${enabled ? 'aktif' : 'nonaktif'}.` };
  }

  public static getActiveShiftSummary(): ShiftAuditSummary | null {
    if (!this.getShiftStatus().enabled) return null;
    // 1. Get or create open shift
    let activeShift = db.select().from(schema.shifts).where(eq(schema.shifts.status, 1)).get();
    if (!activeShift) {
      const cashierEmpl = db.select().from(schema.employees).where(and(eq(schema.employees.enabled, 1), ne(schema.employees.role, 2))).get()
        || db.select().from(schema.employees).where(eq(schema.employees.enabled, 1)).get();
      const effectiveEmplId = cashierEmpl ? cashierEmpl.id : 1;
      const openTime = Date.now();
      activeShift = db.insert(schema.shifts).values({
        emplId: effectiveEmplId,
        shiftTime: shiftSlotAt(new Date(openTime)),
        startDT: openTime,
        startCash: 0,
        totalCashIn: 0,
        totalCashOut: 0,
        endCash: 0,
        status: 1
      }).returning().get();
    }

    // 2. Fetch employee details
    const empl = db.select().from(schema.employees).where(eq(schema.employees.id, activeShift.emplId)).get();
    const employeeName = empl ? empl.name : 'Operator';

    // 3. Cash that went through the drawer since this shift opened (row times have 1s precision)
    const shiftStart = Math.floor(activeShift.startDT / 1000) * 1000;
    // ponytail: reads the whole log each call; upgrade path is an epoch column with an index
    const shiftTx = db.select().from(schema.transactionLogs).all().filter(tx => {
      const ts = txTimestamp(tx.date, tx.time);
      return ts !== null && ts >= shiftStart;
    }).map(tx => ({ note: tx.note || '', price: Number(tx.price) || 0 }));
    const cash = summarizeCash(shiftTx);
    const billingCash = cash.billing;
    const posCash = cash.fnb;
    const topupCash = cash.topup;
    const totalCashOut = cash.cashOut;

    const totalCashIn = cash.cashIn;
    const startCash = Number(activeShift.startCash) || 0;
    const expectedEndCash = startCash + totalCashIn - totalCashOut;

    // Check unpaid and pending orders
    const unpaidCount = db.select().from(schema.workstations).where(eq(schema.workstations.state, 'unpaid')).all().length;
    const pendingOrdersCount = db.select().from(schema.orderLogs).where(eq(schema.orderLogs.orderStatus, 0)).all().length;

    const startDate = new Date(activeShift.startDT);
    const startDateFormatted = `${startDate.toLocaleDateString('id-ID')} ${startDate.toLocaleTimeString('id-ID')}`;

    const shiftRecord: ShiftRecord = {
      id: activeShift.id,
      emplId: activeShift.emplId,
      employeeName,
      shiftTime: activeShift.shiftTime,
      shiftTimeLabel: shiftLabel(activeShift.shiftTime),
      startDT: activeShift.startDT,
      startDateFormatted,
      endDT: activeShift.endDT || null,
      endDateFormatted: activeShift.endDT ? new Date(activeShift.endDT).toLocaleDateString('id-ID') : null,
      startCash,
      totalCashIn,
      totalCashOut,
      endCash: activeShift.endCash || 0,
      expectedCash: expectedEndCash,
      variance: 0,
      status: activeShift.status,
      statusText: activeShift.status === 1 ? 'Open' : 'Closed'
    };

    return {
      currentShift: shiftRecord,
      billingCash,
      posCash,
      topupCash,
      totalCashIn,
      totalCashOut,
      expectedEndCash,
      unsettledUnpaidCount: unpaidCount,
      pendingOrdersCount
    };
  }

  public static closeShiftHandover(params: ShiftHandoverParams): ShiftHandoverResult {
    const activeSummary = this.getActiveShiftSummary();
    if (!activeSummary) {
      return { success: false, message: 'Sistem shift belum diaktifkan admin.' };
    }
    const currentShift = activeSummary.currentShift;
    const now = Date.now();
    const nowDate = new Date(now);
    const actualEndCash = Number(params.actualEndCash) || 0;
    const variance = actualEndCash - activeSummary.expectedEndCash;
    const incomingStaff = (params.incomingOperator || '').trim() || 'Operator';

    const incomingEmpl = db.select().from(schema.employees).where(eq(schema.employees.name, incomingStaff)).get();
    if (!incomingEmpl) {
      return {
        success: false,
        message: `Operator penerima shift "${incomingStaff}" belum terdaftar di database. Buat akun di Pengaturan Staf terlebih dahulu.`,
        closedShift: currentShift
      };
    }
    if (incomingEmpl.enabled === 0) {
      return { success: false, message: `Akun operator "${incomingStaff}" dinonaktifkan.`, closedShift: currentShift };
    }
    if (!verifyPassword((params.incomingPassword || '').trim(), incomingEmpl.passwordHash || '').ok) {
      return { success: false, message: `Password operator penerima "${incomingStaff}" salah.`, closedShift: currentShift };
    }

    let newShiftRow: typeof schema.shifts.$inferSelect;
    const nextShiftSlot = shiftSlotAt(nowDate);

    const tx = sqlite.transaction(() => {
      // 1. Close current shift in Shifts table
      db.update(schema.shifts)
        .set({
          endDT: now,
          totalCashIn: activeSummary.totalCashIn,
          totalCashOut: activeSummary.totalCashOut,
          endCash: actualEndCash,
          status: 0 // Closed
        })
        .where(eq(schema.shifts.id, currentShift.id))
        .run();

      // 2. Insert Handover log in TransactionLogs
      const outgoingStaff = params.staff || currentShift.employeeName || 'Kasir';
      const handoverNote = `Handover Shift: ${outgoingStaff} -> ${incomingStaff}. Modal Kas: Rp ${actualEndCash.toLocaleString('id-ID')} (Selisih: Rp ${variance.toLocaleString('id-ID')}). ${params.note || ''}`;

      this.addTransaction({
        username: `Shift Handover`,
        date: nowDate.toLocaleDateString('id-ID'),
        time: nowDate.toTimeString().split(' ')[0],
        price: actualEndCash,
        timeUsed: 'Shift',
        staff: outgoingStaff,
        note: handoverNote
      });

      // 3. Insert system audit log
      db.insert(schema.systemLogs).values({
        eventTime: now,
        eventType: 3, // Shift Handover
        description: handoverNote,
        level: variance !== 0 ? 1 : 0
      }).run();

      // 4. Open new Shift for incoming operator
      newShiftRow = db.insert(schema.shifts).values({
        emplId: incomingEmpl.id,
        shiftTime: nextShiftSlot,
        startDT: now,
        startCash: actualEndCash,
        totalCashIn: 0,
        totalCashOut: 0,
        endCash: 0,
        status: 1 // Open
      }).returning().get();
    });
    tx();

    const closedShiftRecord: ShiftRecord = {
      ...currentShift,
      endDT: now,
      endDateFormatted: `${nowDate.toLocaleDateString('id-ID')} ${nowDate.toLocaleTimeString('id-ID')}`,
      totalCashIn: activeSummary.totalCashIn,
      totalCashOut: activeSummary.totalCashOut,
      endCash: actualEndCash,
      expectedCash: activeSummary.expectedEndCash,
      variance,
      status: 0,
      statusText: 'Closed',
      note: params.note
    };

    const newShiftRecord: ShiftRecord = {
      id: newShiftRow!.id,
      emplId: incomingEmpl.id,
      employeeName: incomingStaff,
      shiftTime: nextShiftSlot,
      shiftTimeLabel: shiftLabel(nextShiftSlot),
      startDT: now,
      startDateFormatted: `${nowDate.toLocaleDateString('id-ID')} ${nowDate.toLocaleTimeString('id-ID')}`,
      endDT: null,
      endDateFormatted: null,
      startCash: actualEndCash,
      totalCashIn: 0,
      totalCashOut: 0,
      endCash: 0,
      expectedCash: actualEndCash,
      variance: 0,
      status: 1,
      statusText: 'Open'
    };

    return {
      success: true,
      message: `Shift berhasil ditutup dan dialihkan ke ${incomingStaff}. Total kas fisik: Rp ${actualEndCash.toLocaleString('id-ID')} (Selisih: Rp ${variance.toLocaleString('id-ID')}).`,
      closedShift: closedShiftRecord,
      newShift: newShiftRecord,
      variance,
      operator: { id: incomingEmpl.id, name: incomingEmpl.name, role: incomingEmpl.role }
    };
  }

  public static getShiftHistory(limit: number = 30): ShiftRecord[] {
    const rows = db.select().from(schema.shifts).orderBy(desc(schema.shifts.id)).limit(limit).all();
    const employees = db.select().from(schema.employees).all();
    const emplMap = new Map(employees.map(e => [e.id, e.name]));

    return rows.map(r => {
      const sDate = new Date(r.startDT);
      const eDate = r.endDT ? new Date(r.endDT) : null;
      const startCash = Number(r.startCash) || 0;
      const cashIn = Number(r.totalCashIn) || 0;
      const cashOut = Number(r.totalCashOut) || 0;
      const endCash = Number(r.endCash) || 0;
      const expected = startCash + cashIn - cashOut;
      const variance = r.status === 0 ? endCash - expected : 0;

      return {
        id: r.id,
        emplId: r.emplId,
        employeeName: emplMap.get(r.emplId) || `Kasir #${r.emplId}`,
        shiftTime: r.shiftTime,
        shiftTimeLabel: shiftLabel(r.shiftTime),
        startDT: r.startDT,
        startDateFormatted: `${sDate.toLocaleDateString('id-ID')} ${sDate.toLocaleTimeString('id-ID')}`,
        endDT: r.endDT || null,
        endDateFormatted: eDate ? `${eDate.toLocaleDateString('id-ID')} ${eDate.toLocaleTimeString('id-ID')}` : 'Sedang Berjalan',
        startCash,
        totalCashIn: cashIn,
        totalCashOut: cashOut,
        endCash,
        expectedCash: expected,
        variance,
        status: r.status,
        statusText: r.status === 1 ? 'Open' : 'Closed'
      };
    });
  }

  // ==================== GUEST TOKENS ====================
  public static generateGuestToken(params: {
    durationMinutes: number;
    price?: number;
    type?: 'time' | 'money';
    note?: string;
  }): { code: string; durationMinutes: number; price: number } {
    const code = `GT-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date().toLocaleDateString('id-ID');
    
    db.insert(schema.coupons).values({
      code,
      type: params.type || 'time',
      value: params.price || 0,
      durationMinutes: params.durationMinutes,
      isUsed: 0,
      createdAt: now,
      expiredAt: '31-12-2027',
      detail: params.note || 'Guest Temporary Token'
    }).run();

    return {
      code,
      durationMinutes: params.durationMinutes,
      price: params.price || 0
    };
  }

  public static generateGuestTokenBatch(
    count: number,
    durationMinutes: number,
    price: number = 0
  ): { code: string; durationMinutes: number; price: number }[] {
    const tokens: { code: string; durationMinutes: number; price: number }[] = [];
    for (let i = 0; i < count; i++) {
      tokens.push(this.generateGuestToken({ durationMinutes, price }));
    }
    return tokens;
  }

  // ==================== POS PRODUCTS & CATEGORIES ====================
  public static getCategories(): ProductCategoryItem[] {
    const rows = db.select().from(schema.productCategories).all();
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled === 1
    }));
  }

  public static saveCategory(data: Partial<ProductCategoryItem>): ProductCategoryItem {
    if (data.id) {
      db.update(schema.productCategories)
        .set({
          name: data.name,
          enabled: data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1
        })
        .where(eq(schema.productCategories.id, data.id))
        .run();
      const updated = db.select().from(schema.productCategories).where(eq(schema.productCategories.id, data.id)).get();
      return {
        id: updated!.id,
        name: updated!.name,
        enabled: updated!.enabled === 1
      };
    } else {
      const inserted = db.insert(schema.productCategories).values({
        name: data.name || 'Kategori Baru',
        enabled: data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1
      }).returning().get();
      return {
        id: inserted.id,
        name: inserted.name,
        enabled: inserted.enabled === 1
      };
    }
  }

  public static deleteCategory(id: number): { success: boolean; message: string } {
    const count = db.select().from(schema.orderItems).where(eq(schema.orderItems.categoryId, id)).all().length;
    if (count > 0) {
      return { success: false, message: `Kategori tidak dapat dihapus karena masih digunakan oleh ${count} produk.` };
    }
    db.delete(schema.productCategories).where(eq(schema.productCategories.id, id)).run();
    return { success: true, message: 'Kategori berhasil dihapus.' };
  }

  public static getProducts(): ProductItem[] {
    const categories = this.getCategories();
    const catMap = new Map(categories.map(c => [c.id, c.name]));
    const rows = db.select().from(schema.orderItems).all();
    return rows.map(r => ({
      id: r.id,
      categoryId: r.categoryId,
      categoryName: catMap.get(r.categoryId) || 'Lainnya',
      name: r.name,
      barcode: r.barcode || undefined,
      unitPrice: Number(r.unitPrice) || 0,
      costPrice: Number(r.costPrice) || 0,
      stock: Number(r.stock) || 0,
      alertStock: Number(r.alertStock) || 5,
      unitName: r.unitName || 'pcs',
      enabled: r.enabled === 1
    }));
  }

  // Product form from the POS tab (Kelola Produk). Validates what the screen sends; the category is
  // given by name and created when it does not exist yet, so the cashier never manages ids.
  public static saveProductChecked(input: unknown): { success: boolean; message: string; product?: ProductItem } {
    const d = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const fail = (message: string) => ({ success: false, message });
    const name = String(d.name ?? '').trim();
    const price = Number(d.unitPrice);
    const stock = Number(d.stock ?? 0);
    const alertStock = Number(d.alertStock ?? 5);
    const id = d.id === undefined || d.id === null ? undefined : Number(d.id);
    const products = this.getProducts();

    if (!name) return fail('Nama produk wajib diisi.');
    if (name.length > 60) return fail('Nama produk maksimal 60 huruf.');
    if (!Number.isInteger(price) || price < 0 || price > 10_000_000) return fail('Harga harus angka bulat dari 0 sampai 10.000.000.');
    if (!Number.isInteger(stock) || stock < 0 || stock > 100_000) return fail('Stok harus angka bulat 0 atau lebih.');
    if (!Number.isInteger(alertStock) || alertStock < 0 || alertStock > 100_000) return fail('Batas stok menipis harus angka bulat 0 atau lebih.');
    if (id !== undefined && !products.some(p => p.id === id)) return fail('Produk tidak ditemukan.');
    if (products.some(p => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) return fail(`Sudah ada produk bernama ${name}.`);

    const categoryName = String(d.categoryName ?? '').trim().slice(0, 40) || 'Lainnya';
    const category = this.getCategories().find(c => c.name.toLowerCase() === categoryName.toLowerCase())
      ?? this.saveCategory({ name: categoryName, enabled: true });

    const product = this.saveProduct({
      id,
      name,
      categoryId: category.id,
      unitPrice: price,
      stock,
      alertStock,
      unitName: String(d.unitName ?? '').trim().slice(0, 20) || 'pcs',
      enabled: d.enabled !== false,
    });
    return { success: true, message: `${name} tersimpan.`, product };
  }

  public static saveProduct(data: Partial<ProductItem>): ProductItem {
    if (data.id) {
      db.update(schema.orderItems)
        .set({
          categoryId: data.categoryId,
          name: data.name,
          barcode: data.barcode,
          unitPrice: data.unitPrice,
          costPrice: data.costPrice,
          stock: data.stock,
          alertStock: data.alertStock,
          unitName: data.unitName,
          enabled: data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1
        })
        .where(eq(schema.orderItems.id, data.id))
        .run();
      
      const updated = db.select().from(schema.orderItems).where(eq(schema.orderItems.id, data.id)).get();
      return {
        id: updated!.id,
        categoryId: updated!.categoryId,
        name: updated!.name,
        barcode: updated!.barcode || undefined,
        unitPrice: updated!.unitPrice,
        costPrice: updated!.costPrice || 0,
        stock: updated!.stock,
        alertStock: updated!.alertStock || 5,
        unitName: updated!.unitName || 'pcs',
        enabled: updated!.enabled === 1
      };
    } else {
      const inserted = db.insert(schema.orderItems).values({
        categoryId: data.categoryId || 1,
        name: data.name || 'Produk Baru',
        barcode: data.barcode || null,
        unitPrice: data.unitPrice || 0,
        costPrice: data.costPrice || 0,
        stock: data.stock || 0,
        alertStock: data.alertStock || 5,
        unitName: data.unitName || 'pcs',
        enabled: data.enabled === false ? 0 : 1
      }).returning().get();

      return {
        id: inserted.id,
        categoryId: inserted.categoryId,
        name: inserted.name,
        barcode: inserted.barcode || undefined,
        unitPrice: inserted.unitPrice,
        costPrice: inserted.costPrice || 0,
        stock: inserted.stock,
        alertStock: inserted.alertStock || 5,
        unitName: inserted.unitName || 'pcs',
        enabled: inserted.enabled === 1
      };
    }
  }

  public static deleteProduct(id: number): void {
    db.delete(schema.orderItems).where(eq(schema.orderItems.id, id)).run();
  }

  /**
   * Adjust stock manually / Stock Opname
   */
  public static adjustStock(params: StockAdjustmentParams): { success: boolean; message: string; product?: ProductItem } {
    const existing = db.select().from(schema.orderItems).where(eq(schema.orderItems.id, params.productId)).get();
    if (!existing) {
      return { success: false, message: 'Produk tidak ditemukan.' };
    }

    let newStock = existing.stock;
    if (params.mode === 'add') {
      newStock += Math.max(0, params.changeAmount);
    } else if (params.mode === 'subtract') {
      newStock = Math.max(0, newStock - Math.max(0, params.changeAmount));
    } else if (params.mode === 'set') {
      newStock = Math.max(0, params.changeAmount);
    }

    db.update(schema.orderItems)
      .set({ stock: newStock })
      .where(eq(schema.orderItems.id, params.productId))
      .run();

    // Log to SystemLogs
    db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: 4, // Stock Opname / Inventory
      description: `Stok [${existing.name}] disesuaikan: ${existing.stock} -> ${newStock} (${params.mode} ${params.changeAmount}) [Alasan: ${params.reason || 'Koreksi Stok'}] oleh ${params.staff || 'Kasir'}`,
      level: 0
    }).run();

    const updatedProduct = this.getProducts().find(p => p.id === params.productId);
    return {
      success: true,
      message: `Stok ${existing.name} berhasil diperbarui menjadi ${newStock}.`,
      product: updatedProduct
    };
  }

  /**
   * Quick Restock Product
   */
  public static restockProduct(
    productId: number,
    addedStock: number,
    costPrice?: number,
    staff?: string
  ): { success: boolean; message: string; product?: ProductItem } {
    const existing = db.select().from(schema.orderItems).where(eq(schema.orderItems.id, productId)).get();
    if (!existing) {
      return { success: false, message: 'Produk tidak ditemukan.' };
    }

    if (!Number.isInteger(addedStock) || addedStock < 1 || addedStock > 10_000) {
      return { success: false, message: 'Jumlah tambah stok harus angka bulat 1 sampai 10.000.' };
    }
    const qty = addedStock;
    const newStock = existing.stock + qty;
    const updateData: any = { stock: newStock };
    if (costPrice !== undefined && costPrice >= 0) {
      updateData.costPrice = costPrice;
    }

    db.update(schema.orderItems)
      .set(updateData)
      .where(eq(schema.orderItems.id, productId))
      .run();

    // Log audit
    db.insert(schema.systemLogs).values({
      eventTime: Date.now(),
      eventType: 4, // Restock
      description: `Restock [${existing.name}] +${qty} unit (Total: ${newStock}) ${costPrice !== undefined ? `[Harga Modal Baru: Rp ${costPrice.toLocaleString('id-ID')}]` : ''} oleh ${staff || 'Kasir'}`,
      level: 0
    }).run();

    const updatedProduct = this.getProducts().find(p => p.id === productId);
    return {
      success: true,
      message: `Berhasil restock ${qty} unit ${existing.name}.`,
      product: updatedProduct
    };
  }

  /**
   * Get Low Stock Alert Products
   */
  public static getLowStockProducts(): ProductItem[] {
    const all = this.getProducts();
    return all.filter(p => p.enabled && p.stock <= p.alertStock);
  }

  /**
   * Get Inventory Summary & Valuation
   */
  public static getInventorySummary(): InventorySummary {
    const products = this.getProducts();
    const totalItems = products.length;
    let totalStockUnits = 0;
    let totalCostValuation = 0;
    let totalRetailValuation = 0;
    let lowStockCount = 0;

    for (const p of products) {
      if (p.enabled) {
        totalStockUnits += p.stock;
        totalCostValuation += p.stock * (p.costPrice || 0);
        totalRetailValuation += p.stock * p.unitPrice;
        if (p.stock <= p.alertStock) {
          lowStockCount++;
        }
      }
    }

    return {
      totalItems,
      totalStockUnits,
      totalCostValuation,
      totalRetailValuation,
      lowStockCount
    };
  }

  // ==================== POS ORDERS & WORKFLOW ====================
  private static orderListeners: ((order: OrderRecord) => void)[] = [];

  public static onOrderReceived(listener: (order: OrderRecord) => void): () => void {
    this.orderListeners.push(listener);
    return () => {
      this.orderListeners = this.orderListeners.filter(l => l !== listener);
    };
  }

  /**
   * Rebuilds an order sent by a booth PC from the catalog. The client only picks products and
   * quantities; names and prices always come from the database, never from the packet.
   */
  public static priceClientOrder(items: unknown):
    | { success: true; items: Array<{ productId: number; name: string; unitPrice: number; quantity: number }>; totalPrice: number }
    | { success: false; message: string } {
    if (!Array.isArray(items) || items.length === 0) return { success: false, message: 'Pesanan kosong.' };
    if (items.length > 30) return { success: false, message: 'Terlalu banyak baris pesanan.' };

    const catalog = new Map(this.getProducts().map(p => [p.id, p]));
    const qtyById = new Map<number, number>();
    for (const raw of items as Array<Record<string, unknown>>) {
      const id = Number(raw?.productId ?? raw?.id);
      const qty = Number(raw?.quantity ?? raw?.amount);
      const product = catalog.get(id);
      if (!product || !product.enabled) return { success: false, message: 'Ada menu yang sudah tidak tersedia. Buka ulang daftar menu.' };
      if (!Number.isInteger(qty) || qty < 1 || qty > 99) return { success: false, message: `Jumlah ${product.name} tidak valid.` };
      qtyById.set(id, (qtyById.get(id) || 0) + qty);
    }

    const priced = [...qtyById].map(([id, quantity]) => {
      const p = catalog.get(id)!;
      return { productId: id, name: p.name, unitPrice: p.unitPrice, quantity };
    });
    if (priced.some(it => it.quantity > 99)) return { success: false, message: 'Jumlah per menu maksimal 99.' };
    return { success: true, items: priced, totalPrice: priced.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0) };
  }

  // Walk-in sale at the counter (POS tab). Prices come from the catalog, never from the screen,
  // stock must cover the sale, and it goes through the same order + cash approval as booth orders
  // so stock is deducted and the items are logged.
  public static counterSale(params: { items: unknown; staff?: string }): { success: boolean; message: string; total?: number; lowStockWarnings?: string[] } {
    const priced = this.priceClientOrder(params.items);
    if (!priced.success) return { success: false, message: priced.message };

    // approveOrder checks stock too; checking here first avoids leaving a pending order behind.
    const products = new Map(this.getProducts().map(p => [p.id, p]));
    for (const it of priced.items) {
      const stock = products.get(it.productId)?.stock ?? 0;
      if (stock < it.quantity) return { success: false, message: `Stok ${it.name} tinggal ${stock}.` };
    }

    const order = this.createOrder({
      pcId: 'KASIR',
      pcName: 'Kasir',
      username: 'Pembeli di kasir',
      items: priced.items,
      totalPrice: priced.totalPrice,
      staff: params.staff,
    });
    const approved = this.approveOrder({ orderLogId: order.id, payMethod: 'cash', staff: params.staff });
    if (!approved.success) return { success: false, message: approved.message };
    return {
      success: true,
      message: `Terjual ${priced.items.length} menu, Rp ${priced.totalPrice.toLocaleString('id-ID')} tunai.`,
      total: priced.totalPrice,
      lowStockWarnings: approved.lowStockWarnings,
    };
  }

  public static createOrder(data: {
    workstationId?: number;
    pcId: string;
    pcName?: string;
    username?: string;
    accountId?: number;
    sessionId?: number;
    items: Array<{ id?: number; productId?: number; name: string; unitPrice?: number; price?: number; amount?: number; quantity?: number }>;
    totalPrice?: number;
    note?: string;
    staff?: string;
  }): OrderRecord {
    const now = new Date();
    const dateNum = parseInt(now.toISOString().slice(0, 10).replace(/-/g, ''));
    const timeNum = parseInt(now.toTimeString().slice(0, 8).replace(/:/g, ''));
    const orderCode = `ORD-${Date.now().toString().slice(-6)}`;
    const createdAtStr = now.toLocaleDateString('id-ID') + ' ' + now.toLocaleTimeString('id-ID');

    // Normalize items
    const normalizedItems: OrderItemDetail[] = data.items.map(item => {
      const pId = item.productId || item.id || 1;
      const uPrice = Number(item.unitPrice || item.price) || 0;
      const qty = Number(item.amount || item.quantity) || 1;
      return {
        productId: pId,
        name: item.name,
        amount: qty,
        unitPrice: uPrice,
        totalPrice: uPrice * qty
      };
    });

    const calculatedTotal = data.totalPrice !== undefined 
      ? data.totalPrice 
      : normalizedItems.reduce((sum, it) => sum + it.totalPrice, 0);

    // 1. Insert OrderLog into SQLite
    const insertedOrder = db.insert(schema.orderLogs).values({
      orderCode,
      workstationId: data.workstationId || (Number(data.pcId.replace(/\D/g, '')) || 1),
      pcId: data.pcId,
      pcName: data.pcName || data.pcId,
      username: data.username || 'Tamu',
      itemsJson: JSON.stringify(normalizedItems),
      accountId: data.accountId || 0,
      sessionId: data.sessionId || 0,
      totalMoney: calculatedTotal,
      totalPrice: calculatedTotal,
      orderStatus: 0, // 0: Pending
      status: 'pending',
      payStatus: 0,   // 0: Unpaid / Tab
      date: dateNum,
      time: timeNum,
      createdAt: createdAtStr,
      staff: data.staff || 'Kasir',
      note: data.note || null,
      enabled: 1
    }).returning().get();

    // 2. Insert OrderItemLogs into SQLite
    normalizedItems.forEach(it => {
      db.insert(schema.orderItemLogs).values({
        orderLogId: insertedOrder.id,
        productId: it.productId,
        productName: it.name,
        amount: it.amount,
        unitPrice: it.unitPrice,
        orderStatus: 0,
        payStatus: 0,
        date: dateNum,
        time: timeNum,
        note: data.note || null,
        enabled: 1
      }).run();
    });

    const resultRecord: OrderRecord = {
      id: insertedOrder.id,
      orderCode,
      workstationId: insertedOrder.workstationId || undefined,
      pcId: data.pcId,
      pcName: data.pcName || data.pcId,
      username: data.username || 'Tamu',
      items: normalizedItems,
      totalPrice: calculatedTotal,
      orderStatus: 0,
      statusText: 'Pending',
      payStatus: 0,
      payMethodText: 'Belum Dibayar',
      createdAt: createdAtStr,
      staff: data.staff || 'Kasir',
      note: data.note || undefined
    };

    // Notify listeners
    this.orderListeners.forEach(fn => {
      try { fn(resultRecord); } catch (e) {}
    });

    return resultRecord;
  }

  public static getPendingOrders(): OrderRecord[] {
    const rows = db.select()
      .from(schema.orderLogs)
      .where(eq(schema.orderLogs.orderStatus, 0))
      .orderBy(desc(schema.orderLogs.id))
      .all();

    return rows.map(r => {
      let parsedItems: OrderItemDetail[] = [];
      try {
        parsedItems = r.itemsJson ? JSON.parse(r.itemsJson) : [];
      } catch {
        parsedItems = [];
      }

      return {
        id: r.id,
        orderCode: r.orderCode || `ORD-${r.id}`,
        workstationId: r.workstationId || undefined,
        pcId: r.pcId || `PC-${r.workstationId || 1}`,
        pcName: r.pcName || r.pcId || 'PC',
        username: r.username || 'Tamu',
        items: parsedItems,
        totalPrice: Number(r.totalPrice || r.totalMoney) || 0,
        orderStatus: r.orderStatus,
        statusText: 'Pending',
        payStatus: r.payStatus,
        payMethodText: r.payStatus === 1 ? 'Tunai' : r.payStatus === 2 ? 'Potong Saldo' : 'Belum Dibayar',
        createdAt: r.createdAt || '',
        approvedAt: r.approvedAt || undefined,
        staff: r.staff || undefined,
        note: r.note || undefined
      };
    });
  }

  public static approveOrder(params: {
    orderLogId: number;
    payMethod: 'cash' | 'saldo';
    staff?: string;
  }): { success: boolean; message: string; lowStockWarnings: string[]; order?: OrderRecord } {
    // F&B is paid up front, in cash or from a member balance. There is no running tab.
    if (params.payMethod !== 'cash' && params.payMethod !== 'saldo') {
      return { success: false, message: 'Metode bayar pesanan harus tunai atau potong saldo member.', lowStockWarnings: [] };
    }
    const order = db.select().from(schema.orderLogs).where(eq(schema.orderLogs.id, params.orderLogId)).get();
    if (!order) {
      return { success: false, message: 'Pesanan tidak ditemukan di database.', lowStockWarnings: [] };
    }
    // A second click must not deduct stock or record the money twice.
    if (order.orderStatus !== 0) {
      return { success: false, message: 'Pesanan ini sudah diproses sebelumnya.', lowStockWarnings: [] };
    }

    const now = new Date();
    const approvedAtStr = now.toLocaleDateString('id-ID') + ' ' + now.toLocaleTimeString('id-ID');
    const payStatusCode = params.payMethod === 'cash' ? 1 : params.payMethod === 'saldo' ? 2 : 0;
    const staffName = params.staff || 'Kasir';
    const total = Number(order.totalPrice || order.totalMoney) || 0;

    let items: OrderItemDetail[] = [];
    try {
      items = order.itemsJson ? JSON.parse(order.itemsJson) : [];
    } catch {
      items = [];
    }

    // Stock must cover the whole order; it used to be clamped at 0, which sold items that were not there.
    const needed = new Map<number, number>();
    items.forEach(it => needed.set(it.productId, (needed.get(it.productId) || 0) + it.amount));
    for (const [productId, qty] of needed) {
      const product = db.select().from(schema.orderItems).where(eq(schema.orderItems.id, productId)).get();
      if (product && product.stock < qty) {
        return { success: false, message: `Stok ${product.name} tinggal ${product.stock}, pesanan butuh ${qty}. Tolak pesanan atau tambah stok dulu.`, lowStockWarnings: [] };
      }
    }

    // Validate saldo payment upfront before any deduction
    let targetMember: typeof schema.userAccounts.$inferSelect | undefined;
    if (params.payMethod === 'saldo') {
      const m = db.select().from(schema.userAccounts).where(eq(schema.userAccounts.name, order.username || '')).get();
      if (!m) {
        return { success: false, message: `Gagal potong saldo: Akun member [${order.username}] tidak ditemukan di database.`, lowStockWarnings: [] };
      }
      if ((m.money || 0) < total) {
        return { success: false, message: `Saldo member [${order.username}] tidak mencukupi (Tersisa Rp ${(m.money || 0).toLocaleString('id-ID')}, Total Tagihan Rp ${total.toLocaleString('id-ID')}).`, lowStockWarnings: [] };
      }
      targetMember = m;
    }

    const lowStockWarnings: string[] = [];

    const tx = sqlite.transaction(() => {
      // 1. Stock Deduction & Low Stock Warnings
      items.forEach(it => {
        const product = db.select().from(schema.orderItems).where(eq(schema.orderItems.id, it.productId)).get();
        if (product) {
          const newStock = Math.max(0, product.stock - it.amount);
          db.update(schema.orderItems)
            .set({ stock: newStock })
            .where(eq(schema.orderItems.id, product.id))
            .run();

          if (newStock <= (product.alertStock || 5)) {
            lowStockWarnings.push(`Stok [${product.name}] menipis: tersisa ${newStock} ${product.unitName || 'pcs'}`);
          }
        }
      });

      // 2. Handle Payment Method
      if (params.payMethod === 'cash') {
        this.addTransaction({
          username: order.username || order.pcName || order.pcId || 'Pelanggan F&B',
          date: now.toLocaleDateString('id-ID'),
          time: now.toTimeString().split(' ')[0],
          price: total,
          timeUsed: 'F&B',
          staff: staffName,
          note: `Penjualan F&B Tunai (${items.length} item) - ${order.pcName || order.pcId}`
        });
      } else if (params.payMethod === 'saldo' && targetMember) {
        const newBalance = Math.max(0, (targetMember.money || 0) - total);
        const newUsed = (targetMember.usedAmount || 0) + total;
        db.update(schema.userAccounts)
          .set({ money: newBalance, usedAmount: newUsed })
          .where(eq(schema.userAccounts.id, targetMember.id))
          .run();

        this.addTransaction({
          username: order.username || 'Member F&B',
          date: now.toLocaleDateString('id-ID'),
          time: now.toTimeString().split(' ')[0],
          price: total,
          timeUsed: 'F&B',
          staff: staffName,
          note: `Penjualan F&B Potong Saldo (${items.length} item) - ${order.pcName || order.pcId}`
        });
      }

      // 3. Update OrderLog status in SQLite
      db.update(schema.orderLogs)
        .set({
          orderStatus: 1, // Approved
          status: 'approved',
          payStatus: payStatusCode,
          approvedAt: approvedAtStr,
          staff: staffName
        })
        .where(eq(schema.orderLogs.id, params.orderLogId))
        .run();

      // 4. Update OrderItemLogs status in SQLite
      db.update(schema.orderItemLogs)
        .set({
          orderStatus: 1,
          payStatus: payStatusCode
        })
        .where(eq(schema.orderItemLogs.orderLogId, params.orderLogId))
        .run();
    });
    tx();

    const updatedOrder: OrderRecord = {
      id: order.id,
      orderCode: order.orderCode || `ORD-${order.id}`,
      workstationId: order.workstationId || undefined,
      pcId: order.pcId || 'PC-01',
      pcName: order.pcName || order.pcId || 'PC-01',
      username: order.username || 'Tamu',
      items,
      totalPrice: total,
      orderStatus: 1,
      statusText: 'Disetujui',
      payStatus: payStatusCode,
      payMethodText: params.payMethod === 'cash' ? 'Tunai' : params.payMethod === 'saldo' ? 'Potong Saldo' : 'Masuk Tagihan (Tab)',
      createdAt: order.createdAt || '',
      approvedAt: approvedAtStr,
      staff: staffName,
      note: order.note || undefined
    };

    return {
      success: true,
      message: `Pesanan ${order.orderCode || order.id} berhasil disetujui (${updatedOrder.payMethodText}).`,
      lowStockWarnings,
      order: updatedOrder
    };
  }

  public static rejectOrder(params: {
    orderLogId: number;
    reason?: string;
    staff?: string;
  }): { success: boolean; message: string; order?: OrderRecord } {
    const order = db.select().from(schema.orderLogs).where(eq(schema.orderLogs.id, params.orderLogId)).get();
    if (!order) {
      return { success: false, message: 'Pesanan tidak ditemukan.' };
    }
    if (order.orderStatus !== 0) {
      return { success: false, message: 'Pesanan ini sudah diproses sebelumnya.' };
    }

    const reasonText = params.reason || 'Ditolak kasir (Stok habis)';
    db.update(schema.orderLogs)
      .set({
        orderStatus: 2, // Rejected
        status: 'rejected',
        note: reasonText,
        staff: params.staff || 'Kasir'
      })
      .where(eq(schema.orderLogs.id, params.orderLogId))
      .run();

    db.update(schema.orderItemLogs)
      .set({ orderStatus: 2 })
      .where(eq(schema.orderItemLogs.orderLogId, params.orderLogId))
      .run();

    let items: OrderItemDetail[] = [];
    try {
      items = order.itemsJson ? JSON.parse(order.itemsJson) : [];
    } catch {
      items = [];
    }

    return {
      success: true,
      message: `Pesanan ${order.orderCode || order.id} ditolak.`,
      order: {
        id: order.id,
        orderCode: order.orderCode || `ORD-${order.id}`,
        workstationId: order.workstationId || undefined,
        pcId: order.pcId || 'PC-01',
        pcName: order.pcName || order.pcId || 'PC-01',
        username: order.username || 'Tamu',
        items,
        totalPrice: Number(order.totalPrice || order.totalMoney) || 0,
        orderStatus: 2,
        statusText: 'Ditolak',
        payStatus: order.payStatus,
        createdAt: order.createdAt || '',
        note: reasonText
      }
    };
  }

  public static getOrders(limit: number = 50): OrderRecord[] {
    const rows = db.select()
      .from(schema.orderLogs)
      .orderBy(desc(schema.orderLogs.id))
      .limit(limit)
      .all();

    return rows.map(r => {
      let parsedItems: OrderItemDetail[] = [];
      try {
        parsedItems = r.itemsJson ? JSON.parse(r.itemsJson) : [];
      } catch {
        parsedItems = [];
      }

      return {
        id: r.id,
        orderCode: r.orderCode || `ORD-${r.id}`,
        workstationId: r.workstationId || undefined,
        pcId: r.pcId || `PC-${r.workstationId || 1}`,
        pcName: r.pcName || r.pcId || 'PC',
        username: r.username || 'Tamu',
        items: parsedItems,
        totalPrice: Number(r.totalPrice || r.totalMoney) || 0,
        orderStatus: r.orderStatus,
        statusText: r.orderStatus === 1 ? 'Disetujui' : r.orderStatus === 2 ? 'Ditolak' : 'Pending',
        payStatus: r.payStatus,
        payMethodText: r.payStatus === 1 ? 'Tunai' : r.payStatus === 2 ? 'Potong Saldo' : 'Belum Dibayar',
        createdAt: r.createdAt || '',
        approvedAt: r.approvedAt || undefined,
        staff: r.staff || undefined,
        note: r.note || undefined
      };
    });
  }

  // ============================================================================
  // APP SETTINGS
  // ============================================================================
  public static getSetting(key: string, defaultValue: string = ''): string {
    try {
      const result = db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).get();
      return result ? result.value : defaultValue;
    } catch (err) {
      return defaultValue;
    }
  }

  public static setSetting(key: string, value: string): void {
    try {
      const exists = db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).get();
      if (exists) {
        db.update(schema.appSettings).set({ value }).where(eq(schema.appSettings.key, key)).run();
      } else {
        db.insert(schema.appSettings).values({ key, value }).run();
      }
    } catch (err) {
      console.error('[DB] Failed to set setting:', err);
    }
  }
}


