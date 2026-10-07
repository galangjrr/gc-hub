// Parking-style personal billing: first hour in full, then every started block in full.
import assert from 'node:assert/strict';
import { calcPersonalBill, normalizeAccumulationMinutes, normalizeRoundingStep, roundDownToStep } from '../src/shared/personalBilling';

const min = (m: number, s = 0) => m * 60 + s;
const check = (rate: Parameters<typeof calcPersonalBill>[0], cases: Array<[number, number, string]>) => {
  for (const [elapsed, expected, label] of cases) assert.equal(calcPersonalBill(rate, elapsed).total, expected, label);
};

// Hourly blocks (default): every started hour billed in full.
const hourly = { firstHourPrice: 4000, nextHoursPrice: 3500 };
check(hourly, [
  [0, 4000, 'session start already bills the first hour'],
  [min(60), 4000, 'exactly 60:00 is still the first hour'],
  [min(60, 1), 7500, '60:01 starts the second hour'],
  [min(120), 7500, 'exactly 2 hours'],
  [min(120, 1), 11000, '120:01 starts the third hour'],
]);
const at47 = calcPersonalBill(hourly, min(47));
assert.equal(at47.nextTotal, 7500, 'next total at 47m');
assert.equal(at47.secondsToNext, min(13), 'next hour starts in 13 minutes');

// 30-minute blocks after the first hour, half the next-hour price each (1750 -> Rp 1.800).
const half = { ...hourly, accumulationMinutes: 30 };
check(half, [
  [min(60), 4000, '30m: first hour'],
  [min(60, 1), 5800, '30m: 60:01 bills one half-hour block, rounded up to Rp 100'],
  [min(90), 5800, '30m: 90:00 still one block'],
  [min(90, 1), 7500, '30m: 90:01 bills two blocks = full next hour'],
]);
const at75 = calcPersonalBill(half, min(75));
assert.equal(at75.secondsToNext, min(15), '30m: next block at 90:00');
assert.equal(at75.nextTotal, 7500, '30m: next total');

// 10-minute blocks: 583.33 per block, rounded up on the total.
check({ ...hourly, accumulationMinutes: 10 }, [
  [min(61), 4600, '10m: one block'],
  [min(120), 7500, '10m: six blocks equal one next hour'],
]);

// Cashier rounding step applies to the whole total (bills round up, refunds round down).
const blocks30 = { ...hourly, accumulationMinutes: 30 };
assert.equal(calcPersonalBill(blocks30, min(60, 1), 500).total, 6000, 'step 500: 5750 rounds up to 6000');
assert.equal(calcPersonalBill(blocks30, min(60, 1), 1000).total, 6000, 'step 1000: 5750 rounds up to 6000');
assert.equal(calcPersonalBill(blocks30, min(90, 1), 1000).total, 8000, 'step 1000: 7500 rounds up to 8000');
assert.equal(calcPersonalBill(blocks30, min(75), 500).nextTotal, 7500, 'step 500: next total already on a step stays');
assert.equal(calcPersonalBill({ firstHourPrice: 4050, nextHoursPrice: 3500 }, min(30), 500).total, 4500, 'step 500: odd first hour rounds up');
assert.equal(normalizeRoundingStep('500'), 500, 'step from setting string');
assert.equal(normalizeRoundingStep('250'), 100, 'unknown step falls back to 100');
assert.equal(normalizeRoundingStep(undefined), 100, 'missing step falls back to 100');
assert.equal(roundDownToStep(8750, 500), 8500, 'refund 8750 rounds down to 8500');
assert.equal(roundDownToStep(8750, 1000), 8000, 'refund 8750 rounds down to 8000');
assert.equal(roundDownToStep(-10, 100), 0, 'refund never negative');

assert.equal(normalizeAccumulationMinutes(0), 60, 'invalid falls back to 60');
assert.equal(normalizeAccumulationMinutes(90), 60, 'capped at 60');
assert.equal(normalizeAccumulationMinutes('15'), 15, 'numeric string');
assert.equal(calcPersonalBill(hourly, -5).total, 4000, 'negative elapsed clamps to start');

console.log('personal billing: all checks passed');
