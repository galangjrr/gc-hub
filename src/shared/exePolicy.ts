// Exe allowlist (AppLocker on the booth, see agent/applocker_windows.go). Pure rules shared by the
// server settings, the booth panel and the main process. The agent re-validates everything; these
// copies exist so the UI rejects a bad path before it travels.

export type ExeMode = 'off' | 'audit' | 'enforce';

export const EXE_MODES: ExeMode[] = ['off', 'audit', 'enforce'];

export const EXE_MODE_LABEL: Record<ExeMode, string> = {
  off: 'Mati',
  audit: 'Catat saja',
  enforce: 'Blokir',
};

export interface ExePolicy {
  mode: ExeMode;
  allowPaths: string[];
}

// Server-side setting: one path list for every booth, a default mode, and per-PC mode overrides
// keyed by upper-case PC name (so one booth can run audit before the rest).
export interface ExePolicySettings {
  defaultMode: ExeMode;
  allowPaths: string[];
  overrides: Record<string, ExeMode>;
}

export const MAX_ALLOW_PATHS = 32;

export const isExeMode = (v: unknown): v is ExeMode => typeof v === 'string' && (EXE_MODES as string[]).includes(v);

// Keep in sync with allowPathRe and validateAllowPath in agent/applocker_windows.go.
// AppLocker only knows these variables; per-user ones like %LOCALAPPDATA% are not supported.
const ALLOW_PATH_RE = /^(%(WINDIR|SYSTEM32|OSDRIVE|PROGRAMFILES)%|[a-z]:)(\\[^\\/:"<>|?]+)+$/i;

/** Returns why the path is not allowed, or null when it is fine. */
export function allowPathError(p: string): string | null {
  if (p.length > 260 || !ALLOW_PATH_RE.test(p)) {
    return 'Format path tidak valid. Pakai huruf drive atau %OSDRIVE%, %PROGRAMFILES%, %WINDIR%, %SYSTEM32%.';
  }
  const segs = p.split('\\').slice(1);
  if (segs.some(s => s === '.' || s === '..')) return 'Path tidak boleh memakai . atau ..';
  const named = segs.filter(s => !s.includes('*')).length;
  const top = segs[0].toLowerCase();
  const minNamed = top === 'users' ? 4 : top === 'programdata' ? 2 : 1;
  if (segs[0].includes('*') || named < minNamed) {
    return top === 'users'
      ? 'Terlalu luas. Sebut folder aplikasinya, misal %OSDRIVE%\\Users\\*\\AppData\\Local\\Roblox\\*'
      : 'Terlalu luas. Sebut folder aplikasinya, bukan seluruh drive.';
  }
  return null;
}

/** One path per line; blank lines skipped, duplicates dropped. Errors carry the line text. */
export function parseAllowPaths(text: string): { paths: string[]; errors: string[] } {
  const paths: string[] = [];
  const errors: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const p = raw.trim();
    if (!p || paths.some(x => x.toLowerCase() === p.toLowerCase())) continue;
    const err = allowPathError(p);
    if (err) errors.push(`${p}: ${err}`);
    else paths.push(p);
  }
  if (paths.length > MAX_ALLOW_PATHS) errors.push(`Maksimal ${MAX_ALLOW_PATHS} path.`);
  return { paths, errors };
}

/** Shape check for a policy arriving over IPC or the LAN. */
export function exePolicyError(p: unknown): string | null {
  const v = p as ExePolicy;
  if (!v || !isExeMode(v.mode) || !Array.isArray(v.allowPaths)) return 'Format allowlist tidak valid.';
  if (v.allowPaths.length > MAX_ALLOW_PATHS) return `Maksimal ${MAX_ALLOW_PATHS} path.`;
  for (const path of v.allowPaths) {
    if (typeof path !== 'string') return 'Format allowlist tidak valid.';
    const err = allowPathError(path);
    if (err) return `${path}: ${err}`;
  }
  return null;
}

/** app_settings key holding ExePolicySettings as JSON. Absent = the server does not manage booths. */
export const EXE_SETTINGS_KEY = 'exe_policy';

export const DEFAULT_EXE_SETTINGS: ExePolicySettings = { defaultMode: 'off', allowPaths: [], overrides: {} };

/** Policy a given booth should run under the server setting. */
export function effectiveExePolicy(settings: ExePolicySettings, pcName: string): ExePolicy {
  return {
    mode: settings.overrides[pcName.trim().toUpperCase()] ?? settings.defaultMode,
    allowPaths: settings.allowPaths,
  };
}

/** Parse the stored JSON, dropping anything invalid so a damaged row never reaches a booth. */
export function parseExeSettings(json: string): ExePolicySettings | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json);
    const overrides: Record<string, ExeMode> = {};
    for (const [pc, mode] of Object.entries(raw?.overrides ?? {})) {
      if (isExeMode(mode)) overrides[pc.toUpperCase()] = mode;
    }
    const allowPaths = Array.isArray(raw?.allowPaths)
      ? raw.allowPaths.filter((p: unknown) => typeof p === 'string' && !allowPathError(p)).slice(0, MAX_ALLOW_PATHS)
      : [];
    return { defaultMode: isExeMode(raw?.defaultMode) ? raw.defaultMode : 'off', allowPaths, overrides };
  } catch {
    return null;
  }
}
