// ── A MULTIPLIER THAT CANNOT CHARGE THE SAME SLOWDOWN TWICE ──────────────────
// "We don't use multipliers so if you think it should be an option then make it
// one." — the mechanic whose numbers this app runs on.
//
// So it is an option, and it ships OFF. What follows is the reason it has the
// shape it has, because a condition multiplier is one of the easier ways to put
// forty thousand dollars of air into a bid.
//
// THE TRAP. `unitReliability` in laborMethod.js already tells the estimator
// that remodel hours "vary most here… no per-foot rate captures the
// difference." True, and the obvious fix is a dial: ×1.3 for a remodel. That
// fix is wrong as stated, and the review on 2026-09-12 walked straight into the
// same hole from the other side — a 30-45% crew-efficiency derate, worth about
// +$44,000 on a twenty-circuit store, applied on top of a rate that already had
// the inefficiency inside it.
//
// The app's per-foot rate is 0.075 hr/ft because three men ran 400 ft in a ten
// hour day. That is an OBSERVED rate. Whatever that day's conditions were —
// live store, closed store, empty building — the conditions are already in the
// number. Multiplying it by a live-store factor charges the live store twice if
// that day WAS a live store, and correctly if it was not, and the app has no
// way to tell which from the number alone.
//
// THE FIX IS NOT A BIGGER WARNING, IT IS AN ARITHMETIC ONE. A factor is only
// meaningful as a RATIO between two sets of conditions: the ones your units
// were measured under, and the ones on the job in front of you. Same conditions
// → ×1.00, and there is nothing to add because it is already in there. That
// makes the double-count structurally impossible rather than something the
// estimator has to remember.
//
// It also runs the other way, which is the half nobody builds. If your units
// came off a live-store remodel and you are bidding a ground-up store, the
// honest factor is BELOW one — those units are too slow for this job, and a
// dial that only ever goes up would quietly leave you high on every clean run
// you bid.
//
// THIS IS ALSO HOW THE PUBLISHED METHOD WORKS. MCAA's labor factors — the
// standard reference for this in mechanical contracting — are a measure of
// productivity lost against an UNIMPACTED baseline: the conditions the bid
// assumed. Their "joint occupancy" factor (work performed in a facility
// occupied by others, not anticipated at bid) runs 5% minor, 12% average, 20%
// severe, and "beneficial occupancy" — working over and around the owner's own
// people and running equipment — is the factor that describes a grocery store
// that never closed. The percentages are not the point here; the baseline is.
// A factor with no stated baseline is not a number.
//
// WHAT THIS FILE WILL NOT DO. It ships every factor at zero. Nobody has given
// this app a usable one: the review was asked for three multipliers and
// answered in flat hours ("10 hr"), which cannot scale with the size of a
// store, and gave live-store and closed-store the SAME figure when the whole
// reason that pair is on the sheet is that they differ. A number nobody has
// quoted does not belong in a bid, so the app carries the structure and the
// estimator supplies the figure.
//
// Sources for the note shown on screen:
//   https://www.mcaa.org/wp-content/uploads/2020/06/How-to-use-the-MCAA-labor-productivity-factors.pdf
//   https://sjcivil.com/quantifying-the-loss-in-labor-productivity-the-mcaa-factors/

// The ladder. Three rungs, ordered easiest to hardest, and the order matters
// only for presentation — the arithmetic reads the percentages, not the index.
export const CONDITIONS = [
  {
    key: 'new',
    label: 'Ground-up — empty building',
    short: 'Ground-up',
    note: 'A clean run through a building nobody is using yet. No existing pipe to work around, '
      + 'no cases running, nobody else in the aisle.',
  },
  {
    key: 'closed',
    label: 'Remodel — store closed while you work',
    short: 'Closed remodel',
    note: 'Existing pipe and equipment in the way, but the store is shut — no customers, '
      + 'and nothing running that you have to keep running.',
  },
  {
    key: 'live',
    label: 'Remodel — store open and running',
    short: 'Live store',
    note: 'Working over and around the owner\'s people and equipment, cases still cold, '
      + 'open until close. The hardest version of the same scope.',
  },
];

export const CONDITION_KEYS = CONDITIONS.map(c => c.key);

export function isCondition(key) {
  return CONDITION_KEYS.includes(String(key || ''));
}

export function conditionOf(key) {
  return CONDITIONS.find(c => c.key === key) || null;
}

export function conditionLabel(key) {
  return conditionOf(key)?.label || '';
}

export function conditionShort(key) {
  return conditionOf(key)?.short || '';
}

// Percent ADDED over a clean ground-up run. All zero on purpose — see the top
// of this file. Ground-up is the bottom of the ladder and is always zero: it is
// what the other two are measured against, not a rung with its own factor.
export const DEFAULT_CONDITION_PCT = { new: 0, closed: 0, live: 0 };

// Offered on screen as a starting point where the estimator has nothing of
// their own. NOT a default, and not shipped into anybody's bid.
export const MCAA_JOINT_OCCUPANCY = { minor: 5, average: 12, severe: 20 };

// A percentage, as a plain fraction. Clamped below at -90% because a factor
// that drives hours to zero or negative is a typo, not an estimate, and the
// bid should not quietly follow it there.
function pctFraction(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-90, n) / 100;
}

