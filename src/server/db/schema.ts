import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

// ====================================================================
// GC-HUB AUTHORITATIVE DRIZZLE SQLITE SCHEMA
// ====================================================================

// 1. Users (Member & Accounts)
export const users = sqliteTable('Users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  passwordHash: text('passwordHash').notNull().default(''),
  pwdHashType: integer('pwdHashType').notNull().default(1),
  groupId: integer('groupId').notNull().default(1),
  money: real('money').notNull().default(0.0),
  usedAmount: real('usedAmount').notNull().default(0.0),
  freeMoney: real('freeMoney').notNull().default(0.0),
  freeMinutes: integer('freeMinutes').notNull().default(0),
  points: integer('points').notNull().default(0),
  loginTime: integer('loginTime').default(0),
  expiredIn: integer('expiredIn').default(0),
  dueDate: integer('dueDate').default(0),
  lastLoginDT: integer('lastLoginDT').default(0),
  lastLogoutDT: integer('lastLogoutDT').default(0),
  mobilePhone: text('mobilePhone'),
  email: text('email'),
  nric: text('nric'),
  address: text('address'),
  couponType: integer('couponType').default(0),
  logRecorded: integer('logRecorded').default(1),
  enabled: integer('enabled').notNull().default(1),
  // UI helpers
  firstName: text('firstName').default(''),
  lastName: text('lastName').default(''),
  phone: text('phone').default(''),
  groupName: text('groupName').default('Reguler'),
  status: text('status').default('Normal'),
  createdAt: text('createdAt'),
  expiredAt: text('expiredAt')
});

// 2. UserGroups (Kelompok Member)
export const userGroups = sqliteTable('UserGroups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  rateId: integer('rateId').notNull().default(1),
  discountRateId: integer('discountRateId').default(0),
  checkoutRounding: integer('checkoutRounding').default(0),
  pointsMultiplier: real('pointsMultiplier').default(1.0),
  enabled: integer('enabled').notNull().default(1),
  needUploading: integer('needUploading').notNull().default(1),
  // UI helpers
  discountPercent: real('discountPercent').default(0),
  isDefault: integer('isDefault').default(0)
});

// 3. WorkstationGroups (Kelompok Bilik PC / Zona)
export const workstationGroups = sqliteTable('WorkstationGroups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  enabled: integer('enabled').notNull().default(1)
});

// 4. Workstations (Bilik PC Klien)
export const workstations = sqliteTable('Workstations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pcId: text('pcId').unique(),
  name: text('name').notNull(),
  ip: text('ip'),
  mac: text('mac').default('00:00:00:00:00:00'),
  groupId: integer('groupId').notNull().default(1),
  groupName: text('groupName').default('Area Reguler'),
  status: integer('status').notNull().default(0), // 0: AVAILABLE, 1: ONLINE, 2: SUSPENDED, 3: DISCONNECTED
  lockStatus: integer('lockStatus').notNull().default(1),
  currentSessionId: integer('currentSessionId').default(0),
  currentAccountId: integer('currentAccountId').default(0),
  currentAccountType: integer('currentAccountType').default(0),
  memo: text('memo'),
  enabled: integer('enabled').notNull().default(1),
  // Runtime State helpers
  state: text('state').default('idle'),
  currentUser: text('currentUser'),
  billingType: text('billingType'),
  remainingSeconds: integer('remainingSeconds').default(0),
  elapsedSeconds: integer('elapsedSeconds').default(0),
  totalSpent: real('totalSpent').default(0),
  // Member rate of this PC (saldo x tarif). Set when the PC is added; sessions never write it.
  pricePerHour: real('pricePerHour').default(4000),
  // Rate of the running session, kept only so a restart can recover it
  sessionPricePerHour: real('sessionPricePerHour'),
  packageName: text('packageName'),
  lastSeen: integer('lastSeen')
});

// 5. PcGridLayoutsCustom (Tata Letak Denah Bilik PC Kasir)
export const pcGridLayoutsCustom = sqliteTable('PcGridLayoutsCustom', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workstationId: integer('workstationId').notNull(),
  row: integer('row').notNull(),
  column: integer('column').notNull(),
  enabled: integer('enabled').notNull().default(1)
});

