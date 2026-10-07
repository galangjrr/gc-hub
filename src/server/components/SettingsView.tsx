import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Copy, FolderOpen, HardDriveDownload } from 'lucide-react';
import { api, denied, INPUT, BTN_PRIMARY, BTN_SECONDARY, BTN_GHOST, Panel, Field, ReadOnlyNote, ErrorLine, SkeletonRows, TH, TD, Modal, FOCUS } from '../../shared/ui/primitives';
import { BillingPackage, PersonalRateConfig, ShiftAuditSummary } from '../../shared/types';
import { PackagePricingView } from './PackagePricingView';
import { ConfirmModal } from '../../shared/ui/ConfirmModal';
import { rupiah } from './PcCard';
import { cn } from '../../shared/ui/utils';
import { ExePolicyEditor } from '../../shared/ui/ExePolicyEditor';
import { parseAllowPaths, EXE_MODE_LABEL, type ExeMode, type ExePolicySettings } from '../../shared/exePolicy';

// Settings page. Layout, tokens and the four UI states follow DESIGN.md sections 2 to 4.

export type SettingsTab = 'tarif' | 'staff' | 'shift' | 'keamanan' | 'aplikasi' | 'database' | 'cloud';

interface SettingsViewProps {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  packages: BillingPackage[];
  personalRates: PersonalRateConfig[];
  activePersonalRateId: string;
  onUpdatePackages: (packages: BillingPackage[]) => void;
  onUpdatePersonalRates: (rates: PersonalRateConfig[]) => void;
  onSelectActivePersonalRate: (id: string) => void;
  currentOperator: string;
  isAdmin: boolean; // gates tariff, staff, backup and cloud editing; main process enforces it too
  shiftStatus: { enabled: boolean; hasStaff: boolean };
  onToggleShift: (enabled: boolean) => void;
  onStaffChanged: () => void;
  onSwitchShift: (operator: { id: number; name: string; role: number }) => void;
  onTriggerToast: (title: string, message: string) => void;
}

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'tarif', label: 'Tarif dan Paket' },
  { id: 'staff', label: 'Staf' },
  { id: 'shift', label: 'Shift' },
  { id: 'keamanan', label: 'Kunci LAN' },
  { id: 'aplikasi', label: 'Allowlist Aplikasi' },
  { id: 'database', label: 'Backup' },
  { id: 'cloud', label: 'Cloud' },
];

// ---------- Staf ----------

interface Employee { id: number; name: string; role: number; roleText: string; phone?: string; enabled: boolean }

const ROLE_OPTIONS = [
  { value: 0, label: 'Kasir' },
  { value: 1, label: 'Manager' },
  { value: 2, label: 'Admin' },
];

type StaffForm = { id: number | null; name: string; role: number; phone: string; password: string; enabled: boolean };

