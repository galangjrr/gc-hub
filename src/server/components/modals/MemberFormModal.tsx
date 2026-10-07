import React, { useState } from 'react';
import { MemberAccount } from '../../../shared/types';
import { Modal, Field, INPUT, BTN_PRIMARY, BTN_SECONDARY } from '../settingsUi';
import { cn } from '../../../shared/ui/utils';

interface MemberFormModalProps {
  isOpen: boolean;
  member?: MemberAccount | null;
  onClose: () => void;
  onSave: (memberData: Partial<MemberAccount> & { password?: string }) => void;
}

export const MemberFormModal: React.FC<MemberFormModalProps> = ({
  isOpen, member, onClose, onSave
}) => {
  const [username, setUsername] = useState(member?.username || '');
  const [firstName, setFirstName] = useState(member?.firstName || '');
  const [lastName, setLastName] = useState(member?.lastName || '');
  const [password, setPassword] = useState('');
  const [groupName, setGroupName] = useState(member?.groupName || 'Reguler');
  const [money, setMoney] = useState<number>(member?.money || 10000);
  const [phone, setPhone] = useState(member?.phone || '');
  const [email, setEmail] = useState(member?.email || '');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    if (!member && password.trim().length < 4) return;
    onSave({
      username: username.trim(),
      password: password.trim() || undefined,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      groupName,
      money: Number(money) || 0,
      phone,
      email,
      status: 'Normal'
    });
    onClose();
  };

  return (
    <Modal
      title={member ? `Edit Member — ${member.username}` : 'Tambah Akun Member Baru'}
      onClose={onClose}
      width={460}
    >
      <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username" htmlFor="member-username">
            <input
              id="member-username"
              type="text"
              required
              disabled={!!member}
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username akun"
              className={INPUT}
            />
          </Field>

          <Field
            label="Password"
            htmlFor="member-password"
            hint={member ? 'Kosongkan jika tidak diubah' : 'Minimal 4 karakter'}
          >
            <input
              id="member-password"
              type="password"
              value={password}
              required={!member}
              minLength={member ? undefined : 4}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password login"
              className={INPUT}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nama Depan" htmlFor="member-firstname">
            <input
              id="member-firstname"
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="Nama depan"
              className={INPUT}
            />
          </Field>

          <Field label="Nama Belakang" htmlFor="member-lastname">
            <input
              id="member-lastname"
              type="text"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Nama belakang"
              className={INPUT}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Grup User" htmlFor="member-group">
            <select
              id="member-group"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              className={INPUT}
            >
              <option value="Reguler">Reguler</option>
              <option value="VIP Room">VIP Room</option>
              <option value="Gold Member">Gold Member</option>
            </select>
          </Field>

          <Field label="Saldo Awal (Rp)" htmlFor="member-balance">
            <input
              id="member-balance"
              type="number"
              min="0"
              step="1000"
              value={money}
              onChange={e => setMoney(parseInt(e.target.value, 10) || 0)}
              className={cn(INPUT, 'font-mono tabular')}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="No. Telepon" htmlFor="member-phone">
            <input
              id="member-phone"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="08xxxxxxxxxx"
              className={INPUT}
            />
          </Field>

          <Field label="Email" htmlFor="member-email">
            <input
              id="member-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nama@email.com"
              className={INPUT}
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-hairline">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>
            Batal
          </button>
          <button type="submit" className={BTN_PRIMARY}>
            Simpan Data Member
          </button>
        </div>
      </form>
    </Modal>
  );
};