// 6. ChargingRates (Skema Tarif Argo & Personal)
export const chargingRates = sqliteTable('ChargingRates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  isPeriodic: integer('isPeriodic').notNull().default(0),
  minimalTime: integer('minimalTime').default(0),
  minimalRechargePeriod: integer('minimalRechargePeriod').default(0),
  minimalRechargeAmount: integer('minimalRechargeAmount').default(0),
  internetOption: integer('internetOption').default(0),
  enabled: integer('enabled').notNull().default(1),
  needUploading: integer('needUploading').notNull().default(1),
  // Pricing helpers & explicit persistence
  pricePerHour: real('pricePerHour').notNull().default(4000),
  nextHoursPrice: real('nextHoursPrice').default(3500),
  accumulationStep: text('accumulationStep').default('30m'),
  minimumCharge: real('minimumCharge').default(0),
  roundingMinutes: integer('roundingMinutes').default(1),
  gracePeriodMinutes: integer('gracePeriodMinutes').default(0),
  targetUserType: text('targetUserType').default('all'),
  description: text('description'),
  isDefault: integer('isDefault').default(0)
});

// 7. PeriodicDiscounts (Diskon Periodik Waktu Tertentu)
export const periodicDiscounts = sqliteTable('PeriodicDiscounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  rateId: integer('rateId').notNull(),
  discountRateId: integer('discountRateId').notNull(),
  startTime: integer('startTime').notNull(),
  endTime: integer('endTime').notNull(),
  weekdays: integer('weekdays').notNull().default(127),
  enabled: integer('enabled').notNull().default(1),
  needUploading: integer('needUploading').notNull().default(1)
});

// 8. RateStructures (Hubungan Tarif Grup User x Grup Workstation)
export const rateStructures = sqliteTable('RateStructures', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userGroupId: integer('userGroupId').notNull(),
  wsGroupId: integer('wsGroupId').notNull(),
  rateId: integer('rateId').notNull(),
  enabled: integer('enabled').notNull().default(1),
  needUploading: integer('needUploading').notNull().default(1)
});

// 9. PricePackagesFixed (Katalog Paket Warnet / Paket Malam)
export const pricePackagesFixed = sqliteTable('PricePackagesFixed', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  minutes: integer('minutes').notNull().default(60),
  durationMinutes: integer('durationMinutes').default(60),
  money: real('money').notNull().default(0),
  price: real('price').default(0),
  type: text('type').notNull().default('0'), // 0: Fixed Time, 1: Night Package / 'hourly' | 'night'
  endType: integer('endType').notNull().default(0),
  beginTime: integer('beginTime').default(0),
  endTime: text('endTime'), // 'HH:MM' (kolom lama bertipe INTEGER, SQLite tetap menyimpan teks)
  startTime: text('startTime'),
  dayOfWeek: integer('dayOfWeek').default(127),
  allowedUserGroups: text('allowedUserGroups'),
  allowedGroupsJson: text('allowedGroupsJson').default('["Reguler", "VIP"]'),
  badge: text('badge'),
  isEnabled: integer('isEnabled').default(1),
  enabled: integer('enabled').notNull().default(1)
});

// 10. PrepayShortcuts (Tombol Cepat Durasi Kasir)
export const prepayShortcuts = sqliteTable('PrepayShortcuts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  description: text('description').notNull(),
  minutes: integer('minutes').notNull(),
  visible: integer('visible').notNull().default(1),
  enabled: integer('enabled').notNull().default(1),
  needUploading: integer('needUploading').notNull().default(1)
});

// 11. ProductCategories (Kategori F&B / POS)
export const productCategories = sqliteTable('ProductCategories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  enabled: integer('enabled').notNull().default(1)
});

// 12. OrderItems (Katalog Produk F&B / Barang POS)
export const orderItems = sqliteTable('OrderItems', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  categoryId: integer('categoryId').notNull().default(1),
  name: text('name').notNull(),
  barcode: text('barcode'),
  unitPrice: real('unitPrice').notNull(),
  costPrice: real('costPrice').default(0.0),
  stock: integer('stock').notNull().default(0),
  alertStock: integer('alertStock').default(5),
  unitName: text('unitName').default('pcs'),
  enabled: integer('enabled').notNull().default(1)
});

// 13. OrderLogs (Pesanan POS Kasir / Klien)
export const orderLogs = sqliteTable('OrderLogs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderCode: text('orderCode'),
  workstationId: integer('workstationId'),
  pcId: text('pcId'),
  pcName: text('pcName'),
  username: text('username'),
  itemsJson: text('itemsJson'),
  accountId: integer('accountId').default(0),
  accountType: integer('accountType').default(0),
  sessionId: integer('sessionId').default(0),
  totalMoney: real('totalMoney').default(0),
  totalPrice: real('totalPrice').default(0),
  orderStatus: integer('orderStatus').notNull().default(0), // 0: Pending, 1: Approved/Delivered, 2: Rejected, 3: Cancelled
  status: text('status').default('pending'),
  payStatus: integer('payStatus').notNull().default(0),   // 0: Unpaid, 1: Paid Cash, 2: Deducted From Session Balance
  date: integer('date'),
  time: integer('time'),
  createdAt: text('createdAt'),
  approvedAt: text('approvedAt'),
  employeeId: integer('employeeId').default(1),
  staff: text('staff'),
  note: text('note'),
  physicalDeleted: integer('physicalDeleted').default(0),
  needUploading: integer('needUploading').default(1),
  enabled: integer('enabled').notNull().default(1)
});

