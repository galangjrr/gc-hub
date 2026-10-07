import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

function getDbDir(): string {
  // Test memakai database sementara sendiri (lihat scripts/run-electron-test.mjs)
  if (process.env.GCHUB_DB_DIR) return path.resolve(process.env.GCHUB_DB_DIR);
  try {
    const electron = require('electron');
    if (electron?.app?.isPackaged) {
      return path.join(path.dirname(process.execPath), 'data');
    }
  } catch {}
  return path.join(process.cwd(), 'data');
}

const DB_DIR = getDbDir();
if (!fs.existsSync(DB_DIR)) {
  try {
    fs.mkdirSync(DB_DIR, { recursive: true });
  } catch (err) {
    console.error('[DB] Failed to create DB_DIR:', err);
  }
}

const DB_PATH = path.join(DB_DIR, 'gcserver.sqlite');

// Init better-sqlite3
export const sqlite = new Database(DB_PATH, { 
  // verbose: console.log
});

// Setup pragmas untuk performa & stabilitas SQLite maksimal (WAL mode 24/7)
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000'); // Mencegah crash kasir saat write bersamaan
sqlite.pragma('temp_store = MEMORY'); // Mengurangi aus SSD server warnet
sqlite.pragma('cache_size = -32000'); // 32MB cache di RAM untuk query instan

// Export instance Drizzle ORM
export const db = drizzle(sqlite, { schema });

// Backup harian: satu file per tanggal di data/backups, simpan 14 terakhir.
// Dijalankan saat server start dan tiap 6 jam, karena PC server tidak selalu nyala 24 jam.
// Backup manual dari halaman Pengaturan punya nama sendiri (…-manual-HHMMSS) dan disimpan 10 terakhir.
export const BACKUP_DIR = path.join(DB_DIR, 'backups');
const BACKUP_KEEP = 14;
const MANUAL_KEEP = 10;
const DAILY_RE = /^gcserver-\d{4}-\d{2}-\d{2}\.sqlite$/;
const MANUAL_RE = /^gcserver-\d{4}-\d{2}-\d{2}-manual-\d{6}\.sqlite$/;

const pad = (n: number) => String(n).padStart(2, '0');

function prune(pattern: RegExp, keep: number): void {
  const files = fs.readdirSync(BACKUP_DIR).filter(f => pattern.test(f)).sort().reverse();
  files.slice(keep).forEach(f => fs.rmSync(path.join(BACKUP_DIR, f), { force: true }));
}

export async function backupDatabase(manual = false): Promise<string | null> {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const d = new Date();
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const name = manual
      ? `gcserver-${stamp}-manual-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.sqlite`
      : `gcserver-${stamp}.sqlite`;
    const target = path.join(BACKUP_DIR, name);
    if (fs.existsSync(target)) return manual ? target : null; // backup harian hari ini sudah ada

    await sqlite.backup(target); // online backup bawaan SQLite, aman saat DB sedang dipakai
    prune(manual ? MANUAL_RE : DAILY_RE, manual ? MANUAL_KEEP : BACKUP_KEEP);
    console.log(`[DB] Backup ${manual ? 'manual' : 'harian'} tersimpan: ${target}`);
    return target;
  } catch (err) {
    console.error('[DB] Backup gagal:', err);
    return null;
  }
}

export interface BackupFile {
  name: string;
  sizeBytes: number;
  createdAt: number; // epoch ms
  kind: 'harian' | 'manual';
}

export function listBackups(): BackupFile[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => DAILY_RE.test(f) || MANUAL_RE.test(f))
    .map(f => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, sizeBytes: st.size, createdAt: st.mtimeMs, kind: MANUAL_RE.test(f) ? 'manual' as const : 'harian' as const };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function startDailyBackup(): void {
  backupDatabase();
  setInterval(backupDatabase, 6 * 60 * 60 * 1000);
}

