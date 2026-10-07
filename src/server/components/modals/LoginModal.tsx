import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Minus, Square, X } from 'lucide-react';
import { EmployeeLoginResult } from '../../../shared/types';
import { AppLogo } from '../../../shared/ui/AppLogo';
import { api, INPUT, BTN_PRIMARY, FOCUS, BTN_GHOST } from '../settingsUi';
import { cn } from '../../../shared/ui/utils';

// Server console gate: first-admin setup on a fresh install, operator login, and unlocking a
// locked console (same operator, or another account such as an admin).

interface LoginModalProps {
  isOpen: boolean;
  isLocked?: boolean;
  currentOperator?: string;
  onLogin: (employee: { id: number; name: string; role: number; roleText?: string }) => void;
}

const LAST_OPERATOR_KEY = 'gchub_last_server_operator';

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, isLocked = false, currentOperator, onLogin }) => {
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [otherAccount, setOtherAccount] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    api()?.hasAdminAccount?.()
      .then((hasAdmin: boolean) => { if (!cancelled) setIsSetupMode(!hasAdmin && !isLocked); })
      .catch(() => { if (!cancelled) setIsSetupMode(false); });

    let prefill = '';
    try { prefill = isLocked ? currentOperator || '' : localStorage.getItem(LAST_OPERATOR_KEY) || ''; } catch { /* storage blocked */ }
    setUsername(prefill);
    setOtherAccount(false);
    setPassword('');
    setConfirmPassword('');
    setError('');
    const t = setTimeout(() => (prefill ? passwordRef : usernameRef).current?.focus(), 50);
    return () => { cancelled = true; clearTimeout(t); };
  }, [isOpen, isLocked, currentOperator]);

  if (!isOpen) return null;

  const showOperatorCard = isLocked && !otherAccount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    const p = password.trim();
    if (!u) { setError('Isi username.'); usernameRef.current?.focus(); return; }
    if (!p) { setError('Isi password.'); passwordRef.current?.focus(); return; }
    if (isSetupMode && p.length < 3) { setError('Password minimal 3 karakter.'); return; }
    if (isSetupMode && p !== confirmPassword.trim()) { setError('Ulangi password belum sama.'); return; }

    setLoading(true);
    setError('');
    try {
      const call = isSetupMode ? api()?.setupInitialAdmin : api()?.verifyEmployeeLogin;
      if (!call) { setError('Database server tidak terhubung. Tutup lalu buka lagi aplikasi server.'); return; }
      const result: EmployeeLoginResult = await call({ username: u, password: p });
      if (!result.success || !result.employee) {
        setError(result.message || (isSetupMode ? 'Akun admin gagal dibuat.' : 'Username atau password salah.'));
        passwordRef.current?.focus();
        return;
      }
      try { localStorage.setItem(LAST_OPERATOR_KEY, result.employee.name); } catch { /* storage blocked */ }
      setPassword('');
      onLogin(result.employee);
    } catch (err: any) {
      setError(err?.message || 'Akun gagal diperiksa.');
    } finally {
      setLoading(false);
    }
  };

  const title = isSetupMode ? 'Buat akun admin' : isLocked ? 'Konsol terkunci' : 'Masuk kasir';
  const subtitle = isSetupMode
    ? 'Instalasi baru. Akun ini memegang tarif, staf, dan pengaturan server.'
    : isLocked ? 'Masukkan password untuk membuka lagi.' : 'Pakai akun kasir atau admin.';
  const submitLabel = loading ? 'Memeriksa...' : isSetupMode ? 'Buat akun dan masuk' : isLocked ? 'Buka kunci' : 'Masuk';

  const windowBtn = `w-10 h-8 flex items-center justify-center rounded-sm text-text-muted transition-colors duration-150 ${FOCUS}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-canvas select-none">
      <header className="absolute top-0 inset-x-0 h-10 pl-4 pr-1 flex items-center justify-between drag-region">
        <span className="text-[12px] font-medium text-text-muted">GC Hub Server</span>
        <div className="flex items-center no-drag">
          <button type="button" onClick={() => api()?.minimizeWindow?.()} aria-label="Kecilkan jendela" className={`${windowBtn} hover:text-text-primary hover:bg-surface-3`}>
            <Minus className="w-3.5 h-3.5" aria-hidden />
          </button>
          <button type="button" onClick={() => api()?.maximizeWindow?.()} aria-label="Perbesar jendela" className={`${windowBtn} hover:text-text-primary hover:bg-surface-3`}>
            <Square className="w-3 h-3" aria-hidden />
          </button>
          <button type="button" onClick={() => api()?.closeWindow?.()} aria-label="Tutup server" className={`${windowBtn} hover:text-white hover:bg-error`}>
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      </header>

      <main
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="w-full max-w-[400px] bg-surface-2 border border-hairline rounded-md shadow-modal"
      >
        <div className="px-6 pt-6 pb-5 border-b border-hairline">
          <div className="flex items-center gap-2.5">
            <AppLogo className="w-7 h-7 object-contain" alt="" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">Server kasir</span>
          </div>
          <h1 id="login-title" className="mt-4 text-[20px] font-semibold tracking-[-0.015em] text-text-primary">{title}</h1>
          <p className="mt-1 text-[13px] text-text-muted">{subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="px-6 pt-5 pb-6 space-y-4">
          {showOperatorCard ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-medium text-text-secondary">Operator bertugas</span>
                <button
                  type="button"
                  onClick={() => { setOtherAccount(true); setUsername(''); setError(''); setTimeout(() => usernameRef.current?.focus(), 0); }}
                  className={cn(BTN_GHOST, 'h-6 px-1 text-primary hover:underline')}
                >
                  Pakai akun lain
                </button>
              </div>
              <div className="flex items-center gap-3 h-10 px-3 rounded-sm bg-surface-3 border border-hairline">
                <span className="w-6 h-6 flex-none flex items-center justify-center rounded-full bg-primary/15 text-[12px] font-semibold text-primary" aria-hidden>
                  {(currentOperator || '?').charAt(0).toUpperCase()}
                </span>
                <span className="text-[13px] font-medium text-text-primary truncate">{currentOperator || 'Tidak diketahui'}</span>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="login-username" className="text-[12px] font-medium text-text-secondary">
                  {isSetupMode ? 'Username admin' : 'Username'}
                </label>
                {isLocked && (
                  <button
                    type="button"
                    onClick={() => { setOtherAccount(false); setUsername(currentOperator || ''); setError(''); setTimeout(() => passwordRef.current?.focus(), 0); }}
                    className={cn(BTN_GHOST, 'h-6 px-1 text-text-muted hover:text-text-primary')}
                  >
                    Kembali ke {currentOperator || 'operator'}
                  </button>
                )}
              </div>
              <input
                id="login-username"
                ref={usernameRef}
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(''); }}
                placeholder={isSetupMode ? 'Misal: admin' : ''}
                className={cn(INPUT, 'h-10')}
              />
            </div>
          )}

          <div>
            <label htmlFor="login-password" className="block mb-1 text-[12px] font-medium text-text-secondary">
              {isSetupMode ? 'Password baru' : 'Password'}
            </label>
            <div className="relative">
              <input
                id="login-password"
                ref={passwordRef}
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSetupMode ? 'new-password' : 'current-password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                aria-invalid={!!error}
                aria-describedby={error ? 'login-error' : undefined}
                className={cn(INPUT, 'h-10 pr-10')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                aria-pressed={showPassword}
                className={`absolute right-1 top-1 w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary ${FOCUS}`}
              >
                {showPassword ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
              </button>
            </div>
          </div>

          {isSetupMode && (
            <div>
              <label htmlFor="login-confirm" className="block mb-1 text-[12px] font-medium text-text-secondary">Ulangi password</label>
              <input
                id="login-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                className={cn(INPUT, 'h-10')}
              />
            </div>
          )}

          {error && <p id="login-error" role="alert" className="text-[13px] text-error">{error}</p>}

          <button type="submit" disabled={loading} className={cn(BTN_PRIMARY, 'w-full h-10')}>{submitLabel}</button>
        </form>
      </main>
    </div>
  );
};
