// ── LOOKING UP A COPPER RATE WITHOUT LOSING THE LINE ─────────────────────────
// The rate tables are SNAPSHOT into a job when it is created, so extending the
// defaults does nothing for a job that already exists — it keeps whatever it
// copied, gaps and all. And the lookup was `rates?.cu?.[size] || 0`, which
// turns a size the table has never heard of into a free foot of copper.
//
// That is how a 4-1/8 suction main on a loop system priced at ZERO: not a
// wrong number, an absent one, with the footage showing on screen the whole
// time. It is the same failure as the duct sizes that converted to no metal,
// and it deserves the same treatment — fall back where a fallback exists, and
// SAY SO where one does not.
//
// Two rules:
//   A size the job has tuned wins, even if the tuned value is zero. Somebody
//   zeroing a rate on purpose is a decision, not a gap.
//   A size the job has never seen falls back to the current defaults, so an old
//   job picks up sizes added since without losing anything it had tuned.
//
// Pure — no React.

import { DEFAULT_CU_RATES, DEFAULT_INSUL_RATES } from '../state/store.js';

// → { rate, source } where source is 'job' | 'default' | 'none'.
// 'none' is the one that matters: it means nothing anywhere knows this size,
// and the caller must not quietly price it at nothing.
export function rateLookup(size, jobTable, defaultTable) {
  const key = String(size || '');
  if (!key) return { rate: 0, source: 'none' };
  const tuned = jobTable?.[key];
  if (tuned !== undefined && tuned !== null && tuned !== '') {
    return { rate: Number(tuned) || 0, source: 'job' };
  }
  const fallback = defaultTable?.[key];
  if (fallback !== undefined) return { rate: Number(fallback) || 0, source: 'default' };
  return { rate: 0, source: 'none' };
}

export const copperRate = (size, rates) => rateLookup(size, rates?.cu, DEFAULT_CU_RATES);

export const insulRate = (size, rates, category) =>
  rateLookup(size, rates?.insul?.[category], DEFAULT_INSUL_RATES[category]);

// Sizes in the takeoff that nothing can price. Named, so the estimator gets a
// list to act on rather than a total that is quietly light.
export function unratedCopperSizes(sizes = [], rates) {
  return [...new Set(sizes.map(String))].filter(s => s && copperRate(s, rates).source === 'none');
}

export function unratedNote(size) {
  return `NO RATE for ${size}" — this line is priced at $0 and is NOT in your total. `
    + 'Enter a rate in the rates panel, or the footage on screen is free copper.';
}

// ── YOU CANNOT BUY TWELVE FEET OF HARD COPPER ───────────────────────────────
// Hard drawn ACR comes in 20 ft straight lengths. A riser is short — twelve
// feet is the typical drop to a case — so the takeoff was ordering a length
// that does not exist, and doing it once per riser on the job.
//
//   "There should be a certain amount of pipe bought for any circuit with a
//    riser. 20 ft for the riser size even if the run length is short — there
//    still needs to be copper for the riser."
//
// One stick per riser, and the offcut is scrap: a 20 ft stick with a 12 ft
// riser out of it leaves 8 ft, which will not make another 12 ft riser. So
// this rounds UP per circuit rather than pooling the footage and rounding the
// total, because pooling would quietly assume the offcuts add up.
//
// Long runs are NOT rounded this way. A 150 ft main is cut from sticks
// end-to-end and the waste factor already covers the joint offcuts; it is the
// short pieces where a whole stick per piece is the real purchase.
export const HARD_STICK_FT = 20;

export function riserPurchaseFt(riserFt, stickFt = HARD_STICK_FT) {
  const ft = Number(riserFt) || 0;
  const stick = Math.max(1, Number(stickFt) || HARD_STICK_FT);
  if (ft <= 0) return 0;
  return Math.ceil(ft / stick) * stick;
}