// Auto-initialize core tables
sqlite.exec(`
  -- 1. Users & Accounts
  CREATE TABLE IF NOT EXISTS Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL DEFAULT '',
    pwdHashType INTEGER NOT NULL DEFAULT 1,
    groupId INTEGER NOT NULL DEFAULT 1,
    money REAL NOT NULL DEFAULT 0.0,
    usedAmount REAL NOT NULL DEFAULT 0.0,
    freeMoney REAL NOT NULL DEFAULT 0.0,
    freeMinutes INTEGER NOT NULL DEFAULT 0,
    points INTEGER NOT NULL DEFAULT 0,
    loginTime INTEGER DEFAULT 0,
    expiredIn INTEGER DEFAULT 0,
    dueDate INTEGER DEFAULT 0,
    lastLoginDT INTEGER DEFAULT 0,
    lastLogoutDT INTEGER DEFAULT 0,
    mobilePhone TEXT,
    email TEXT,
    nric TEXT,
    address TEXT,
    couponType INTEGER DEFAULT 0,
    logRecorded INTEGER DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    firstName TEXT DEFAULT '',
    lastName TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    groupName TEXT DEFAULT 'Reguler',
    status TEXT DEFAULT 'Normal',
    createdAt TEXT,
    expiredAt TEXT
  );

  -- 2. UserGroups & WorkstationGroups
  CREATE TABLE IF NOT EXISTS UserGroups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rateId INTEGER NOT NULL DEFAULT 1,
    discountRateId INTEGER DEFAULT 0,
    checkoutRounding INTEGER DEFAULT 0,
    pointsMultiplier REAL DEFAULT 1.0,
    enabled INTEGER NOT NULL DEFAULT 1,
    needUploading INTEGER NOT NULL DEFAULT 1,
    discountPercent REAL DEFAULT 0,
    isDefault INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS WorkstationGroups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  -- 3. Workstations & Layouts
  CREATE TABLE IF NOT EXISTS Workstations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pcId TEXT UNIQUE,
    name TEXT NOT NULL,
    ip TEXT,
    mac TEXT DEFAULT '00:00:00:00:00:00',
    groupId INTEGER NOT NULL DEFAULT 1,
    groupName TEXT DEFAULT 'Area Reguler',
    status INTEGER NOT NULL DEFAULT 0,
    lockStatus INTEGER NOT NULL DEFAULT 1,
    currentSessionId INTEGER DEFAULT 0,
    currentAccountId INTEGER DEFAULT 0,
    currentAccountType INTEGER DEFAULT 0,
    memo TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    state TEXT DEFAULT 'idle',
    currentUser TEXT,
    billingType TEXT,
    remainingSeconds INTEGER DEFAULT 0,
    elapsedSeconds INTEGER DEFAULT 0,
    totalSpent REAL DEFAULT 0,
    pricePerHour REAL DEFAULT 4000,
    sessionPricePerHour REAL,
    packageName TEXT,
    lastSeen INTEGER
  );

  CREATE TABLE IF NOT EXISTS PcGridLayoutsCustom (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workstationId INTEGER NOT NULL,
    row INTEGER NOT NULL,
    column INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  -- 4. ChargingRates & Pricing
  CREATE TABLE IF NOT EXISTS ChargingRates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    isPeriodic INTEGER NOT NULL DEFAULT 0,
    minimalTime INTEGER DEFAULT 0,
    minimalRechargePeriod INTEGER DEFAULT 0,
    minimalRechargeAmount INTEGER DEFAULT 0,
    internetOption INTEGER DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    needUploading INTEGER NOT NULL DEFAULT 1,
    pricePerHour REAL NOT NULL DEFAULT 4000,
    nextHoursPrice REAL DEFAULT 3500,
    accumulationStep TEXT DEFAULT '30m',
    minimumCharge REAL DEFAULT 0,
    roundingMinutes INTEGER DEFAULT 1,
    gracePeriodMinutes INTEGER DEFAULT 0,
    targetUserType TEXT DEFAULT 'all',
    description TEXT,
    isDefault INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS PeriodicDiscounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rateId INTEGER NOT NULL,
    discountRateId INTEGER NOT NULL,
    startTime INTEGER NOT NULL,
    endTime INTEGER NOT NULL,
    weekdays INTEGER NOT NULL DEFAULT 127,
    enabled INTEGER NOT NULL DEFAULT 1,
    needUploading INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS RateStructures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userGroupId INTEGER NOT NULL,
    wsGroupId INTEGER NOT NULL,
    rateId INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    needUploading INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS PricePackagesFixed (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    minutes INTEGER NOT NULL DEFAULT 60,
    durationMinutes INTEGER DEFAULT 60,
    money REAL NOT NULL DEFAULT 0,
    price REAL DEFAULT 0,
    type TEXT NOT NULL DEFAULT '0',
    endType INTEGER NOT NULL DEFAULT 0,
    beginTime INTEGER DEFAULT 0,
    endTime INTEGER DEFAULT 0,
    startTime TEXT,
    dayOfWeek INTEGER DEFAULT 127,
    allowedUserGroups TEXT,
    allowedGroupsJson TEXT DEFAULT '["Reguler", "VIP"]',
    badge TEXT,
    isEnabled INTEGER DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS PrepayShortcuts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    visible INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    needUploading INTEGER NOT NULL DEFAULT 1
  );

  -- 5. POS / Food & Beverage
  CREATE TABLE IF NOT EXISTS ProductCategories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS OrderItems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoryId INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    barcode TEXT,
    unitPrice REAL NOT NULL,
    costPrice REAL DEFAULT 0.0,
    stock INTEGER NOT NULL DEFAULT 0,
    alertStock INTEGER DEFAULT 5,
    unitName TEXT DEFAULT 'pcs',
    enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS OrderLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderCode TEXT,
    workstationId INTEGER,
    pcId TEXT,
    pcName TEXT,
    username TEXT,
    itemsJson TEXT,
    accountId INTEGER DEFAULT 0,
    accountType INTEGER DEFAULT 0,
    sessionId INTEGER DEFAULT 0,
    totalMoney REAL DEFAULT 0,
    totalPrice REAL DEFAULT 0,
    orderStatus INTEGER NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    payStatus INTEGER NOT NULL DEFAULT 0,
    date INTEGER,
    time INTEGER,
    createdAt TEXT,
    approvedAt TEXT,
    employeeId INTEGER DEFAULT 1,
    staff TEXT,
    note TEXT,
    physicalDeleted INTEGER DEFAULT 0,
    needUploading INTEGER DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS OrderItemLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderLogId INTEGER NOT NULL,
    productId INTEGER NOT NULL,
    productName TEXT NOT NULL,
    amount INTEGER NOT NULL,
    unitPrice REAL NOT NULL,
    orderStatus INTEGER NOT NULL DEFAULT 0,
    payStatus INTEGER NOT NULL DEFAULT 0,
    date INTEGER NOT NULL,
    time INTEGER NOT NULL,
    orderType INTEGER DEFAULT 0,
    employeeId INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    physicalDeleted INTEGER DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  -- 6. Employees & Shifts
  CREATE TABLE IF NOT EXISTS Employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role INTEGER NOT NULL DEFAULT 0,
    phone TEXT,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS Shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emplId INTEGER NOT NULL,
    shiftTime INTEGER NOT NULL,
    startDT INTEGER NOT NULL,
    endDT INTEGER,
    startCash REAL NOT NULL DEFAULT 0.0,
    totalCashIn REAL DEFAULT 0.0,
    totalCashOut REAL DEFAULT 0.0,
    endCash REAL DEFAULT 0.0,
    status INTEGER NOT NULL DEFAULT 1
  );

  -- 7. Sessions & Transactions
  CREATE TABLE IF NOT EXISTS SessionLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER,
    workstationId INTEGER,
    accountId INTEGER,
    username TEXT,
    accountType INTEGER,
    guestDetailId INTEGER DEFAULT -1,
    priceId TEXT,
    startDate TEXT,
    startTime TEXT,
    stopDate TEXT,
    stopTime TEXT,
    minutesAvailable INTEGER DEFAULT 0,
    minutesUsed INTEGER DEFAULT 0,
    lockedMinutes INTEGER DEFAULT 0,
    timePrice REAL DEFAULT 0.0,
    realMoneyUsed REAL DEFAULT 0.0,
    freeMoneyUsed REAL DEFAULT 0.0,
    freeMinutesUsed INTEGER DEFAULT 0,
    paidMoney REAL DEFAULT 0.0,
    isOpenTime INTEGER DEFAULT 0,
    isPostPay INTEGER DEFAULT 0,
    transferInTimeFee REAL DEFAULT 0.0,
    transferInServiceFee REAL DEFAULT 0.0,
    employeeID INTEGER DEFAULT 1,
    status TEXT DEFAULT 'completed',
    note TEXT,
    staff TEXT DEFAULT 'Operator',
    physicalDeleted INTEGER DEFAULT 0,
    needUploading INTEGER DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS TransactionLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workstationId TEXT,
    accountId INTEGER,
    username TEXT,
    accountType INTEGER,
    sessionId INTEGER,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    moneyRounded REAL,
    moneyActual REAL,
    price REAL,
    minutes INTEGER DEFAULT 0,
    timeUsed TEXT DEFAULT '0m',
    servicePaid INTEGER DEFAULT 0,
    transactionType INTEGER,
    type TEXT DEFAULT 'session',
    active INTEGER DEFAULT 1,
    transNote TEXT,
    userNote TEXT,
    note TEXT,
    param1 TEXT,
    param2 TEXT,
    param3 TEXT,
    param4 TEXT,
    param5 TEXT,
    param6 TEXT,
    param7 TEXT,
    param8 TEXT,
    employeeId INTEGER DEFAULT 1,
    staff TEXT DEFAULT 'Operator',
    physicalDeleted INTEGER DEFAULT 0,
    needUploading INTEGER DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS TopupQueues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workstationId INTEGER NOT NULL,
    sessionId INTEGER NOT NULL,
    priceId INTEGER,
    money REAL NOT NULL,
    freeMoney REAL DEFAULT 0.0,
    minutes INTEGER DEFAULT 0,
    topupTime INTEGER NOT NULL,
    startTime INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  -- 8. Coupons & Prepaid Cards
  CREATE TABLE IF NOT EXISTS CouponCards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    type TEXT NOT NULL,
    name TEXT,
    detail TEXT,
    prefix TEXT,
    money REAL,
    value REAL,
    durationMinutes INTEGER DEFAULT 0,
    isUsed INTEGER DEFAULT 0,
    usedBy TEXT,
    usedAt TEXT,
    userGroupId INTEGER DEFAULT 1,
    startDate TEXT,
    createdAt TEXT,
    expiredAt TEXT,
    expireDays INTEGER DEFAULT 30,
    fillType INTEGER DEFAULT 0,
    randomTimes INTEGER DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS PrepaidCardHistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prefix TEXT UNIQUE,
    lastId INTEGER,
    lastAutoIncId INTEGER,
    lastUsed INTEGER
  );

  -- 9. Guest & System Logs
  CREATE TABLE IF NOT EXISTS GuestRecords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    nric TEXT,
    address TEXT,
    workstationId INTEGER,
    sessionId INTEGER,
    updateDT INTEGER,
    emplId INTEGER,
    sex INTEGER,
    birthday INTEGER,
    phone TEXT,
    email TEXT,
    area TEXT,
    postCode TEXT
  );

  CREATE TABLE IF NOT EXISTS GuestPricePromotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type INTEGER NOT NULL,
    priceId INTEGER NOT NULL,
    duration INTEGER,
    hourlyRate REAL,
    beginDate INTEGER,
    endDate INTEGER,
    sequence INTEGER,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  -- 10. Cafe Info & System Logs
  CREATE TABLE IF NOT EXISTS CafeContactInfo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telNumber TEXT,
    address TEXT,
    postCode TEXT,
    fax TEXT,
    email TEXT,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS SystemLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    eventTime INTEGER NOT NULL,
    eventType INTEGER NOT NULL,
    operatorId INTEGER,
    workstationId INTEGER,
    description TEXT NOT NULL,
    level INTEGER DEFAULT 0
  );

  -- Pengaturan aplikasi (kunci LAN, kredensial cloud, preferensi). Dipakai DbService.get/setSetting.
  CREATE TABLE IF NOT EXISTS AppSettings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- 11. Crucial Performance B-Tree Indexes
  CREATE INDEX IF NOT EXISTS idx_coupons_code ON CouponCards(code);
  CREATE INDEX IF NOT EXISTS idx_users_name ON Users(name);
  CREATE INDEX IF NOT EXISTS idx_tx_date_id ON TransactionLogs(date, id);
  CREATE INDEX IF NOT EXISTS idx_session_user ON SessionLogs(username);
  CREATE INDEX IF NOT EXISTS idx_order_status ON OrderLogs(status, workstationId);
`);

