// ── WHAT THE JOB ACTUALLY TOOK ──────────────────────────────────────────────
// Every labor unit in this app is somebody's opinion. The brazing times were
// checked with a foreman; the running rates were halved on a mechanic's read of
// the totals; the rest is reasoned. Nobody has priced a job with them, won it,
// built it, and come back to say what it really took.
//
// That is the one gap no amount of asking closes, and it is also the one thing
// a contractor is uniquely able to shut — because the number is already in
// their payroll. This is where it gets written down.
//
// WHY THIS IS WORTH MORE THAN A PUBLISHED TABLE. A labor manual gives you the
// industry's average of a job nobody has. This gives a shop ITS OWN units, from
// ITS OWN crews, on ITS OWN chains — and it improves every time they close one
// out. It is also the only version anybody will actually keep up, because the
// contractor doing the typing is the one who gets the tuned numbers.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not pretend to know WHICH unit is
// wrong. With a handful of jobs you cannot separate a per-foot rate from a
// per-joint rate — the shapes are too similar and the sample is too small, and
// a regression on four jobs would produce confident nonsense. So it reports one
// honest number and offers to scale the units by it. Which unit is off is a
// question for a lot more jobs than anybody has yet, and the module says so
// rather than guessing.
//
// Pure except for the two storage functions, which are the same localStorage
// pattern the price book uses: shop data, shared across every job, kept out of
// the per-job save.

const HISTORY_KEY = 'coldgauge_labor_history_v1';

// Below this, a ratio is one job's luck — a rained-off week, a crew that was
// short, a store that turned out to be full of surprises. Reporting a trend off
// two jobs is how a shop talks itself into the wrong number twice as fast.
export const MIN_JOBS_FOR_TREND = 3;

// Past this much disagreement between jobs, an average is not describing
// anything. Two jobs at 0.8 and 1.6 average to 1.2, which is true of neither.
export const WIDE_SPREAD = 0.5;

export function loadLaborHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

export function saveLaborHistory(records) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records || []));
    return true;
  } catch { return false; }
}

