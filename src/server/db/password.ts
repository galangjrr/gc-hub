import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

// Format tersimpan: scrypt$<saltHex>$<hashHex>. Nilai tanpa prefix = password lama plaintext.
const PREFIX = 'scrypt$';

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  return `${PREFIX}${salt.toString('hex')}$${scryptSync(plain, salt, 32).toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): { ok: boolean; needsRehash: boolean } {
  if (!plain || !stored) return { ok: false, needsRehash: false };

  if (!stored.startsWith(PREFIX)) {
    // Legacy plaintext: bandingkan constant-time, lalu minta di-hash ulang
    const a = Buffer.from(plain);
    const b = Buffer.from(stored);
    const ok = a.length === b.length && timingSafeEqual(a, b);
    return { ok, needsRehash: ok };
  }

  const [saltHex, hashHex] = stored.slice(PREFIX.length).split('$');
  if (!saltHex || !hashHex) return { ok: false, needsRehash: false };
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(plain, Buffer.from(saltHex, 'hex'), expected.length);
  return { ok: timingSafeEqual(actual, expected), needsRehash: false };
}
