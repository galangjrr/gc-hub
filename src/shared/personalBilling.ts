// Personal (postpaid) billing, parking-lot style: the first hour is billed in full from the
// first second; after 60:00 every started accumulation block is billed in full at the
// next-hours rate (block price = nextHoursPrice * blockMinutes / 60). The total is rounded up to
// the cashier rounding step (setting cashierRoundingStep: Rp 100, 500 or 1000; default 100).
// Shared by the billing engine, the tariff simulator and the PC card so all show one number.
export interface PersonalRate {
  firstHourPrice: number;
  nextHoursPrice: number;
  accumulationMinutes?: number; // block length after the first hour, 1-60, default 60
}

export interface PersonalBill {
  total: number;          // Rp charged right now
  nextTotal: number;      // Rp once the next block starts
  secondsToNext: number;  // seconds until nextTotal applies
}

export const DEFAULT_ACCUMULATION_MINUTES = 60;

export type RoundingStep = 100 | 500 | 1000;
export const DEFAULT_ROUNDING_STEP: RoundingStep = 100;

export function normalizeRoundingStep(value: unknown): RoundingStep {
  const n = Number(value);
  return n === 500 || n === 1000 ? n : DEFAULT_ROUNDING_STEP;
}

// Cash handed back (refunds) rounds down so the cashier never pays out coins it does not have.
export const roundDownToStep = (amount: number, step: RoundingStep) => Math.max(0, Math.floor(amount / step) * step);

export function normalizeAccumulationMinutes(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_ACCUMULATION_MINUTES;
  return Math.min(60, n);
}

const FIRST_HOUR_SEC = 3600;

function totalAt(firstHour: number, nextHour: number, blockSec: number, elapsed: number, step: number): number {
  const blocks = elapsed <= FIRST_HOUR_SEC ? 0 : Math.ceil((elapsed - FIRST_HOUR_SEC) / blockSec);
  const raw = firstHour + (nextHour * blocks * blockSec) / 3600;
  return Math.ceil(Math.round(raw * 100) / 100 / step) * step; // round() drops float noise like 5750.0000001
}

export function calcPersonalBill(rate: PersonalRate, elapsedSeconds: number, roundingStep: RoundingStep = DEFAULT_ROUNDING_STEP): PersonalBill {
  const firstHour = Math.max(0, Number(rate.firstHourPrice) || 0);
  const nextHour = Math.max(0, Number(rate.nextHoursPrice) || 0);
  const blockSec = normalizeAccumulationMinutes(rate.accumulationMinutes ?? DEFAULT_ACCUMULATION_MINUTES) * 60;
  const elapsed = Math.max(0, Math.floor(elapsedSeconds));

  const step = normalizeRoundingStep(roundingStep);
  const total = totalAt(firstHour, nextHour, blockSec, elapsed, step);
  const boundary = elapsed <= FIRST_HOUR_SEC
    ? FIRST_HOUR_SEC
    : FIRST_HOUR_SEC + Math.ceil((elapsed - FIRST_HOUR_SEC) / blockSec) * blockSec;
  return {
    total,
    nextTotal: totalAt(firstHour, nextHour, blockSec, boundary + 1, step),
    secondsToNext: boundary - elapsed,
  };
}
