/**
 * Registry Policies for Client Machine Lockdown
 * Renderer Bridge - Safe for both Electron and Browser Previews (Zero direct Node.js imports)
 */

export interface SecurityPolicyConfig {
  disableTaskMgr: boolean;
  disableControlPanel: boolean;
  disableRunDialog: boolean;
  disableRegistryTools: boolean;
}

export const DEFAULT_LOCKED_POLICY: SecurityPolicyConfig = {
  disableTaskMgr: true,
  disableControlPanel: true,
  disableRunDialog: true,
  disableRegistryTools: true
};

export const DEFAULT_UNLOCKED_POLICY: SecurityPolicyConfig = {
  disableTaskMgr: false,
  disableControlPanel: false,
  disableRunDialog: false,
  disableRegistryTools: false
};

/**
 * Apply or Revert Security Policies consistently via Electron IPC
 */
export function applySecurityPolicies(config: SecurityPolicyConfig): void {
  const isLock = config.disableTaskMgr || config.disableControlPanel;
  if (typeof window !== 'undefined' && (window as any).electronAPI?.applySecurityPolicies) {
    (window as any).electronAPI.applySecurityPolicies(isLock);
  } else {
    console.log('[SECURITY (PREVIEW)] Policy applied:', config);
  }
}

/**
 * Query current policy state
 */
export function queryCurrentPolicies(): SecurityPolicyConfig {
  return DEFAULT_UNLOCKED_POLICY;
}