// ── THE NUMBERS, AND WHAT EACH ONE IS ───────────────────────────────────────
//   estHours      what the app said
//   bidHours      what the estimator actually bid it at
//   actHours      what the ticket or the timesheet says, in total
//   outsideHours  the part of that total this estimate never covered
//
// OUTSIDE HOURS ARE WHY A SMALL JOB CAN LIE. The circuit estimate is pipe work:
// running it, brazing it, hooking up cases, tying into the rack. It has never
// included driving to the store, staging, getting the lift, or cleaning up and
// writing the ticket. On a twenty-circuit remodel that overhead is a rounding
// error against a thousand hours. On a one-day service call it can be half the
// day — and comparing a ten-hour ticket against a five-hour pipe estimate would
// read as "the app is 50% light" when the app was right about the pipe and was
// never asked about the drive.
//
// So the total goes in as the total, the part outside the estimate goes in
// beside it, and the ratio is computed on what is actually comparable. Left at
// zero it changes nothing, which is the right answer on a big job.
//
// bidHours is here because ACTUALS TAKE MONTHS. An estimator trying this app
// out has what they bid the job at sitting in a folder this afternoon, and
// waiting for a store to be built before the app can say anything useful is
// how a trial quietly ends. So either number will drive a comparison.
//
// They are not the same question and the module never pretends they are:
//
//   against BID     — does this agree with how I estimate? Useful immediately.
//                     Matching it makes the app think like this shop. It does
//                     not make either of them right.
//   against ACTUAL  — was the estimate true? Slower, and the only one of the
//                     two that is evidence.
//
// So actuals win wherever both exist, and the basis is reported rather than
// buried.
//
// The SHAPE is kept alongside all three, because a ratio with no shape cannot
// be argued with later — an estimator looking at 1.4x wants to know whether
// that job was forty circuits or four.
export function newLaborRecord({
  id, name = '', date = '', projectType = 'remodel', mode = '',
  estHours = 0, bidHours = 0, actHours = 0, outsideHours = 0,
  circuits = 0, ft = 0, joints = 0, cases = 0, notes = '',
} = {}) {
  return {
    id: id || `lh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name, date: date || new Date().toISOString().slice(0, 10),
    projectType, mode,
    estHours: Math.max(0, Number(estHours) || 0),
    bidHours: Math.max(0, Number(bidHours) || 0),
    actHours: Math.max(0, Number(actHours) || 0),
    outsideHours: Math.max(0, Number(outsideHours) || 0),
    circuits: Math.max(0, Math.round(Number(circuits) || 0)),
    ft: Math.max(0, Math.round(Number(ft) || 0)),
    joints: Math.max(0, Math.round(Number(joints) || 0)),
    cases: Math.max(0, Math.round(Number(cases) || 0)),
    notes,
  };
}

// The fingerprint of the job currently on screen, ready to be closed out.
// Pulled from the estimate rather than re-derived, so what gets recorded is
// exactly what was priced.
export function recordFromEstimate(state = {}, est = {}) {
  const per = est.perCircuit || [];
  return newLaborRecord({
    name: state.projName || '',
    projectType: state.projectType || 'remodel',
    mode: state.mode || '',
    estHours: Number(est.totalHours) || 0,
    circuits: per.length,
    ft: per.reduce((s, p) => s + (Number(p.ft) || 0), 0),
    joints: per.reduce((s, p) => s + (Number(p.joints) || 0), 0),
    cases: Number(est.totalCases) || 0,
  });
}

// Which comparison a record can support. Actual is evidence; bid is agreement.
export const BASIS_ACTUAL = 'actual';
export const BASIS_BID = 'bid';

// What a record contributes to a comparison. The bid is taken as given — an
// estimator's number for the same scope — but a TOTAL of hours worked has the
// out-of-scope part taken off it first, or a one-day job's drive time reads as
// the units being wrong. Never below zero: outside hours larger than the total
// is a typo, not a negative job.
export function comparableHours(r, basis) {
  if (basis === BASIS_BID) return Number(r?.bidHours) || 0;
  const total = Number(r?.actHours) || 0;
  return Math.max(0, total - (Number(r?.outsideHours) || 0));
}

const hoursFor = comparableHours;

// The basis a record can actually be compared on, preferring evidence over
// agreement. → 'actual' | 'bid' | null.
export function recordBasis(r, prefer) {
  if ((Number(r?.estHours) || 0) <= 0) return null;
  const has = {
    actual: comparableHours(r, BASIS_ACTUAL) > 0,
    bid: (Number(r?.bidHours) || 0) > 0,
  };
  if (prefer && has[prefer]) return prefer;
  if (prefer) return null;
  if (has.actual) return BASIS_ACTUAL;
  if (has.bid) return BASIS_BID;
  return null;
}

const usable = (r, prefer) => recordBasis(r, prefer) !== null;

export function recordRatio(r, prefer) {
  const basis = recordBasis(r, prefer);
  if (!basis) return null;
  return hoursFor(r, basis) / r.estHours;
}

// → { jobs, estHours, actHours, ratio, low, high, spread, wide } or null.
//
// The ratio is of TOTALS, not the average of per-job ratios. A twelve-hundred
// hour store and a forty-hour callout should not carry the same weight in a
// number that is going to scale everybody's units.
export function laborHistorySummary(records = [], filter = {}) {
  const prefer = filter.basis;
  const rows = (records || []).filter(r => usable(r, prefer)).filter(r =>
    (!filter.projectType || r.projectType === filter.projectType)
    && (!filter.mode || r.mode === filter.mode));
  if (rows.length === 0) return null;

  const estHours = rows.reduce((s, r) => s + r.estHours, 0);
  const actHours = rows.reduce((s, r) => s + hoursFor(r, recordBasis(r, prefer)), 0);
  const ratios = rows.map(r => recordRatio(r, prefer));
  // A mixed set is reported as mixed rather than as whichever came first.
  const bases = [...new Set(rows.map(r => recordBasis(r, prefer)))];
  const basis = bases.length === 1 ? bases[0] : 'mixed';
  const low = Math.min(...ratios), high = Math.max(...ratios);
  const spread = high - low;
  return {
    jobs: rows.length,
    basis,
    estHours: Math.round(estHours * 10) / 10,
    actHours: Math.round(actHours * 10) / 10,
    ratio: Math.round((actHours / estHours) * 1000) / 1000,
    low: Math.round(low * 1000) / 1000,
    high: Math.round(high * 1000) / 1000,
    spread: Math.round(spread * 1000) / 1000,
    wide: spread > WIDE_SPREAD,
    enough: rows.length >= MIN_JOBS_FOR_TREND,
  };
}

// The units a scale would touch. Only the ones that produce HOURS — a stick
// length or a joint count is a quantity, not a rate, and multiplying it by 1.2
// would invent pipe rather than time.
export const SCALABLE_UNITS = [
  'perFtSmall', 'perFtMed', 'perFtLarge',
  'perJointSmall', 'perJointMed', 'perJointLarge',
  'perCase', 'perRackTie',
];

// → { factor, jobs, ratio, basis, confidence, note } or null when there is not
// enough to say anything.
//
// confidence is deliberately blunt: 'none' below the job threshold, 'weak' when
// the jobs disagree with each other by a lot, 'fair' otherwise. Nothing here
// earns the word 'good' — three jobs is three jobs.
//
// A bid-based answer is never more than 'fair' either, and its wording says
// what it is: matching an estimator makes the app agree with them, which is
// not the same as making it correct.
export function suggestedUnitScale(records = [], filter = {}) {
  const s = laborHistorySummary(records, filter);
  if (!s) return null;
  const base = { factor: s.ratio, jobs: s.jobs, ratio: s.ratio, basis: s.basis };
  const what = s.basis === BASIS_BID ? 'bid' : s.basis === 'mixed' ? 'recorded' : 'actual';
  if (!s.enough) {
    return {
      ...base, confidence: 'none',
      note: `${s.jobs} job${s.jobs === 1 ? '' : 's'} recorded — ${MIN_JOBS_FOR_TREND} is the least that says anything. `
        + 'One job is a rained-off week or a store full of surprises, not a trend.',
    };
  }
  if (s.wide) {
    return {
      ...base, confidence: 'weak',
      note: `These ${s.jobs} jobs ran between ${s.low}x and ${s.high}x the estimate. An average of `
        + `${s.ratio}x is true of none of them — look at what is different about the jobs before scaling anything.`,
    };
  }
  const caveat = s.basis === BASIS_BID
    ? ' These are BID hours, not built ones: scaling to them makes the app agree with how this shop estimates, '
      + 'which is worth having and is not the same as either of you being right. Record actual hours when the '
      + 'jobs finish and the answer stops being an opinion.'
    : s.basis === 'mixed'
      ? ' Some of these are bid hours and some are built ones — the two answer different questions, so read this '
        + 'as a rough direction rather than a measurement.'
      : '';
  return {
    ...base, confidence: 'fair',
    note: `${s.jobs} jobs, ${s.actHours} ${what} hours against ${s.estHours} estimated. `
      + `They agree within ${s.spread}x of each other, so ${s.ratio}x is a number worth applying.${caveat}`,
  };
}

// Apply a factor to the rate units and leave the quantities alone. Rounded to
// four places — a labor unit is a small number and the third decimal is real.
export function scaleLaborUnits(units = {}, factor = 1) {
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0) return { ...units };
  const out = { ...units };
  for (const k of SCALABLE_UNITS) {
    const v = Number(out[k]);
    if (Number.isFinite(v)) out[k] = Math.round(v * f * 10000) / 10000;
  }
  return out;
}
