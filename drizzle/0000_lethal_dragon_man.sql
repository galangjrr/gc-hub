CREATE TABLE `PricePackagesFixed` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`minutes` integer DEFAULT 60 NOT NULL,
	`durationMinutes` integer DEFAULT 60,
	`money` real DEFAULT 0 NOT NULL,
	`price` real DEFAULT 0,
	`type` text DEFAULT '0' NOT NULL,
	`endType` integer DEFAULT 0 NOT NULL,
	`beginTime` integer DEFAULT 0,
	`endTime` integer DEFAULT 0,
	`startTime` text,
	`dayOfWeek` integer DEFAULT 127,
	`allowedUserGroups` text,
	`allowedGroupsJson` text DEFAULT '["Reguler", "VIP"]',
	`badge` text,
	`isEnabled` integer DEFAULT 1,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `CafeContactInfo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`telNumber` text,
	`address` text,
	`postCode` text,
	`fax` text,
	`email` text,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ChargingRates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`isPeriodic` integer DEFAULT 0 NOT NULL,
	`minimalTime` integer DEFAULT 0,
	`minimalRechargePeriod` integer DEFAULT 0,
	`minimalRechargeAmount` integer DEFAULT 0,
	`internetOption` integer DEFAULT 0,
	`enabled` integer DEFAULT 1 NOT NULL,
	`needUploading` integer DEFAULT 1 NOT NULL,
	`pricePerHour` real DEFAULT 4000 NOT NULL,
	`minimumCharge` real DEFAULT 0,
	`roundingMinutes` integer DEFAULT 1,
	`gracePeriodMinutes` integer DEFAULT 0,
	`isDefault` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `CouponCards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text,
	`type` text NOT NULL,
	`name` text,
	`detail` text,
	`prefix` text,
	`money` real,
	`value` real,
	`durationMinutes` integer DEFAULT 0,
	`isUsed` integer DEFAULT 0,
	`usedBy` text,
	`usedAt` text,
	`userGroupId` integer DEFAULT 1,
	`startDate` text,
	`createdAt` text,
	`expiredAt` text,
	`expireDays` integer DEFAULT 30,
	`fillType` integer DEFAULT 0,
	`randomTimes` integer DEFAULT 0,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `CouponCards_code_unique` ON `CouponCards` (`code`);--> statement-breakpoint
CREATE TABLE `Employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`passwordHash` text NOT NULL,
	`role` integer DEFAULT 0 NOT NULL,
	`phone` text,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Employees_name_unique` ON `Employees` (`name`);--> statement-breakpoint
