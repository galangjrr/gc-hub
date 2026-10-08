// PC names are the booth's identity on the LAN and in the cloud, so the server (add and rename), the
// booth (rename it applies to itself) and the cashier UI all check them with this one rule.
// Free-form names like "PC-Mokiya" are allowed; the LAN layer matches names case-insensitively.
const PC_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,23}$/;

export function pcNameError(name: unknown): string | null {
  if (typeof name !== 'string' || !PC_NAME_RE.test(name.trim())) {
    return 'Nama PC 1 sampai 24 karakter: huruf, angka, spasi, strip, atau garis bawah.';
  }
  return null;
}