// 14. OrderItemLogs (Detail Rincian Item Pesanan)
export const orderItemLogs = sqliteTable('OrderItemLogs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderLogId: integer('orderLogId').notNull(),
  productId: integer('productId').notNull(),
  productName: text('productName').notNull(),
  amount: integer('amount').notNull(),
  unitPrice: real('unitPrice').notNull(),
  orderStatus: integer('orderStatus').notNull().default(0),
  payStatus: integer('payStatus').notNull().default(0),
  date: integer('date').notNull(),
  time: integer('time').notNull(),
  orderType: integer('orderType').default(0),
  employeeId: integer('employeeId').notNull().default(1),
  note: text('note'),
  physicalDeleted: integer('physicalDeleted').default(0),
  enabled: integer('enabled').notNull().default(1),
  costPrice: real('costPrice'),
  soldAt: integer('soldAt')
});

// 15. Employees (Operator & Staff Kasir)
export const employees = sqliteTable('Employees', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  role: integer('role').notNull().default(0), // 0: Kasir, 1: Manager, 2: Admin
  phone: text('phone'),
  enabled: integer('enabled').notNull().default(1)
});

// 16. Shifts (Rekap Shift Kasir)
export const shifts = sqliteTable('Shifts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  emplId: integer('emplId').notNull(),
  shiftTime: integer('shiftTime').notNull(),
  startDT: integer('startDT').notNull(),
  endDT: integer('endDT'),
  startCash: real('startCash').notNull().default(0.0),
  totalCashIn: real('totalCashIn').default(0.0),
  totalCashOut: real('totalCashOut').default(0.0),
  endCash: real('endCash').default(0.0),
  status: integer('status').notNull().default(1) // 1: Open, 0: Closed
});

// 17. SessionLogs (Riwayat Sesi Billing)
export const sessionLogs = sqliteTable('SessionLogs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('sessionId'),
  workstationId: integer('workstationId'),
  accountId: integer('accountId'),
  username: text('username'),
  accountType: integer('accountType'), // 0: Guest Prepaid, 1: Member, 2: Postpaid
  guestDetailId: integer('guestDetailId').default(-1),
  priceId: text('priceId'),
  startDate: text('startDate'),
  startTime: text('startTime'),
  stopDate: text('stopDate'),
  stopTime: text('stopTime'),
  minutesAvailable: integer('minutesAvailable').default(0),
  minutesUsed: integer('minutesUsed').default(0),
  lockedMinutes: integer('lockedMinutes').default(0),
  timePrice: real('timePrice').default(0.0),
  realMoneyUsed: real('realMoneyUsed').default(0.0),
  freeMoneyUsed: real('freeMoneyUsed').default(0.0),
  freeMinutesUsed: integer('freeMinutesUsed').default(0),
  paidMoney: real('paidMoney').default(0.0),
  isOpenTime: integer('isOpenTime').default(0),
  isPostPay: integer('isPostPay').default(0),
  transferInTimeFee: real('transferInTimeFee').default(0.0),
  transferInServiceFee: real('transferInServiceFee').default(0.0),
  employeeID: integer('employeeID').default(1),
  status: text('status').default('completed'), // 'active' | 'completed' | 'terminated'
  note: text('note'),
  staff: text('staff').default('Operator'),
  physicalDeleted: integer('physicalDeleted').default(0),
  needUploading: integer('needUploading').default(1),
  enabled: integer('enabled').notNull().default(1)
});

// 18. TransactionLogs (Jurnal Keuangan & Mutasi Kas)
export const transactionLogs = sqliteTable('TransactionLogs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workstationId: text('workstationId'),
  accountId: integer('accountId'),
  username: text('username'),
  accountType: integer('accountType'),
  sessionId: integer('sessionId'),
  date: text('date').notNull(),
  time: text('time').notNull(),
  moneyRounded: real('moneyRounded'),
  moneyActual: real('moneyActual'),
  price: real('price'),
  minutes: integer('minutes').default(0),
  timeUsed: text('timeUsed').default('0m'),
  servicePaid: integer('servicePaid').default(0),
  transactionType: integer('transactionType'),
  type: text('type').default('session'), // 'session' | 'topup' | 'pos' | 'package' | 'refund'
  active: integer('active').default(1),
  transNote: text('transNote'),
  userNote: text('userNote'),
  note: text('note'),
  param1: text('param1'),
  param2: text('param2'),
  param3: text('param3'),
  param4: text('param4'),
  param5: text('param5'),
  param6: text('param6'),
  param7: text('param7'),
  param8: text('param8'),
  employeeId: integer('employeeId').default(1),
  staff: text('staff').default('Operator'),
  physicalDeleted: integer('physicalDeleted').default(0),
  needUploading: integer('needUploading').default(1),
  enabled: integer('enabled').notNull().default(1)
});

