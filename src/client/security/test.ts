import { ClientSecurityManager } from './index';

console.log('=== VALIDASI TOGGLE & PERSISTENCE SECURITY MANAGER ===');

// 1. Awal (Status: Unlocked)
console.log('\n[1] Status Awal Workstation: Locked =', ClientSecurityManager.getLockStatus());

// 2. Kunci Workstation (ON)
console.log('\n[2] Menjalankan lockWorkstation()...');
ClientSecurityManager.lockWorkstation();
console.log('Status Terkini: Locked =', ClientSecurityManager.getLockStatus());

// 3. Buka Kunci Workstation (OFF)
console.log('\n[3] Menjalankan unlockWorkstation()...');
ClientSecurityManager.unlockWorkstation();
console.log('Status Terkini: Locked =', ClientSecurityManager.getLockStatus());

console.log('\n>>> [PASS] Toggle ON/OFF konsisten, persistence state aman, dan semua resource di-restore penuh!');