const StaffModal: React.FC<{ initial: StaffForm; onClose: () => void; onSaved: (message: string) => void }> = ({ initial, onClose, onSaved }) => {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<{ field?: 'name' | 'password'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const isEdit = form.id !== null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return setError({ field: 'name', message: 'Nama login wajib diisi.' });
    if (!isEdit && !form.password.trim()) return setError({ field: 'password', message: 'Password wajib diisi untuk akun baru.' });

    setSaving(true);
    const payload = { name, password: form.password, role: form.role, phone: form.phone.trim() };
    const res = isEdit
      ? await api()?.updateEmployee?.(form.id, { ...payload, enabled: form.enabled })
      : await api()?.createEmployee?.(payload);
    setSaving(false);
    if (!res || denied(res)) return setError({ message: res?.message || 'Gagal menyimpan akun staf.' });
    onSaved(isEdit ? `Akun ${name} diperbarui.` : `Akun ${name} siap dipakai login.`);
  };

  return (
    <Modal title={isEdit ? 'Ubah Akun Staf' : 'Tambah Akun Staf'} onClose={onClose}>
        <form onSubmit={submit} className="p-4 space-y-3">
          <Field label="Nama login" htmlFor="staff-name" hint="Dipakai saat login kasir dan ganti shift." error={error?.field === 'name' ? error.message : undefined}>
            <input id="staff-name" autoFocus className={INPUT} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Contoh: Kasir Pagi" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Peran" htmlFor="staff-role">
              <select id="staff-role" className={INPUT} value={form.role} onChange={e => setForm({ ...form, role: Number(e.target.value) })}>
                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Nomor HP" htmlFor="staff-phone">
              <input id="staff-phone" className={INPUT} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="08xx" inputMode="tel" />
            </Field>
          </div>
          <Field
            label={isEdit ? 'Password baru' : 'Password'}
            htmlFor="staff-password"
            hint={isEdit ? 'Kosongkan kalau tidak diganti.' : undefined}
            error={error?.field === 'password' ? error.message : undefined}
          >
            <input id="staff-password" type="password" autoComplete="new-password" className={INPUT} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </Field>
          {isEdit && (
            <label className="flex items-center gap-2 text-[13px] text-text-primary cursor-pointer">
              <input type="checkbox" className="accent-primary w-4 h-4" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />
              Akun aktif, boleh login
            </label>
          )}
          {error && !error.field && <p role="alert" className="text-[12px] text-error">{error.message}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </form>
    </Modal>
  );
};

const StaffTab: React.FC<{ isAdmin: boolean; employees: Employee[] | null; loadError: string | null; reload: () => void; onTriggerToast: SettingsViewProps['onTriggerToast'] }> = ({ isAdmin, employees, loadError, reload, onTriggerToast }) => {
  const [editing, setEditing] = useState<StaffForm | null>(null);
  const [toDelete, setToDelete] = useState<Employee | null>(null);

  const remove = async (emp: Employee) => {
    const res = await api()?.deleteEmployee?.(emp.id);
    if (denied(res)) return onTriggerToast('Hapus Gagal', res.message);
    reload();
    onTriggerToast('Staf Dihapus', `Akun ${emp.name} sudah dihapus.`);
  };

  return (
    <>
      <Panel
        title="Akun staf"
        description="Akun untuk login konsol kasir dan ganti shift. Admin bisa mengubah tarif, staf, dan pengaturan."
        action={isAdmin && (
          <button type="button" className={BTN_PRIMARY} onClick={() => setEditing({ id: null, name: '', role: 0, phone: '', password: '', enabled: true })}>
            <Plus className="w-4 h-4" aria-hidden /> Tambah Staf
          </button>
        )}
      >
        {loadError ? <ErrorLine message={loadError} onRetry={reload} />
          : employees === null ? <SkeletonRows />
          : employees.length === 0 ? (
            <p className="text-[13px] text-text-muted">Belum ada akun staf. Tambah staf dari tombol di kanan atas kalau ada kasir yang bergantian jaga.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead className="border-b border-hairline">
                <tr>
                  <th className={TH}>Nama</th>
                  <th className={TH}>Peran</th>
                  <th className={TH}>Nomor HP</th>
                  <th className={TH}>Status</th>
                  {isAdmin && <th className={`${TH} text-right`}><span className="sr-only">Aksi</span></th>}
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id} className="border-b border-hairline last:border-b-0">
                    <td className={`${TD} font-medium text-text-primary`}>{emp.name}</td>
                    <td className={`${TD} text-text-secondary`}>{emp.roleText}</td>
                    <td className={`${TD} font-mono tabular text-text-secondary`}>{emp.phone || <span className="text-text-disabled">Tidak ada</span>}</td>
                    <td className={TD}>
                      <span className={`inline-flex items-center h-5 px-1.5 rounded-xs text-[11px] font-semibold ${emp.enabled ? 'bg-primary/15 text-primary' : 'bg-surface-carbon text-text-muted'}`}>
                        {emp.enabled ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        <button type="button" className={cn(BTN_GHOST, 'text-text-secondary hover:text-text-primary hover:bg-surface-3')}
                          onClick={() => setEditing({ id: emp.id, name: emp.name, role: emp.role, phone: emp.phone || '', password: '', enabled: emp.enabled })}>
                          Ubah
                        </button>
                        <button type="button" className={cn(BTN_GHOST, 'text-error hover:bg-error/10')} onClick={() => setToDelete(emp)}>
                          Hapus
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Panel>

      {editing && (
        <StaffModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); reload(); onTriggerToast('Akun Staf Disimpan', msg); }}
        />
      )}

      <ConfirmModal
        isOpen={!!toDelete}
        title="Hapus Akun Staf"
        description={`Hapus akun ${toDelete?.name ?? ''}?`}
        detail="Akun ini tidak bisa login ke konsol kasir lagi."
        iconType="danger"
        confirmText="Hapus"
        confirmVariant="danger"
        onConfirm={() => toDelete && remove(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </>
  );
};

// ---------- Shift ----------

const ShiftTab: React.FC<{
  isAdmin: boolean;
  currentOperator: string;
  shiftStatus: SettingsViewProps['shiftStatus'];
  employees: Employee[] | null;
  onToggleShift: SettingsViewProps['onToggleShift'];
  onSwitchShift: SettingsViewProps['onSwitchShift'];
  onTriggerToast: SettingsViewProps['onTriggerToast'];
}> = ({ isAdmin, currentOperator, shiftStatus, employees, onToggleShift, onSwitchShift, onTriggerToast }) => {
  const candidates = (employees || []).filter(e => e.enabled && e.name !== currentOperator);
  const [picked, setOperator] = useState('');
  const operator = candidates.some(c => c.name === picked) ? picked : (candidates[0]?.name ?? '');
  const [password, setPassword] = useState('');
  const [cash, setCash] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<ShiftAuditSummary | null>(null);

  useEffect(() => {
    if (!shiftStatus.enabled) return;
    api()?.getActiveShift?.().then(setSummary).catch(() => setSummary(null));
  }, [shiftStatus.enabled]);

  const handover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!operator) return setError('Pilih operator penerima shift.');
    if (!password) return setError('Password operator penerima wajib diisi.');
    if (cash.trim() === '' || Number(cash) < 0) return setError('Isi jumlah uang tunai di laci.');

    setSaving(true);
    const result = await api()?.closeShiftHandover?.({
      shiftId: summary?.currentShift?.id ?? 0,
      incomingOperator: operator,
      incomingPassword: password,
      actualEndCash: Number(cash),
      note,
      staff: currentOperator,
    });
    setSaving(false);
    if (!result?.success || !result.operator) return setError(result?.message || 'Serah terima shift gagal.');

    setError(null);
    setPassword('');
    setCash('');
    setNote('');
    onSwitchShift(result.operator);
    onTriggerToast('Shift Diganti', `Shift sekarang dipegang ${result.operator.name}.`);
    api()?.getActiveShift?.().then(setSummary).catch(() => setSummary(null));
  };

  return (
    <>
      <Panel
        title={`Sistem shift ${shiftStatus.enabled ? 'aktif' : 'mati'}`}
        description={shiftStatus.enabled
          ? 'Kasir bergantian jaga dan wajib serah terima kas saat ganti operator.'
          : shiftStatus.hasStaff
            ? 'Nyalakan kalau kasir bergantian jaga dan perlu serah terima kas.'
            : 'Warnet dijalankan admin saja. Tambah akun di tab Staf kalau nanti ada kasir.'}
        action={
          <button
            type="button"
            onClick={() => onToggleShift(!shiftStatus.enabled)}
            disabled={!isAdmin || (!shiftStatus.enabled && !shiftStatus.hasStaff)}
            title={!isAdmin ? 'Hanya admin yang bisa mengatur sistem shift' : undefined}
            className={shiftStatus.enabled ? BTN_SECONDARY : BTN_PRIMARY}
          >
            {shiftStatus.enabled ? 'Matikan Shift' : 'Aktifkan Shift'}
          </button>
        }
      >
        <p className="text-[13px] text-text-secondary">Operator sekarang: <span className="font-semibold text-text-primary">{currentOperator || 'Belum login'}</span></p>
      </Panel>

      {shiftStatus.enabled && (
        <Panel title="Serah terima shift" description="Hitung uang tunai di laci, lalu operator penerima memasukkan password-nya sendiri.">
          <form onSubmit={handover} className="space-y-3 max-w-md">
            {candidates.length === 0 ? (
              <p className="text-[13px] text-text-muted">Tidak ada operator lain yang aktif. Tambah atau aktifkan akun di tab Staf.</p>
            ) : (
              <>
                <Field label="Operator penerima" htmlFor="shift-operator">
                  <select id="shift-operator" className={INPUT} value={operator} onChange={e => setOperator(e.target.value)}>
                    {candidates.map(c => <option key={c.id} value={c.name}>{c.name} · {c.roleText}</option>)}
                  </select>
                </Field>
                <Field label="Password operator penerima" htmlFor="shift-password">
                  <input id="shift-password" type="password" autoComplete="off" className={INPUT} value={password} onChange={e => setPassword(e.target.value)} />
                </Field>
                <Field
                  label="Uang tunai di laci sekarang"
                  htmlFor="shift-cash"
                  hint={summary ? `Menurut catatan seharusnya ${rupiah(summary.expectedEndCash)}.` : undefined}
                >
                  <input id="shift-cash" type="number" min={0} inputMode="numeric" className={cn(INPUT, 'font-mono tabular')} value={cash} onChange={e => setCash(e.target.value)} placeholder="0" />
                </Field>
                <Field label="Catatan" htmlFor="shift-note">
                  <textarea id="shift-note" rows={2} className={cn(INPUT, 'h-auto py-2')} value={note} onChange={e => setNote(e.target.value)} placeholder="Opsional" />
                </Field>
                {error && <p role="alert" className="text-[12px] text-error">{error}</p>}
                <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? 'Memproses...' : 'Serahkan Shift'}</button>
              </>
            )}
          </form>
        </Panel>
      )}
    </>
  );
};

