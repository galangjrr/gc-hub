import React, { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';

interface AfkUnlockFormProps {
  /** Return false kalau PIN salah. */
  onUnlock: (pin: string) => boolean;
  onAdminOverride: (username: string, pass: string) => void;
  /** Dikunci operator dari kasir: tidak ada PIN pemain, hanya akun operator yang bisa membuka. */
  operatorLocked: boolean;
}

const inputClass =
  'w-full h-11 px-3 bg-surface-3 border border-hairline rounded-sm text-sm text-text-primary outline-none focus:border-primary transition-colors duration-150';

export const AfkUnlockForm: React.FC<AfkUnlockFormProps> = ({ onUnlock, onAdminOverride, operatorLocked }) => {
  const [tab, setTab] = useState<'pin' | 'admin'>(operatorLocked ? 'admin' : 'pin');
  const [pin, setPin] = useState('');
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [error, setError] = useState('');

  const submitPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) return setError('Isi PIN dulu.');
    if (!onUnlock(pin)) {
      setPin('');
      setError('PIN salah. Coba lagi, atau minta operator buka lewat tab Operator.');
    }
  };

  const submitAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser.trim() || !adminPass.trim()) return setError('Isi username dan password admin.');
    onAdminOverride(adminUser.trim(), adminPass.trim());
    setAdminPass('');
  };

  const switchTab = (next: 'pin' | 'admin') => {
    setTab(next);
    setError('');
  };

  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">Layar dikunci</h1>
      <p className="mt-1 text-sm text-text-muted">
        {operatorLocked
          ? 'Kasir mengunci layar ini dan waktu sesi dihentikan sementara. Panggil operator untuk membuka.'
          : 'Sesi tetap jalan. Masukkan PIN yang kamu buat waktu mengunci.'}
      </p>

      {!operatorLocked && <div role="tablist" aria-label="Cara membuka" className="mt-6 grid grid-cols-2 border-b border-hairline">
        {([['pin', 'PIN', KeyRound], ['admin', 'Operator', ShieldCheck]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => switchTab(key)}
            className={`h-11 -mb-px flex items-center justify-center gap-2 text-sm font-medium border-b-2 transition-colors duration-150 ${
              tab === key ? 'border-primary text-text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>}

      {tab === 'pin' ? (
        <form className="mt-6 space-y-4" onSubmit={submitPin} noValidate>
          <div className="space-y-1.5">
            <label htmlFor="afk-pin" className="block text-sm font-medium text-text-secondary">PIN</label>
            <input
              id="afk-pin"
              type="password"
              inputMode="numeric"
              autoFocus
              autoComplete="off"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(''); }}
              className={`${inputClass} font-mono tracking-[0.3em]`}
            />
          </div>
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
          <button
            type="submit"
            className="w-full h-11 flex items-center justify-center gap-2 rounded-sm bg-primary hover:bg-primary-hover text-on-primary text-sm font-semibold transition-colors duration-150 active:translate-y-px"
          >
            <KeyRound className="w-4 h-4" />
            Buka layar
          </button>
        </form>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={submitAdmin} noValidate>
          {!operatorLocked && <p className="text-sm text-text-muted">Lupa PIN? Operator bisa membuka layar ini dengan akun admin.</p>}
          <div className="space-y-1.5">
            <label htmlFor="afk-admin-user" className="block text-sm font-medium text-text-secondary">Username admin</label>
            <input
              id="afk-admin-user"
              type="text"
              autoFocus
              autoComplete="off"
              value={adminUser}
              onChange={(e) => { setAdminUser(e.target.value); setError(''); }}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="afk-admin-pass" className="block text-sm font-medium text-text-secondary">Password admin</label>
            <input
              id="afk-admin-pass"
              type="password"
              autoComplete="off"
              value={adminPass}
              onChange={(e) => { setAdminPass(e.target.value); setError(''); }}
              className={`${inputClass} font-mono`}
            />
          </div>
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
          <button
            type="submit"
            className="w-full h-11 flex items-center justify-center gap-2 rounded-sm bg-surface-2 border border-hairline-strong text-text-primary text-sm font-semibold hover:bg-surface-3 transition-colors duration-150 active:translate-y-px"
          >
            <ShieldCheck className="w-4 h-4" />
            Buka sebagai operator
          </button>
        </form>
      )}
    </>
  );
};
