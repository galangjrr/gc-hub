import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { ADMIN_GRANT_TTL_MS, verifyAdminGrant } from '../shared/lanAuth';

// Booth side of the admin check. The UI asks for an admin login, but only main can open the gate:
// online through a server grant over a nonce main issued, offline by matching the LAN key main holds.
// The renderer never sees the LAN key, so it cannot answer either check on its own.
// ponytail: one grant covers every admin action for ADMIN_GRANT_TTL_MS; per-action grants if that is too wide.

const NONCE_TTL_MS = 30_000;
const MAX_FAILS = 5;
const LOCKOUT_MS = 60_000;

export type GateResult = { success: true } | { success: false; message: string };

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest();

export class ClientAdminGate {
  private nonce: { value: string; expiresAt: number } | null = null;
  private grantedUntil = 0;
  private fails = 0;
  private lockedUntil = 0;

  constructor(private now: () => number = Date.now) {}

  /** Fresh single-use challenge for an online admin login. */
  challenge(): string {
    const value = randomBytes(16).toString('hex');
    this.nonce = { value, expiresAt: this.now() + NONCE_TTL_MS };
    return value;
  }

  async acceptServerGrant(lanSecret: string, grant: unknown): Promise<GateResult> {
    const nonce = this.nonce;
    this.nonce = null;
    if (!nonce || nonce.expiresAt < this.now()) return { success: false, message: 'Verifikasi admin kedaluwarsa. Coba lagi.' };
    if (!(await verifyAdminGrant(lanSecret, nonce.value, grant))) return { success: false, message: 'Jawaban server tidak sah. Cek Kunci LAN di PC ini.' };
    this.grantedUntil = this.now() + ADMIN_GRANT_TTL_MS;
    return { success: true };
  }

  checkLanKey(lanSecret: string, typed: unknown): GateResult {
    if (this.lockedUntil > this.now()) return { success: false, message: 'Terlalu banyak percobaan salah. Tunggu 1 menit.' };
    if (!lanSecret) return { success: false, message: 'Kunci LAN belum diisi di PC ini.' };
    if (typeof typed !== 'string' || !typed.trim()) return { success: false, message: 'Isi Kunci LAN.' };
    // Hash first so the compare is constant time whatever the lengths
    if (!timingSafeEqual(sha256(typed.trim()), sha256(lanSecret))) {
      this.fails++;
      if (this.fails >= MAX_FAILS) {
        this.fails = 0;
        this.lockedUntil = this.now() + LOCKOUT_MS;
      }
      return { success: false, message: 'Kunci LAN salah.' };
    }
    this.fails = 0;
    this.grantedUntil = this.now() + ADMIN_GRANT_TTL_MS;
    return { success: true };
  }

  isGranted(): boolean {
    return this.grantedUntil > this.now();
  }

  revoke(): void {
    this.grantedUntil = 0;
  }
}