// ---------- Kunci LAN ----------

const LanKeyTab: React.FC<{ isAdmin: boolean; onTriggerToast: SettingsViewProps['onTriggerToast'] }> = ({ isAdmin, onTriggerToast }) => {
  const [lanKey, setLanKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    api()?.getSetting?.('lan_secret').then((v: string) => setLanKey(v || '')).catch(() => setLanKey(''));
  }, [isAdmin]);

  const copyKey = async () => {
    if (!lanKey) return;
    await navigator.clipboard.writeText(lanKey);
    onTriggerToast('Kunci LAN Disalin', 'Tempel kunci ini di Konfigurasi Jaringan setiap PC client.');
  };

  return (
    <Panel title="Kunci LAN client" description="Server menolak client tanpa kunci ini. Salin ke menu Konfigurasi Jaringan di setiap PC client.">
      {!isAdmin ? (
        <p className="text-[13px] text-text-muted">Kunci LAN hanya bisa dilihat akun admin, karena kunci ini membuka Mode Teknisi di PC client saat server mati.</p>
      ) : (
      <div className="flex items-center gap-2">
        {lanKey === null ? (
          <div className="flex-1 h-9 rounded-sm bg-surface-3 animate-pulse" aria-label="Memuat kunci LAN" />
        ) : lanKey ? (
          <code className="flex-1 min-w-0 px-3 py-2 rounded-sm bg-surface-3 border border-hairline font-mono text-[13px] text-text-primary break-all select-all">{lanKey}</code>
        ) : (
          <p role="alert" className="flex-1 text-[13px] text-error">Kunci LAN belum dibuat. Restart aplikasi server.</p>
        )}
        <button type="button" onClick={copyKey} disabled={!lanKey} className={BTN_SECONDARY}>
          <Copy className="w-4 h-4" aria-hidden /> Salin
        </button>
      </div>
      )}
    </Panel>
  );
};