CREATE TABLE `GuestPricePromotions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` integer NOT NULL,
	`priceId` integer NOT NULL,
	`duration` integer,
	`hourlyRate` real,
	`beginDate` integer,
	`endDate` integer,
	`sequence` integer,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `GuestRecords` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`Name` text,
	`NRIC` text,
	`Address` text,
	`WorkstationId` integer,
	`SessionId` integer,
	`UpdateDT` integer,
	`EmplId` integer,
	`Sex` integer,
	`Birthday` integer,
	`Phone` text,
	`Email` text,
	`Area` text,
	`PostCode` text
);
--> statement-breakpoint
CREATE TABLE `OrderItemLogs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orderLogId` integer NOT NULL,
	`productId` integer NOT NULL,
	`productName` text NOT NULL,
	`amount` integer NOT NULL,
	`unitPrice` real NOT NULL,
	`orderStatus` integer DEFAULT 0 NOT NULL,
	`payStatus` integer DEFAULT 0 NOT NULL,
	`date` integer NOT NULL,
	`time` integer NOT NULL,
	`orderType` integer DEFAULT 0,
	`employeeId` integer DEFAULT 1 NOT NULL,
	`note` text,
	`physicalDeleted` integer DEFAULT 0,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `OrderItems` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`categoryId` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`barcode` text,
	`unitPrice` real NOT NULL,
	`costPrice` real DEFAULT 0,
	`stock` integer DEFAULT 0 NOT NULL,
	`alertStock` integer DEFAULT 5,
	`unitName` text DEFAULT 'pcs',
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `OrderLogs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orderCode` text,
	`workstationId` integer,
	`pcId` text,
	`pcName` text,
	`username` text,
	`itemsJson` text,
	`accountId` integer DEFAULT 0,
	`accountType` integer DEFAULT 0,
	`sessionId` integer DEFAULT 0,
	`totalMoney` real DEFAULT 0,
	`totalPrice` real DEFAULT 0,
	`orderStatus` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending',
	`payStatus` integer DEFAULT 0 NOT NULL,
	`date` integer,
	`time` integer,
	`createdAt` text,
	`approvedAt` text,
	`employeeId` integer DEFAULT 1,
	`staff` text,
	`note` text,
	`physicalDeleted` integer DEFAULT 0,
	`needUploading` integer DEFAULT 1,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `PcGridLayoutsCustom` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workstationId` integer NOT NULL,
	`row` integer NOT NULL,
	`column` integer NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `PeriodicDiscounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rateId` integer NOT NULL,
	`discountRateId` integer NOT NULL,
	`startTime` integer NOT NULL,
	`endTime` integer NOT NULL,
	`weekdays` integer DEFAULT 127 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`needUploading` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `PrepaidCardHistory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prefix` text,
	`lastId` integer,
	`lastAutoIncId` integer,
	`lastUsed` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `PrepaidCardHistory_prefix_unique` ON `PrepaidCardHistory` (`prefix`);--> statement-breakpoint
CREATE TABLE `PrepayShortcuts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`description` text NOT NULL,
	`minutes` integer NOT NULL,
	`visible` integer DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`needUploading` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ProductCategories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `RateStructures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userGroupId` integer NOT NULL,
	`wsGroupId` integer NOT NULL,
	`rateId` integer NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`needUploading` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `TransactionLogs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workstationId` text,
	`accountId` integer,
	`username` text,
	`accountType` integer,
	`sessionId` integer,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`moneyRounded` real,
	`moneyActual` real,
	`price` real,
	`minutes` integer DEFAULT 0,
	`timeUsed` text DEFAULT '0m',
	`servicePaid` integer DEFAULT 0,
	`transactionType` integer,
	`type` text DEFAULT 'session',
	`active` integer DEFAULT 1,
	`transNote` text,
	`userNote` text,
	`note` text,
	`param1` text,
	`param2` text,
	`param3` text,
	`param4` text,
	`param5` text,
	`param6` text,
	`param7` text,
	`param8` text,
	`employeeId` integer DEFAULT 1,
	`staff` text DEFAULT 'Operator',
	`physicalDeleted` integer DEFAULT 0,
	`needUploading` integer DEFAULT 1,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `SessionLogs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sessionId` integer,
	`workstationId` integer,
	`accountId` integer,
	`username` text,
	`accountType` integer,
	`guestDetailId` integer DEFAULT -1,
	`priceId` text,
	`startDate` text,
	`startTime` text,
	`stopDate` text,
	`stopTime` text,
	`minutesAvailable` integer DEFAULT 0,
	`minutesUsed` integer DEFAULT 0,
	`lockedMinutes` integer DEFAULT 0,
	`timePrice` real DEFAULT 0,
	`realMoneyUsed` real DEFAULT 0,
	`freeMoneyUsed` real DEFAULT 0,
	`freeMinutesUsed` integer DEFAULT 0,
	`paidMoney` real DEFAULT 0,
	`isOpenTime` integer DEFAULT 0,
	`isPostPay` integer DEFAULT 0,
	`transferInTimeFee` real DEFAULT 0,
	`transferInServiceFee` real DEFAULT 0,
	`employeeID` integer DEFAULT 1,
	`status` text DEFAULT 'completed',
	`note` text,
	`staff` text DEFAULT 'Operator',
	`physicalDeleted` integer DEFAULT 0,
	`needUploading` integer DEFAULT 1,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `Shifts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`emplId` integer NOT NULL,
	`shiftTime` integer NOT NULL,
	`startDT` integer NOT NULL,
	`endDT` integer,
	`startCash` real DEFAULT 0 NOT NULL,
	`totalCashIn` real DEFAULT 0,
	`totalCashOut` real DEFAULT 0,
	`endCash` real DEFAULT 0,
	`status` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `SystemLogs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`eventTime` integer NOT NULL,
	`eventType` integer NOT NULL,
	`operatorId` integer,
	`workstationId` integer,
	`description` text NOT NULL,
	`level` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `TopupQueues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workstationId` integer NOT NULL,
	`sessionId` integer NOT NULL,
	`priceId` integer,
	`money` real NOT NULL,
	`freeMoney` real DEFAULT 0,
	`minutes` integer DEFAULT 0,
	`topupTime` integer NOT NULL,
	`startTime` integer NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `Users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`passwordHash` text DEFAULT '' NOT NULL,
	`pwdHashType` integer DEFAULT 1 NOT NULL,
	`groupId` integer DEFAULT 1 NOT NULL,
	`money` real DEFAULT 0 NOT NULL,
	`usedAmount` real DEFAULT 0 NOT NULL,
	`freeMoney` real DEFAULT 0 NOT NULL,
	`freeMinutes` integer DEFAULT 0 NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`loginTime` integer DEFAULT 0,
	`expiredIn` integer DEFAULT 0,
	`dueDate` integer DEFAULT 0,
	`lastLoginDT` integer DEFAULT 0,
	`lastLogoutDT` integer DEFAULT 0,
	`mobilePhone` text,
	`email` text,
	`nric` text,
	`address` text,
	`couponType` integer DEFAULT 0,
	`logRecorded` integer DEFAULT 1,
	`enabled` integer DEFAULT 1 NOT NULL,
	`firstName` text DEFAULT '',
	`lastName` text DEFAULT '',
	`phone` text DEFAULT '',
	`groupName` text DEFAULT 'Reguler',
	`status` text DEFAULT 'Normal',
	`createdAt` text,
	`expiredAt` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Users_name_unique` ON `Users` (`name`);--> statement-breakpoint