// The ratio between two rungs. This is the whole idea: what is charged is the
// DIFFERENCE between the conditions your units describe and the conditions of
// this job. Equal rungs return exactly 1.
export function conditionMultiplier(jobKey, basisKey, pct = {}) {
  if (!isCondition(jobKey) || !isCondition(basisKey)) return 1;
  if (jobKey === basisKey) return 1;
  const p = { ...DEFAULT_CONDITION_PCT, ...(pct || {}) };
  const den = 1 + pctFraction(p[basisKey]);
  if (!(den > 0)) return 1;
  return (1 + pctFraction(p[jobKey])) / den;
}

// What conditions is THIS job in? An explicit answer wins. Otherwise the
// project type already on the job gives two of the three rungs — a new store is
// ground-up, a remodel is at least a closed one — and never guesses the live
// store, because "open until close" is the expensive rung and the app should
// not put anybody on it uninvited.
export function jobConditionsOf(state = {}) {
  if (isCondition(state.jobConditions)) return state.jobConditions;
  return (state.projectType || 'remodel') === 'new' ? 'new' : 'closed';
}

// What conditions the shop's own units were measured under. There is no
// default and there must not be one: the app does not know whether the counted
// 400 ft day was a live store or an empty building, and assuming either is the
// double-count this file exists to prevent. Unset means "leave the hours
// alone", which is exactly right until somebody answers.
export function unitsBasisOf(profileOrState = {}) {
  const b = profileOrState?.unitsBasis;
  return isCondition(b) ? b : null;
}

// ── THE ONE FUNCTION THE BID CALLS ───────────────────────────────────────────
// Given the hours a unit build-up produced, say what — if anything — the
// conditions change about them, and say WHY in words the estimator can check.
//
// Every path returns the hours. There is no path that returns nothing and lets
// a caller fall through to an undefined.
export function conditionAdjustment({
  hours = 0, jobConditions = null, unitsBasis = null, pct = DEFAULT_CONDITION_PCT,
} = {}) {
  const base = Math.max(0, Number(hours) || 0);
  const flat = {
    applies: false, multiplier: 1, baseHours: base, adjustedHours: base, deltaHours: 0,
    jobKey: isCondition(jobConditions) ? jobConditions : null,
    basisKey: isCondition(unitsBasis) ? unitsBasis : null,
  };

  if (!isCondition(unitsBasis)) {
    return {
      ...flat,
      reason: 'no-basis',
      note: 'These hours are not adjusted for job conditions, because the app has not been told what '
        + 'conditions your labor units describe. A factor only means something against a baseline — '
        + 'set the conditions your numbers were measured under and the app can price the difference '
        + 'between that job and this one.',
    };
  }
  if (!isCondition(jobConditions)) {
    return { ...flat, reason: 'no-job', note: 'No conditions set for this job, so the units are used as they stand.' };
  }
  if (jobConditions === unitsBasis) {
    return {
      ...flat,
      reason: 'same',
      note: `Your labor units were measured on a ${conditionShort(unitsBasis).toLowerCase()} job and this is a `
        + `${conditionShort(jobConditions).toLowerCase()} job — the same conditions, so nothing is added. `
        + 'Whatever those conditions cost is already inside the units.',
    };
  }

  const multiplier = conditionMultiplier(jobConditions, unitsBasis, pct);
  if (!(multiplier > 0) || Math.abs(multiplier - 1) < 0.0005) {
    return {
      ...flat,
      reason: 'flat',
      note: `This job is a ${conditionShort(jobConditions).toLowerCase()} against units measured on a `
        + `${conditionShort(unitsBasis).toLowerCase()} job, but both conditions carry the same factor, `
        + 'so there is no difference to price. Set the factors below if that is not right.',
    };
  }

  const adjusted = base * multiplier;
  const delta = adjusted - base;
  const pctMove = Math.round(Math.abs(multiplier - 1) * 1000) / 10;
  const dir = multiplier > 1 ? 'harder' : 'easier';
  return {
    applies: true,
    multiplier,
    baseHours: base,
    adjustedHours: Math.round(adjusted * 10) / 10,
    deltaHours: Math.round(delta * 10) / 10,
    jobKey: jobConditions,
    basisKey: unitsBasis,
    reason: 'adjusts',
    note: `Your units were measured on a ${conditionShort(unitsBasis).toLowerCase()} job. This one is a `
      + `${conditionShort(jobConditions).toLowerCase()} — ${pctMove}% ${dir}, by your own factors. `
      + `Only the difference is priced: ×${multiplier.toFixed(3)}, not the full condition. `
      + (multiplier > 1
        ? 'Whatever the units already had in them stays in them and is not charged again.'
        : 'This job is cleaner than the one your numbers came off, so the factor runs below one — '
          + 'those units are too slow for this work.'),
  };
}

// One line for a summary row. Null when there is nothing to say, so a caller
// can render it or not without repeating the rules.
export function conditionLine(adj) {
  if (!adj?.applies) return null;
  const sign = adj.deltaHours >= 0 ? '+' : '−';
  return `Job conditions ×${adj.multiplier.toFixed(3)} — ${conditionShort(adj.basisKey)} units on a `
    + `${conditionShort(adj.jobKey).toLowerCase()} job (${sign}${Math.abs(adj.deltaHours).toFixed(1)} man-hrs)`;
}

// Whether the estimator has told the app anything at all here. Drives whether
// the settings card nags.
export function conditionsConfigured(profile = {}) {
  const pct = profile?.conditionPct || {};
  return isCondition(profile?.unitsBasis)
    || CONDITION_KEYS.some(k => Number(pct[k]) > 0);
}
