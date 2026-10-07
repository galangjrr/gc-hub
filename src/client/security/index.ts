export class ClientSecurityManager {
  private static isLocked = false;

  /**
   * Lock workstation state in renderer
   */
  public static lockWorkstation(): void {
    this.isLocked = true;
    console.log('[SECURITY MANAGER] Workstation state set to LOCKED.');
  }

  /**
   * Unlock workstation state in renderer
   */
  public static unlockWorkstation(): void {
    this.isLocked = false;
    console.log('[SECURITY MANAGER] Workstation state set to UNLOCKED.');
  }

  /**
   * Query lock status
   */
  public static getLockStatus(): boolean {
    return this.isLocked;
  }
}