CREATE TABLE `UserGroups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`rateId` integer DEFAULT 1 NOT NULL,
	`discountRateId` integer DEFAULT 0,
	`checkoutRounding` integer DEFAULT 0,
	`pointsMultiplier` real DEFAULT 1,
	`enabled` integer DEFAULT 1 NOT NULL,
	`needUploading` integer DEFAULT 1 NOT NULL,
	`discountPercent` real DEFAULT 0,
	`isDefault` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `WorkstationGroups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `Workstations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pcId` text,
	`name` text NOT NULL,
	`ip` text,
	`mac` text DEFAULT '00:00:00:00:00:00',
	`groupId` integer DEFAULT 1 NOT NULL,
	`groupName` text DEFAULT 'Area Reguler',
	`status` integer DEFAULT 0 NOT NULL,
	`lockStatus` integer DEFAULT 1 NOT NULL,
	`currentSessionId` integer DEFAULT 0,
	`currentAccountId` integer DEFAULT 0,
	`currentAccountType` integer DEFAULT 0,
	`memo` text,
	`enabled` integer DEFAULT 1 NOT NULL,
	`state` text DEFAULT 'idle',
	`currentUser` text,
	`billingType` text,
	`remainingSeconds` integer DEFAULT 0,
	`elapsedSeconds` integer DEFAULT 0,
	`totalSpent` real DEFAULT 0,
	`pricePerHour` real DEFAULT 4000,
	`packageName` text,
	`lastSeen` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Workstations_pcId_unique` ON `Workstations` (`pcId`);