// Safe auto-migration helper: ensure missing columns are added to existing database files
function autoMigrateColumns() {
  const tableColumnMap: Record<string, { name: string; type: string }[]> = {
    Workstations: [
      { name: 'groupId', type: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'groupName', type: 'TEXT DEFAULT \'Area Reguler\'' },
      { name: 'status', type: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'lockStatus', type: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'currentSessionId', type: 'INTEGER DEFAULT 0' },
      { name: 'currentAccountId', type: 'INTEGER DEFAULT 0' },
      { name: 'currentAccountType', type: 'INTEGER DEFAULT 0' },
      { name: 'memo', type: 'TEXT' },
      { name: 'enabled', type: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'state', type: 'TEXT DEFAULT \'idle\'' },
      { name: 'currentUser', type: 'TEXT' },
      { name: 'billingType', type: 'TEXT' },
      { name: 'remainingSeconds', type: 'INTEGER DEFAULT 0' },
      { name: 'elapsedSeconds', type: 'INTEGER DEFAULT 0' },
      { name: 'totalSpent', type: 'REAL DEFAULT 0' },
      { name: 'pricePerHour', type: 'REAL DEFAULT 4000' },
      { name: 'sessionPricePerHour', type: 'REAL' },
      { name: 'packageName', type: 'TEXT' },
      { name: 'lastSeen', type: 'INTEGER' }
    ],
    ChargingRates: [
      { name: 'isPeriodic', type: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'minimalTime', type: 'INTEGER DEFAULT 0' },
      { name: 'minimalRechargePeriod', type: 'INTEGER DEFAULT 0' },
      { name: 'minimalRechargeAmount', type: 'INTEGER DEFAULT 0' },
      { name: 'internetOption', type: 'INTEGER DEFAULT 0' },
      { name: 'enabled', type: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'needUploading', type: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'pricePerHour', type: 'REAL NOT NULL DEFAULT 4000' },
      { name: 'nextHoursPrice', type: 'REAL DEFAULT 3500' },
      { name: 'accumulationStep', type: 'TEXT DEFAULT \'30m\'' },
      { name: 'minimumCharge', type: 'REAL DEFAULT 0' },
      { name: 'roundingMinutes', type: 'INTEGER DEFAULT 1' },
      { name: 'gracePeriodMinutes', type: 'INTEGER DEFAULT 0' },
      { name: 'targetUserType', type: 'TEXT DEFAULT \'all\'' },
      { name: 'description', type: 'TEXT' },
      { name: 'isDefault', type: 'INTEGER DEFAULT 0' },
    ],
    Users: [
      { name: 'pwdHashType', type: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'freeMoney', type: 'REAL NOT NULL DEFAULT 0.0' },
      { name: 'points', type: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'lastLoginDT', type: 'INTEGER DEFAULT 0' },
      { name: 'lastLogoutDT', type: 'INTEGER DEFAULT 0' },
      { name: 'mobilePhone', type: 'TEXT' },
      { name: 'nric', type: 'TEXT' },
      { name: 'address', type: 'TEXT' },
      { name: 'couponType', type: 'INTEGER DEFAULT 0' },
      { name: 'logRecorded', type: 'INTEGER DEFAULT 1' },
      { name: 'enabled', type: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'firstName', type: 'TEXT DEFAULT \'\'' },
      { name: 'lastName', type: 'TEXT DEFAULT \'\'' },
      { name: 'phone', type: 'TEXT DEFAULT \'\'' },
      { name: 'groupName', type: 'TEXT DEFAULT \'Reguler\'' },
      { name: 'status', type: 'TEXT DEFAULT \'Normal\'' },
      { name: 'createdAt', type: 'TEXT' },
      { name: 'expiredAt', type: 'TEXT' }
    ],
    PricePackagesFixed: [
      { name: 'durationMinutes', type: 'INTEGER DEFAULT 60' },
      { name: 'price', type: 'REAL DEFAULT 0' },
      { name: 'startTime', type: 'TEXT' },
      { name: 'allowedGroupsJson', type: 'TEXT DEFAULT \'["Reguler", "VIP"]\'' },
      { name: 'badge', type: 'TEXT' },
      { name: 'isEnabled', type: 'INTEGER DEFAULT 1' }
    ],
    SessionLogs: [
      { name: 'guestDetailId', type: 'INTEGER DEFAULT -1' },
      { name: 'lockedMinutes', type: 'INTEGER DEFAULT 0' },
      { name: 'freeMoneyUsed', type: 'REAL DEFAULT 0.0' },
      { name: 'freeMinutesUsed', type: 'INTEGER DEFAULT 0' },
      { name: 'transferInTimeFee', type: 'REAL DEFAULT 0.0' },
      { name: 'transferInServiceFee', type: 'REAL DEFAULT 0.0' },
      { name: 'employeeID', type: 'INTEGER DEFAULT 1' },
      { name: 'staff', type: 'TEXT DEFAULT \'Operator\'' },
      { name: 'physicalDeleted', type: 'INTEGER DEFAULT 0' },
      { name: 'needUploading', type: 'INTEGER DEFAULT 1' },
      { name: 'enabled', type: 'INTEGER NOT NULL DEFAULT 1' }
    ],
    TransactionLogs: [
      { name: 'moneyRounded', type: 'REAL' },
      { name: 'moneyActual', type: 'REAL' },
      { name: 'servicePaid', type: 'INTEGER DEFAULT 0' },
      { name: 'transactionType', type: 'INTEGER' },
      { name: 'active', type: 'INTEGER DEFAULT 1' },
      { name: 'transNote', type: 'TEXT' },
      { name: 'userNote', type: 'TEXT' },
      { name: 'param1', type: 'TEXT' },
      { name: 'param2', type: 'TEXT' },
      { name: 'param3', type: 'TEXT' },
      { name: 'param4', type: 'TEXT' },
      { name: 'param5', type: 'TEXT' },
      { name: 'param6', type: 'TEXT' },
      { name: 'param7', type: 'TEXT' },
      { name: 'param8', type: 'TEXT' },
      { name: 'employeeId', type: 'INTEGER DEFAULT 1' },
      { name: 'staff', type: 'TEXT DEFAULT \'Operator\'' },
      { name: 'physicalDeleted', type: 'INTEGER DEFAULT 0' },
      { name: 'needUploading', type: 'INTEGER DEFAULT 1' },
      { name: 'enabled', type: 'INTEGER NOT NULL DEFAULT 1' }
    ],
    CouponCards: [
      { name: 'name', type: 'TEXT' },
      { name: 'detail', type: 'TEXT' },
      { name: 'prefix', type: 'TEXT' },
      { name: 'money', type: 'REAL' },
      { name: 'userGroupId', type: 'INTEGER DEFAULT 1' },
      { name: 'startDate', type: 'TEXT' },
      { name: 'expireDays', type: 'INTEGER DEFAULT 30' },
      { name: 'fillType', type: 'INTEGER DEFAULT 0' },
      { name: 'randomTimes', type: 'INTEGER DEFAULT 0' },
      { name: 'enabled', type: 'INTEGER NOT NULL DEFAULT 1' }
    ]
  };

  for (const [table, cols] of Object.entries(tableColumnMap)) {
    try {
      const existing = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      const existingNames = new Set(existing.map(c => c.name.toLowerCase()));
      for (const col of cols) {
        if (!existingNames.has(col.name.toLowerCase())) {
          sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    } catch {}
  }
}

autoMigrateColumns();

console.log(`[DB] Berhasil terkoneksi ke: ${DB_PATH} dan 22 tabel GC-Hub dipastikan ada.`);
