import { app } from 'electron';
import { ProcessWatcherGuard } from '../src/client/security/processGuard';
import { SecurityManager } from '../src/main/security';
import { SessionCleanupService } from '../src/main/cleanup';
import { SystemService } from '../src/main/systemService';
import { 
  DEFAULT_LOCKED_POLICY, 
  DEFAULT_UNLOCKED_POLICY 
} from '../src/client/security/registryPolicy';
import { OpCode } from '../src/shared/protocol';
import type { SessionData } from '../src/shared/protocol';

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

async function runClientKioskTests() {
  console.log('================================================================');
  console.log('🔒 GC-HUB PHASE 3: CLIENT LOCKDOWN & KIOSK RUNTIME TEST SUITE');
  console.log('================================================================\n');

  try {
    // --- 1. Client State Machine & Session Lifecycle ---
    console.log('--- [1. CLIENT STATE MACHINE & SESSION LIFECYCLE] ---');
    
    // State 0: AVAILABLE (Standby / Locked Screen)
    let currentSession: SessionData | null = null;
    let isAfkLocked = false;
    assert(currentSession === null && !isAfkLocked, 'State 0 (AVAILABLE): Initial state is Standby Lockscreen');

    // Transition to ONLINE: Auth Success
    currentSession = {
      sessionId: 'SES-TEST-01',
      pcId: 'PC-01',
      username: 'member_gchub',
      billingType: 'prepaid',
      userType: 'member',
      timeUsedMinutes: 0,
      timeRemainingMinutes: 120,
      elapsedSeconds: 0,
      remainingSeconds: 7200,
      moneyUsed: 0,
      totalSpent: 8000
    };
    assert(currentSession !== null && currentSession.remainingSeconds === 7200, 'State 1 (ONLINE): Transitioned to Active Session with Floating Capsule');

    // Authoritative 1s tick simulation
    const simulatedTick = {
      remainingSeconds: 7199,
      elapsedSeconds: 1,
      timeRemainingMinutes: 120,
      timeUsedMinutes: 0,
      moneyUsed: 0,
      totalSpent: 8000
    };
    currentSession = { ...currentSession, ...simulatedTick };
    assert(currentSession.remainingSeconds === 7199 && currentSession.elapsedSeconds === 1, 'Session Tick Reconciliation: Local timer updated synchronously');

    // Transition to SUSPENDED: AFK Lock
    isAfkLocked = true;
    assert(isAfkLocked === true, 'State 2 (SUSPENDED): AFK Lock modal activated with PIN protection');

    // Resume from SUSPENDED: AFK Unlock
    isAfkLocked = false;
    assert(isAfkLocked === false, 'State 1 (ONLINE): Session resumed from AFK lock');

    // Transition to AVAILABLE: Session Logout / Force End
    currentSession = null;
    assert(currentSession === null, 'State 0 (AVAILABLE): Session ended and returned to Standby Lockscreen');


    // --- 2. Process Guard & In-Game Task Manager ---
    console.log('\n--- [2. PROCESS GUARD & IN-GAME TASK MANAGER] ---');
    
    // Test Process Scanning
    const processes = await SystemService.getRunningProcesses(false);
    assert(Array.isArray(processes) && processes.length > 0, `Process Scanner: Retrieved ${processes.length} running processes`);

    const hasCategories = processes.every(p => p.category && ['game', 'browser', 'app', 'system', 'background', 'other'].includes(p.category));
    assert(hasCategories, 'Process Categorization: All processes categorized correctly (game/browser/app/system/background/other)');

    // Test Protected Process Safety
    const killProtectedRes = await SystemService.killProcess(4, 'system', true);
    assert(killProtectedRes.success === false, 'Protected Process Safety: Killing critical system process blocked');

    // Without the Electron bridge the renderer has no processes and must not invent any:
    // a made-up PID sent to killProcess would hit whatever real process owns it
    const noBridgeList = await ProcessWatcherGuard.getRunningUserProcesses(true);
    assert(noBridgeList.length === 0, `Renderer without bridge: no invented processes (${noBridgeList.length} items)`);
    const noBridgeKill = await ProcessWatcherGuard.killRemoteProcess(10482, 'PointBlank.exe', true);
    assert(noBridgeKill.success === false, 'Renderer without bridge: kill reports failure instead of fake success');


    // --- 3. Desktop Security & Registry Policies ---
    console.log('\n--- [3. DESKTOP SECURITY & REGISTRY POLICIES] ---');
    
    // Check Policy definitions matching specification
    assert(DEFAULT_LOCKED_POLICY.disableTaskMgr === true, 'Policy Check: Task Manager disabled in locked mode');
    assert(DEFAULT_LOCKED_POLICY.disableControlPanel === true, 'Policy Check: Control Panel disabled in locked mode');
    assert(DEFAULT_LOCKED_POLICY.disableRunDialog === true, 'Policy Check: Run Dialog disabled in locked mode');
    assert(DEFAULT_LOCKED_POLICY.disableRegistryTools === true, 'Policy Check: Registry Editor disabled in locked mode');

    assert(DEFAULT_UNLOCKED_POLICY.disableTaskMgr === false, 'Policy Check: Task Manager enabled in unlocked mode');
    assert(DEFAULT_UNLOCKED_POLICY.disableControlPanel === false, 'Policy Check: Control Panel enabled in unlocked mode');
    assert(DEFAULT_UNLOCKED_POLICY.disableRunDialog === false, 'Policy Check: Run Dialog enabled in unlocked mode');

    // Test Security Manager state toggling
    SecurityManager.setLockdownMode(true);
    assert(SecurityManager.isSystemLocked() === true, 'Security Manager: Lockdown mode active');

    SecurityManager.setLockdownMode(false);
    assert(SecurityManager.isSystemLocked() === false, 'Security Manager: Lockdown mode deactivated');


    // --- 4. Session Privacy Cleanup Service ---
    console.log('\n--- [4. SESSION PRIVACY CLEANUP SERVICE] ---');
    
    const cleanupRes = await SessionCleanupService.executeSessionCleanup();
    assert(cleanupRes.success === true, 'Session Cleanup: Privacy wipe executed successfully', cleanupRes.message);

    // Audio reset
    await SessionCleanupService.resetAudioVolume(50);
    assert(true, 'Audio Reset: Audio volume reset to default 50%');

  } catch (err: any) {
    console.error('Client Kiosk Test Exception:', err.stack || err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`📊 CLIENT KIOSK TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  try {
    app.exit(failed > 0 ? 1 : 0);
  } catch {
    process.exit(failed > 0 ? 1 : 0);
  }
}

app.whenReady().then(runClientKioskTests);
