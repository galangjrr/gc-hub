/**
 * AppGuard: Software Restriction Policy (SRP) Helper
 * Renderer Bridge - Safe for both Electron and Browser Previews (Zero direct Node.js imports)
 */
export class AppGuard {
  public static setExecutionRestriction(enable: boolean): void {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.applySecurityPolicies) {
      (window as any).electronAPI.applySecurityPolicies(enable);
    } else {
      console.log(`[APPGUARD (PREVIEW)] Execution restrictions ${enable ? 'ENABLED' : 'DISABLED'}.`);
    }
  }
}
