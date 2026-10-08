import { eq } from 'drizzle-orm';
import { db } from '../src/server/db/index';
import * as schema from '../src/server/db/schema';
import { DbService } from '../src/server/db/dbService';
import { todayIso } from '../src/shared/transactions';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, details: string = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
    if (details) console.log(`     -> ${details}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${name}`);
    if (details) console.error(`     -> ${details}`);
    failed++;
  }
}

async function runServerLoginTests() {
  console.log('================================================================');
  console.log('⚡ GC-HUB SERVER LOGIN & OPERATOR AUTHENTICATION TEST SUITE');
  console.log('================================================================\n');

  try {
    // 1. Init Database
    console.log('--- [1. INITIALIZING DATABASE & SEEDING EMPLOYEES] ---');
    await DbService.init();

    // Ensure clean state: delete any legacy GCHUB test entry
    db.delete(schema.employees).where(eq(schema.employees.name, 'GCHUB')).run();

    // Ensure standard test accounts exist with clean roles
    const existingOp = db.select().from(schema.employees).where(eq(schema.employees.name, 'Operator')).get();
    if (!existingOp) {
      DbService.createEmployee({ name: 'Operator', password: 'admin123', role: 0 });
    } else {
      DbService.updateEmployee(existingOp.id, { role: 0, password: 'admin123', enabled: true });
    }

    const existingAdmin = db.select().from(schema.employees).where(eq(schema.employees.name, 'Admin')).get();
    if (!existingAdmin) {
      DbService.createEmployee({ name: 'Admin', password: 'admin123', role: 2 });
    } else {
      DbService.updateEmployee(existingAdmin.id, { role: 2, password: 'admin123', enabled: true });
    }

    const employees = DbService.getEmployees();
    assert(employees.length >= 2, 'DbService seeded default employees', `Count: ${employees.length}`);
    const op = employees.find(e => e.name === 'Operator');
    const admin = employees.find(e => e.name === 'Admin');
    assert(op !== undefined && op.role === 0, 'Default Operator exists with role 0 (Kasir)');
    assert(admin !== undefined && admin.role === 2, 'Default Admin exists with role 2 (Admin)');

    // 2. Authentication Verification
    console.log('\n--- [2. SERVER LOGIN AUTHENTICATION VERIFICATION] ---');
    
    // Valid Operator
    const resOp = DbService.verifyEmployeeLogin({ username: 'Operator', password: 'admin123' });
    assert(resOp.success === true, 'Login Operator with valid credentials succeeds');
    assert(resOp.employee?.name === 'Operator' && resOp.employee?.role === 0, 'Operator payload has correct role and name');

    // Valid Admin
    const resAdmin = DbService.verifyEmployeeLogin({ username: 'Admin', password: 'admin123' });
    assert(resAdmin.success === true, 'Login Admin with valid credentials succeeds');
    assert(resAdmin.employee?.role === 2 && resAdmin.employee?.roleText === 'Admin', 'Admin payload has role 2');

    // Case insensitive username
    const resCase = DbService.verifyEmployeeLogin({ username: 'operator', password: 'admin123' });
    assert(resCase.success === true, 'Username search is case-insensitive (operator vs Operator)');

    // Security Law: No hardcoded backdoor exists
    const resBackdoor = DbService.verifyEmployeeLogin({ username: 'GCHUB', password: 'admin123' });
    assert(resBackdoor.success === false, 'Hardcoded GCHUB backdoor eliminated - non-existent account rejected');

    // Wrong Password
    const resWrongPass = DbService.verifyEmployeeLogin({ username: 'Operator', password: 'wrongpassword' });
    assert(resWrongPass.success === false, 'Wrong password rejected');
    assert(resWrongPass.message.includes('Password operator salah'), 'Correct error message on wrong password');

    // Non-existent username
    const resUnknown = DbService.verifyEmployeeLogin({ username: 'random_hacker', password: '123' });
    assert(resUnknown.success === false, 'Non-existent username rejected');

    // Empty username
    const resEmpty = DbService.verifyEmployeeLogin({ username: '', password: '' });
    assert(resEmpty.success === false, 'Empty username rejected');

    // Booth settings on a client PC: admin role only
    assert(DbService.verifyAdminLogin({ username: 'Admin', password: 'admin123' }).success === true, 'Admin opens booth settings');
    assert(DbService.verifyAdminLogin({ username: 'Operator', password: 'admin123' }).success === false, 'Kasir (role 0) cannot open booth settings');
    assert(DbService.verifyAdminLogin({ username: 'Admin', password: 'salah' }).success === false, 'Wrong admin password cannot open booth settings');

    // 3. Lock Console & Logout Exit System Audit
    console.log('\n--- [3. LOCK SERVER CONSOLE & LOGOUT EXIT AUDIT] ---');
    const lockRes = DbService.lockServerConsole('Operator Kasir');
    assert(lockRes.success === true, 'Lock server console succeeds');

    const exitRes = DbService.logoutAndExitServer('Operator Kasir');
    assert(exitRes.success === true, 'Logout and exit server records session closure');

    const logs = DbService.getSystemLogsRange(todayIso(), todayIso())!.rows;
    const lockLog = logs.find(l => l.description.includes('dikunci'));
    const exitLog = logs.find(l => l.description.includes('logout'));
    assert(lockLog !== undefined, 'Console lock event recorded in SQLite system logs', lockLog?.description);
    assert(exitLog !== undefined, 'Logout exit event recorded in SQLite system logs', exitLog?.description);

    // 4. Employee Management & Scraped Legacy Shift Delete Law
    console.log('\n--- [4. EMPLOYEE CRUD & SCRAPED DELETION LAW] ---');
    
    // Create new employee
    const newEmpName = `KasirTest_${Date.now()}`;
    const createRes = DbService.createEmployee({
      name: newEmpName,
      password: 'pass123',
      role: 0,
      phone: '0812-9999-8888'
    });
    assert(createRes.success === true, 'New employee created in SQLite', `ID: ${createRes.employee?.id}`);

    // Verify in getEmployees
    let allEmps = DbService.getEmployees();
    assert(allEmps.some(e => e.name === newEmpName), 'Created employee found in getEmployees() list');

    // Update employee
    if (createRes.employee) {
      const updateRes = DbService.updateEmployee(createRes.employee.id, {
        role: 1, // Promoted to Manager
        phone: '0812-0000-1111'
      });
      assert(updateRes.success === true, 'Employee role updated to Manager (role 1)');
      assert(updateRes.employee?.role === 1, 'Updated employee role matches');
    }

    // Try to delete employee that is on active shift
    const currentAdmin = db.select().from(schema.employees).where(eq(schema.employees.name, 'Admin')).get()!;
    const openShift = db.select().from(schema.shifts).where(eq(schema.shifts.status, 1)).get();
    if (!openShift) {
      db.insert(schema.shifts).values({
        emplId: currentAdmin.id,
        shiftTime: 1,
        startDT: Date.now(),
        startCash: 100000,
        totalCashIn: 0,
        totalCashOut: 0,
        endCash: 0,
        status: 1
      }).run();
    } else {
      db.update(schema.shifts).set({ emplId: currentAdmin.id }).where(eq(schema.shifts.status, 1)).run();
    }

    DbService.setShiftEnabled(true);
    const activeShift = DbService.getActiveShiftSummary();
    const activeEmplId = activeShift.currentShift.emplId;
    const deleteShiftEmplRes = DbService.deleteEmployee(activeEmplId);
    assert(deleteShiftEmplRes.success === false, 'Cannot delete employee currently on active shift');
    assert(
      deleteShiftEmplRes.message === "Can't delete employee that is on shift. Please handover shift first.",
      'Error message strictly matches scraped legacy law verbatim'
    );

    // Delete inactive created test employee
    if (createRes.employee) {
      const deleteRes = DbService.deleteEmployee(createRes.employee.id);
      assert(deleteRes.success === true, 'Deleting employee not on shift succeeds');
    }

    // 5. Disabled Employee Login Check
    console.log('\n--- [5. DISABLED EMPLOYEE LOGIN ENFORCEMENT] ---');
    const tempEmp = DbService.createEmployee({
      name: `DisabledUser_${Date.now()}`,
      password: '123',
      role: 0
    });
    if (tempEmp.employee) {
      DbService.updateEmployee(tempEmp.employee.id, { enabled: false });
      const loginDisabledRes = DbService.verifyEmployeeLogin({ username: tempEmp.employee.name, password: '123' });
      assert(loginDisabledRes.success === false, 'Disabled employee login rejected');
      assert(loginDisabledRes.message.includes('dinonaktifkan'), 'Proper disabled account error message returned');
      DbService.deleteEmployee(tempEmp.employee.id);
    }

  } catch (err: any) {
    console.error('Fatal error during test execution:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runServerLoginTests();
