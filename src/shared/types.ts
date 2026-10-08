import type { ExeMode } from './exePolicy';

export type WorkstationState ='offline' | 'idle' | 'in_use' | 'active_member' | 'active_guest' | 'locked' | 'unpaid' | 'suspended';

export interface PersonalRateConfig {
  id: string;
  name: string;
  firstHourPrice: number;       // Harga jam pertama (Rp)
  nextHoursPrice: number;       // Harga jam ke-2 dan seterusnya (Rp)
  accumulationMinutes: number;  // Panjang blok tagihan setelah jam pertama (1-60 menit), tiap blok yang dimulai ditagih penuh
  targetUserType: 'all' | 'member' | 'guest'; // Hak akses tarif
  description?: string;
}

export interface BillingPackage {
  id: string;
  name: string;
  time: string;
  minutes: number;
  price: number;
  popular?: boolean;
  category?: 'Jam' | 'Nominal' | 'Happy Hour' | 'Tambah Waktu' | 'Custom';
  isExtensionOnly?: boolean; // Jika true, hanya bisa untuk tambah waktu (tidak bisa start session baru)
  happyHourStart?: string; // Misal '22:00' atau '06:00'
  happyHourEnd?: string;   // Misal '06:00' atau '12:00'
  targetUserType?: 'all' | 'member' | 'guest';
  description?: string;
}

export interface StackedPackageItem {
  id: string;
  name: string;
  minutes: number;
  minutesFormatted: string;
  price: number;
  purchasedAt: string;
  expiredAt: string;
  status: 'In Use' | 'Not Used' | 'Used';
}

export interface Workstation {
  id: number;
  pcId?: string;
  name: string;
  ip: string;
  mac: string;
  state: WorkstationState;
  username?: string;
  firstName?: string;
  lastName?: string;
  userType?: 'member' | 'guest' | 'admin';
  timeUsedMinutes: number;
  timeRemainingMinutes?: number;
  remainingSeconds?: number;
  moneyUsed: number;
  groupName: string;
  pricePerHour?: number;
  // Rate of the running or unpaid session; pricePerHour is the PC's own member rate
  sessionPricePerHour?: number;
  packageName?: string;
  packageTime?: string;
  packagePrice?: number;
  stackedPackages?: StackedPackageItem[];
  activeApp?: string;
  kioskEnabled?: boolean; // from client telemetry; undefined = gc-agent missing or no report yet
  exeMode?: ExeMode;      // exe allowlist mode stored on the booth, from client telemetry
  exeOverride?: ExeMode;  // per-PC mode set on the server; undefined = follows the default
  hasPendingOrder?: boolean;
  pendingOrderSummary?: string;
  isUnpaid?: boolean;
  unpaidAmount?: number;
  startTime?: string;
  memo?: string;
  historyEvents?: string[];
  volume?: number;
  isMuted?: boolean;
  isDisconnected?: boolean;
  billingType?: 'prepaid' | 'postpaid' | 'opentime' | 'package' | 'member'; // same values as SessionBillingType
  sessionStartedAt?: number;                        // epoch ms
  personalBill?: { total: number; nextTotal: number; secondsToNext: number }; // postpaid only
  personalRate?: { firstHourPrice: number; nextHoursPrice: number; accumulationMinutes: number; name?: string };
  pendingOrderCount?: number;
}

export interface MemberAccount {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  money: number;
  groupName: string;
  status: 'Normal' | 'Terkunci' | 'Expired';
  createdAt: string;
  expiredAt: string;
  freeMinutes?: number;
  phone?: string;
  email?: string;
  address?: string;
  birthDate?: string;
  canOrder?: boolean;
}

export interface CouponAccount {
  id: number;
  code: string;
  type?: 'time' | 'money';
  name?: string;
  detail?: string;
  prefix?: string;
  packageName?: string;
  price?: number;
  money?: number;
  value?: number;
  durationMinutes?: number;
  userGroupId?: number;
  groupName: string;
  status: 'Tersedia' | 'Terpakai' | 'Expired';
  isUsed?: boolean;
  createdAt: string;
  expiredAt?: string;
  expireDays?: number;
  usedBy?: string;
  usedAt?: string;
}

