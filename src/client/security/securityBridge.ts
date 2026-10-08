export class ClientSecurityBridge {
  public static lockWorkstation(): void {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.setLockdownMode?.(true);
      (window as any).electronAPI.setDesktopOverlayMode(false);
    } else {
      console.log('[SECURITY BRIDGE (DEV PREVIEW)] Workstation locked (Always on Top).');
    }
  }

  public static unlockWorkstation(): void {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.setLockdownMode?.(false);
      (window as any).electronAPI.setDesktopOverlayMode(true);
    } else {
      console.log('[SECURITY BRIDGE (DEV PREVIEW)] Workstation unlocked (Floating widget).');
    }
  }

  public static setWidgetInteractive(interactive: boolean): void {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.setWidgetMouseInteractive) {
      (window as any).electronAPI.setWidgetMouseInteractive(interactive);
    }
  }

  public static exitApp(): void {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.exitApp) {
      (window as any).electronAPI.exitApp();
    } else {
      console.log('[SECURITY BRIDGE (DEV PREVIEW)] Close/Kill Client Application triggered.');
      if (confirm('Tutup seluruh aplikasi GC-Client?')) {
        window.close();
      }
    }
  }
}
