// Sale rules for prepaid packages, shared by the buy-package UI and the billing engine
// (the engine is the authority; the UI only hides what the engine would refuse).

export interface SaleWindowPackage {
  category?: string;
  happyHourStart?: string; // "HH:MM", local time of the server PC
  happyHourEnd?: string;
}

const toMinutes = (hhmm: string | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};

// Happy Hour packages are only sold inside their window. The window may cross midnight
// (22:00-06:00); start is inclusive, end exclusive. Same start and end means all day.
export function isPackageOnSale(pkg: SaleWindowPackage, at: Date = new Date()): boolean {
  if (pkg.category !== 'Happy Hour') return true;
  const start = toMinutes(pkg.happyHourStart);
  const end = toMinutes(pkg.happyHourEnd);
  if (start === null || end === null || start === end) return true;
  const now = at.getHours() * 60 + at.getMinutes();
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export const saleWindowText = (pkg: SaleWindowPackage) =>
  `${(pkg.happyHourStart || '').replace(':', '.')} sampai ${(pkg.happyHourEnd || '').replace(':', '.')}`;