// 19. TopupQueues (Antrian Top Up / Tambah Sesi)
export const topupQueues = sqliteTable('TopupQueues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workstationId: integer('workstationId').notNull(),
  sessionId: integer('sessionId').notNull(),
  priceId: integer('priceId'),
  money: real('money').notNull(),
  freeMoney: real('freeMoney').default(0.0),
  minutes: integer('minutes').default(0),
  topupTime: integer('topupTime').notNull(),
  startTime: integer('startTime').notNull(),
  enabled: integer('enabled').notNull().default(1)
});

// 20. CouponCards (Kupon / Voucher Prepaid)
export const couponCards = sqliteTable('CouponCards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').unique(),
  type: text('type').notNull(), // 'time' | 'money'
  name: text('name'),
  detail: text('detail'),
  prefix: text('prefix'),
  money: real('money'),
  value: real('value'),
  durationMinutes: integer('durationMinutes').default(0),
  isUsed: integer('isUsed').default(0),
  usedBy: text('usedBy'),
  usedAt: text('usedAt'),
  userGroupId: integer('userGroupId').default(1),
  startDate: text('startDate'),
  createdAt: text('createdAt'),
  expiredAt: text('expiredAt'),
  expireDays: integer('expireDays').default(30),
  fillType: integer('fillType').default(0),
  randomTimes: integer('randomTimes').default(0),
  enabled: integer('enabled').notNull().default(1)
});

// 21. PrepaidCardHistory (Riwayat Serial Generator Voucher)
export const prepaidCardHistory = sqliteTable('PrepaidCardHistory', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  prefix: text('prefix').unique(),
  lastId: integer('lastId'),
  lastAutoIncId: integer('lastAutoIncId'),
  lastUsed: integer('lastUsed')
});

// 22. GuestRecords (Data Tamu & Identitas KTP / NRIC)
export const guestRecords = sqliteTable('GuestRecords', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('Name'),
  nric: text('NRIC'),
  address: text('Address'),
  workstationId: integer('WorkstationId'),
  sessionId: integer('SessionId'),
  updateDT: integer('UpdateDT'),
  emplId: integer('EmplId'),
  sex: integer('Sex'),
  birthday: integer('Birthday'),
  phone: text('Phone'),
  email: text('Email'),
  area: text('Area'),
  postCode: text('PostCode')
});

// 23. GuestPricePromotions (Promosi Tarif Khusus Tamu)
export const guestPricePromotions = sqliteTable('GuestPricePromotions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: integer('type').notNull(),
  priceId: integer('priceId').notNull(),
  duration: integer('duration'),
  hourlyRate: real('hourlyRate'),
  beginDate: integer('beginDate'),
  endDate: integer('endDate'),
  sequence: integer('sequence'),
  enabled: integer('enabled').notNull().default(1)
});

// 24. CafeContactInfo (Informasi Profil Warnet & Kontak)
export const cafeContactInfo = sqliteTable('CafeContactInfo', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telNumber: text('telNumber'),
  address: text('address'),
  postCode: text('postCode'),
  fax: text('fax'),
  email: text('email'),
  enabled: integer('enabled').notNull().default(1)
});

// 25. SystemLogs (Audit Trail & Log Peristiwa Server)
export const systemLogs = sqliteTable('SystemLogs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventTime: integer('eventTime').notNull(),
  eventType: integer('eventType').notNull(),
  operatorId: integer('operatorId'),
  workstationId: integer('workstationId'),
  description: text('description').notNull(),
  level: integer('level').default(0)
});

// 26. AppSettings (Konfigurasi Aplikasi & Cloud)
export const appSettings = sqliteTable('AppSettings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
});

// ====================================================================
// BACKWARD COMPATIBILITY ALIASES
// ====================================================================
export const userAccounts = users;
export const billingPackages = pricePackagesFixed;
export const recentTransactionLogs = transactionLogs;
export const orders = orderLogs;
export const coupons = couponCards;