export interface VoucherBatchGenerateParams {
  count: number;
  type: 'time' | 'money';
  value: number;
  durationMinutes?: number;
  prefix?: string;
  userGroupId?: number;
  expireDays?: number;
  expiredAt?: string;
  staff?: string;
}

export interface ShiftRecord {
  id: number;
  emplId: number;
  employeeName: string;
  shiftTime: number; // 1: Pagi, 2: Siang, 3: Malam
  shiftTimeLabel?: string;
  startDT: number;
  startDateFormatted: string;
  endDT?: number | null;
  endDateFormatted?: string | null;
  startCash: number;
  totalCashIn: number;
  totalCashOut: number;
  endCash: number;
  expectedCash: number;
  variance: number;
  status: number; // 1: Open, 0: Closed
  statusText: 'Open' | 'Closed';
  note?: string;
}

export interface ShiftAuditSummary {
  currentShift: ShiftRecord;
  billingCash: number;
  posCash: number;
  topupCash: number;
  totalCashIn: number;
  totalCashOut: number;
  expectedEndCash: number;
  unsettledUnpaidCount: number;
  pendingOrdersCount: number;
}

export interface ShiftHandoverParams {
  shiftId: number;
  incomingOperator: string;
  incomingPassword?: string;
  actualEndCash: number;
  note?: string;
  staff?: string;
}

export interface ShiftHandoverResult {
  success: boolean;
  message: string;
  closedShift?: ShiftRecord;
  newShift?: ShiftRecord;
  variance?: number;
  operator?: { id: number; name: string; role: number }; // verified incoming operator
}

export interface TransactionRecord {
  id: number;
  username: string;
  date: string;
  time: string;
  price: number;
  timeUsed: string;
  staff: string;
  note: string;
}

/** One row of SystemLogs as the Log screen shows it. */
export interface SystemLogEntry {
  id: number;
  eventTime: number; // epoch ms
  eventType: number;
  description: string;
  level: 0 | 1 | 2;  // info, important, error
}

export interface FbOrderItem {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  orderedAmount?: number;
}

export interface FnbMarginItem {
  name: string;
  qty: number;
  costedRevenue: number;   // sales of units whose cost was known
  cost: number;
  profit: number;          // costedRevenue - cost
  uncostedRevenue: number; // sales of units sold before a cost was entered
  uncostedQty: number;
}

export interface FnbMargin {
  items: FnbMarginItem[];
  costedRevenue: number;
  cost: number;
  profit: number;
  uncostedRevenue: number;
  uncostedQty: number;
}

export interface ProductItem {
  id: number;
  categoryId: number;
  categoryName?: string;
  name: string;
  barcode?: string;
  unitPrice: number;
  costPrice?: number;
  stock: number;
  alertStock: number;
  unitName: string;
  enabled: boolean;
}

export interface ProductCategoryItem {
  id: number;
  name: string;
  enabled: boolean;
}

export interface InventorySummary {
  totalItems: number;
  totalStockUnits: number;
  totalCostValuation: number;
  totalRetailValuation: number;
  lowStockCount: number;
}

export interface StockAdjustmentParams {
  productId: number;
  changeAmount: number;
  mode: 'add' | 'subtract' | 'set';
  reason?: string;
  staff?: string;
}

export interface OrderItemDetail {
  id?: number;
  productId: number;
  name: string;
  amount: number;
  unitPrice: number;
  totalPrice: number;
}

export interface OrderRecord {
  id: number;
  orderCode: string;
  workstationId?: number;
  pcId: string;
  pcName: string;
  username: string;
  items: OrderItemDetail[];
  totalPrice: number;
  orderStatus: number; // 0: Pending, 1: Approved, 2: Rejected, 3: Cancelled
  statusText: string;
  payStatus: number;   // 0: Unpaid/Tab, 1: Cash, 2: Saldo
  payMethodText?: string;
  createdAt: string;
  approvedAt?: string;
  staff?: string;
  note?: string;
}

export type EmployeeRole = 0 | 1 | 2; // 0: Kasir, 1: Manager, 2: Admin

export interface EmployeeAccount {
  id: number;
  name: string;
  role: EmployeeRole;
  roleText?: string;
  phone?: string;
  enabled: boolean;
}

export interface EmployeeLoginResult {
  success: boolean;
  message: string;
  employee?: {
    id: number;
    name: string;
    role: number;
    roleText?: string;
    phone?: string;
  };
}



