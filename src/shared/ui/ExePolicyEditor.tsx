import React from 'react';
import { EXE_MODES, EXE_MODE_LABEL, MAX_ALLOW_PATHS, type ExeMode } from '../exePolicy';
import { INPUT, FOCUS } from './primitives';
import { cn } from './utils';

// Mode picker and extra-path list for the exe allowlist, shared by the server settings page and
// the booth admin panel. Controlled: the parent owns the values and the save action.

const MODE_HINT: Record<ExeMode, string> = {
  off: 'Tidak ada pembatasan exe.',
  audit: 'Tidak memblokir. Exe di luar daftar dicatat di Event Viewer, bagian AppLocker, EXE and DLL.',
  enforce: 'Exe di luar daftar tidak bisa dibuka user bilik. Akun administrator tetap bebas.',
};

export const BASE_ALLOWED = ['Folder Windows', 'Program Files', 'C:\\Games, D:\\Games, E:\\Games', 'Folder aplikasi bilik'];

export const ExePolicyEditor: React.FC<{
  idPrefix: string;
  mode: ExeMode;
  onModeChange: (mode: ExeMode) => void;
  pathsText: string;
  onPathsTextChange: (text: string) => void;
  errors: string[];
  disabled?: boolean;
  modeLabel?: string;
}> = ({ idPrefix, mode, onModeChange, pathsText, onPathsTextChange, errors, disabled, modeLabel = 'Mode' }) => (
  <fieldset disabled={disabled} className="space-y-3 min-w-0">
    <div>
      <legend className="block mb-1 text-[12px] font-medium text-text-secondary">{modeLabel}</legend>
      <div className="inline-flex rounded-sm border border-hairline bg-surface-3 p-0.5">
        {EXE_MODES.map(m => (
          <label
            key={m}
            className={cn(
              'relative h-8 px-3 flex items-center rounded-[2px] text-[13px] font-medium cursor-pointer transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary',
              mode === m ? 'bg-surface-1 text-text-primary shadow-[inset_0_0_0_1px_rgb(var(--gc-hairline-strong))]' : 'text-text-muted hover:text-text-primary',
              disabled && 'cursor-not-allowed opacity-60'
            )}
          >
            <input
              type="radio"
              name={`${idPrefix}-mode`}
              value={m}
              checked={mode === m}
              onChange={() => onModeChange(m)}
              className="sr-only"
            />
            {EXE_MODE_LABEL[m]}
          </label>
        ))}
      </div>
      <p className="mt-1 text-[12px] text-text-muted">{MODE_HINT[mode]}</p>
    </div>

    <div>
      <p className="mb-1 text-[12px] font-medium text-text-secondary">Selalu diizinkan</p>
      <p className="text-[12px] text-text-muted">{BASE_ALLOWED.join(', ')}.</p>
    </div>

    <div>
      <label htmlFor={`${idPrefix}-paths`} className="block mb-1 text-[12px] font-medium text-text-secondary">
        Path tambahan
      </label>
      <textarea
        id={`${idPrefix}-paths`}
        rows={5}
        spellCheck={false}
        value={pathsText}
        onChange={e => onPathsTextChange(e.target.value)}
        placeholder={'%OSDRIVE%\\Users\\*\\AppData\\Local\\Roblox\\*\nD:\\Steam\\*'}
        aria-describedby={`${idPrefix}-paths-hint`}
        aria-invalid={errors.length > 0}
        className={cn(INPUT, 'h-auto py-2 font-mono text-[12px] leading-5 resize-y', FOCUS)}
      />
      {errors.length > 0 ? (
        <ul role="alert" className="mt-1 space-y-0.5 text-[12px] text-error">
          {errors.map(e => <li key={e} className="break-all">{e}</li>)}
        </ul>
      ) : (
        <p id={`${idPrefix}-paths-hint`} className="mt-1 text-[12px] text-text-muted">
          Satu path per baris, maksimal {MAX_ALLOW_PATHS}. Untuk AppData pakai %OSDRIVE%\Users\*\AppData\Local\NamaAplikasi\*.
          Folder di sini bisa ditulis user, jadi izinkan seperlunya.
        </p>
      )}
    </div>
  </fieldset>
);