// ---------- Allowlist aplikasi ----------

const ExeTab: React.FC<{ isAdmin: boolean; onTriggerToast: SettingsViewProps['onTriggerToast'] }> = ({ isAdmin, onTriggerToast }) => {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [managed, setManaged] = useState(false);
  const [mode, setMode] = useState<ExeMode>('off');
  const [text, setText] = useState('');
  const [overrides, setOverrides] = useState<Array<[string, ExeMode]>>([]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const s: ExePolicySettings | null = await api()?.getExePolicySettings?.();
      setManaged(!!s);
      setMode(s?.defaultMode ?? 'off');
      setText((s?.allowPaths ?? []).join('\n'));
      setOverrides(Object.entries(s?.overrides ?? {}).sort(([a], [b]) => a.localeCompare(b)));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { paths, errors } = parseAllowPaths(text);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (errors.length) return;
    setBusy(true);
    const res = await api()?.saveExePolicySettings?.({ defaultMode: mode, allowPaths: paths }).catch(() => null);
    setBusy(false);
    if (!res || denied(res)) return setSaveError(res?.message || 'Gagal menyimpan allowlist.');
    setSaveError(null);
    setManaged(true);
    setText(paths.join('\n'));
    onTriggerToast('Allowlist Disimpan', 'Setting dikirim ke semua PC yang tersambung.');
  };

  return (
    <Panel
      title="Allowlist aplikasi"
      description="Batasi exe yang boleh dibuka user bilik lewat AppLocker. Mulai dari Catat saja di satu PC lewat inspektor PC, cek log-nya, baru pakai Blokir."
    >
      {status === 'loading' ? <SkeletonRows rows={4} />
        : status === 'error' ? <ErrorLine message="Setting allowlist gagal dibaca dari database." onRetry={load} />
        : (
          <form onSubmit={save} className="space-y-4 max-w-2xl">
            {!managed && (
              <p role="status" className="px-3 py-2 rounded-sm border border-hairline bg-surface-3 text-[13px] text-text-secondary">
                Belum diatur dari server. Tiap PC memakai setting dari panel admin bilik masing-masing. Setelah disimpan di sini, semua PC ikut setting server.
              </p>
            )}
            <ExePolicyEditor
              idPrefix="server-exe"
              modeLabel="Mode default semua PC"
              mode={mode}
              onModeChange={setMode}
              pathsText={text}
              onPathsTextChange={setText}
              errors={errors}
              disabled={!isAdmin}
            />
            {overrides.length > 0 && (
              <div>
                <p className="mb-1 text-[12px] font-medium text-text-secondary">PC dengan mode sendiri</p>
                <ul className="flex flex-wrap gap-1.5">
                  {overrides.map(([pc, m]) => (
                    <li key={pc} className="px-2 h-6 inline-flex items-center rounded-[2px] bg-surface-3 text-[11px] font-mono text-text-secondary">
                      {pc}: {EXE_MODE_LABEL[m]}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[12px] text-text-muted">Ubah atau kembalikan ke default dari inspektor PC.</p>
              </div>
            )}
            {saveError && <p role="alert" className="text-[12px] text-error">{saveError}</p>}
            {isAdmin && (
              <button type="submit" disabled={busy || errors.length > 0} className={BTN_PRIMARY}>
                {busy ? 'Menyimpan...' : 'Simpan dan Kirim ke PC'}
              </button>
            )}
          </form>
        )}
    </Panel>
  );
};

// ---------- Backup ----------

interface BackupFile { name: string; sizeBytes: number; createdAt: number; kind: 'harian' | 'manual' }

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatDate = (ms: number) =>
  new Date(ms).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const BackupTab: React.FC<{ isAdmin: boolean; onTriggerToast: SettingsViewProps['onTriggerToast'] }> = ({ isAdmin, onTriggerToast }) => {
  const [data, setData] = useState<{ dir: string; files: BackupFile[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api()?.listBackups?.();
      if (!res) throw new Error();
      setData(res);
    } catch {
      setLoadError('Daftar backup tidak bisa dibaca dari folder data.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const backupNow = async () => {
    setBusy(true);
    const res = await api()?.backupNow?.();
    setBusy(false);
    onTriggerToast(res?.success ? 'Backup Selesai' : 'Backup Gagal', res?.message || 'Backup gagal.');
    if (res?.success) load();
  };

  const openFolder = async () => {
    const res = await api()?.openBackupFolder?.();
    if (denied(res)) onTriggerToast('Folder Tidak Terbuka', res.message);
  };

  return (
    <Panel
      title="Backup database"
      description="Server menyalin database sekali sehari saat menyala, dicek ulang tiap 6 jam. 14 backup harian dan 10 backup manual terakhir disimpan."
      action={
        <>
          <button type="button" onClick={openFolder} className={BTN_SECONDARY}>
            <FolderOpen className="w-4 h-4" aria-hidden /> Buka Folder
          </button>
          {isAdmin && (
            <button type="button" onClick={backupNow} disabled={busy} className={BTN_PRIMARY}>
              <HardDriveDownload className="w-4 h-4" aria-hidden /> {busy ? 'Membuat...' : 'Backup Sekarang'}
            </button>
          )}
        </>
      }
    >
      {loadError ? <ErrorLine message={loadError} onRetry={load} />
        : data === null ? <SkeletonRows />
        : (
          <>
            <p className="mb-3 text-[12px] text-text-muted">Folder: <span className="font-mono text-text-secondary break-all">{data.dir}</span></p>
            {data.files.length === 0 ? (
              <p className="text-[13px] text-text-muted">Belum ada backup. Backup harian dibuat otomatis saat server menyala, atau buat sekarang dari tombol di kanan atas.</p>
            ) : (
              <table className="w-full border-collapse">
                <thead className="border-b border-hairline">
                  <tr>
                    <th className={TH}>File</th>
                    <th className={TH}>Jenis</th>
                    <th className={`${TH} text-right`}>Ukuran</th>
                    <th className={`${TH} text-right`}>Dibuat</th>
                  </tr>
                </thead>
                <tbody>
                  {data.files.map(f => (
                    <tr key={f.name} className="border-b border-hairline last:border-b-0">
                      <td className={`${TD} font-mono text-[12px] text-text-primary`}>{f.name}</td>
                      <td className={`${TD} text-text-secondary capitalize`}>{f.kind}</td>
                      <td className={`${TD} font-mono tabular text-right text-text-secondary`}>{formatSize(f.sizeBytes)}</td>
                      <td className={`${TD} font-mono tabular text-right text-text-secondary`}>{formatDate(f.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-[12px] text-text-muted">Pemulihan belum bisa dari aplikasi. Untuk memulihkan, tutup server lalu salin file backup menggantikan gcserver.sqlite di folder data.</p>
          </>
        )}
    </Panel>
  );
};

// ---------- Cloud ----------

const isHttpsUrl = (value: string) => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};

const CloudTab: React.FC<{ isAdmin: boolean; onTriggerToast: SettingsViewProps['onTriggerToast'] }> = ({ isAdmin, onTriggerToast }) => {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api()?.getSetting?.('supabaseUrl'), api()?.getSetting?.('supabaseServiceKey')])
      .then(([u, k]) => { setUrl(u || ''); setHasKey(!!k); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed && !isHttpsUrl(trimmed)) return setError('URL harus diawali https://, misal https://xxxx.supabase.co');
    if (trimmed && !key.trim() && !hasKey) return setError('Isi Service Role Key.');

    const results = [await api()?.saveSetting?.('supabaseUrl', trimmed)];
    if (key.trim()) results.push(await api()?.saveSetting?.('supabaseServiceKey', key.trim()));
    const fail = results.find(denied);
    if (fail) return setError(fail.message);

    setError(null);
    if (key.trim()) { setHasKey(true); setKey(''); }
    onTriggerToast('Cloud Disimpan', 'Restart aplikasi server untuk mulai sinkronisasi.');
  };

  return (
    <Panel title="Sinkronisasi GC Net Hub" description="Hubungkan server ini ke web GC Net Hub supaya pemilik bisa memantau dari HP dan pelanggan bisa booking online.">
      {!loaded ? <SkeletonRows rows={2} /> : (
        <form onSubmit={save} className="space-y-3 max-w-lg">
          <fieldset disabled={!isAdmin} className="space-y-3 min-w-0">
            <Field label="Supabase project URL" htmlFor="sb-url">
              <input id="sb-url" className={cn(INPUT, 'font-mono')} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
            </Field>
            <Field
              label="Service role key"
              htmlFor="sb-key"
              hint={hasKey ? 'Sudah tersimpan. Isi hanya kalau mau mengganti.' : 'Pakai service role key, bukan anon key, supaya server bisa menulis ke database cloud.'}
            >
              <input id="sb-key" type="password" autoComplete="off" className={cn(INPUT, 'font-mono')} value={key} onChange={e => setKey(e.target.value)} placeholder={hasKey ? 'Tersimpan' : ''} />
            </Field>
          </fieldset>
          {error && <p role="alert" className="text-[12px] text-error">{error}</p>}
          {isAdmin && <button type="submit" className={BTN_PRIMARY}>Simpan</button>}
        </form>
      )}
    </Panel>
  );
};

// ---------- Page ----------

export const SettingsView: React.FC<SettingsViewProps> = ({
  tab,
  onTabChange: setTab,
  packages = [],
  personalRates = [],
  activePersonalRateId = 'prate-standard',
  onUpdatePackages,
  onUpdatePersonalRates,
  onSelectActivePersonalRate,
  currentOperator,
  isAdmin,
  shiftStatus,
  onToggleShift,
  onStaffChanged,
  onSwitchShift,
  onTriggerToast,
}) => {
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [employeesError, setEmployeesError] = useState<string | null>(null);

  const loadEmployees = useCallback(async () => {
    onStaffChanged(); // staff count decides whether shifts can be switched on
    setEmployeesError(null);
    try {
      const list = await api()?.getEmployees?.();
      setEmployees(Array.isArray(list) ? list : []);
    } catch {
      setEmployeesError('Daftar staf gagal dimuat dari database.');
    }
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = TABS[(index + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.id);
    document.getElementById(`settings-tab-${next.id}`)?.focus();
  };

  const adminOnly = tab === 'staff' || tab === 'aplikasi' || tab === 'database' || tab === 'cloud';

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-surface-1 text-text-primary overflow-hidden">
      <div className="flex-none px-6 pt-5 border-b border-hairline">
        <h1 className="text-[20px] font-semibold tracking-[-0.015em] text-text-primary">Pengaturan</h1>
        <div role="tablist" aria-label="Bagian pengaturan" className="flex gap-1 mt-3 -mb-px overflow-x-auto no-scrollbar">
          {TABS.map((t, i) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                id={`settings-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="settings-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={`flex-none h-9 px-3 border-b-2 text-[13px] font-medium transition-colors duration-150 ${FOCUS} ${on ? 'border-primary text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {tab === 'tarif' ? (
          <PackagePricingView
            packages={packages}
            personalRates={personalRates}
            activePersonalRateId={activePersonalRateId}
            onUpdatePackages={onUpdatePackages}
            onUpdatePersonalRates={onUpdatePersonalRates}
            canEdit={isAdmin}
            onSelectActivePersonalRate={onSelectActivePersonalRate}
            onTriggerToast={onTriggerToast}
          />
        ) : (
          <div className="px-6 py-5 max-w-4xl space-y-4">
            {adminOnly && !isAdmin && <ReadOnlyNote />}
            {tab === 'staff' && <StaffTab isAdmin={isAdmin} employees={employees} loadError={employeesError} reload={loadEmployees} onTriggerToast={onTriggerToast} />}
            {tab === 'shift' && (
              <ShiftTab
                isAdmin={isAdmin}
                currentOperator={currentOperator}
                shiftStatus={shiftStatus}
                employees={employees}
                onToggleShift={onToggleShift}
                onSwitchShift={onSwitchShift}
                onTriggerToast={onTriggerToast}
              />
            )}
            {tab === 'keamanan' && <LanKeyTab isAdmin={isAdmin} onTriggerToast={onTriggerToast} />}
            {tab === 'aplikasi' && <ExeTab isAdmin={isAdmin} onTriggerToast={onTriggerToast} />}
            {tab === 'database' && <BackupTab isAdmin={isAdmin} onTriggerToast={onTriggerToast} />}
            {tab === 'cloud' && <CloudTab isAdmin={isAdmin} onTriggerToast={onTriggerToast} />}
          </div>
        )}
      </div>
    </div>
  );
};
