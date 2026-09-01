// ── MAN-HOURS, AND WHO CONFIRMED THEM ────────────────────────────────────────
// Everything in the labor-unit library is a MAN-HOUR: one person, one hour. The
// arithmetic downstream has always agreed — a field task costs
// `men × hrs × per-man rate` — but nothing on screen ever said so, and the
// generator emitted every circuit as `men: 1`.
//
// A working estimator read "150 ft of copper — 1 man, 24 hrs" and asked the
// obvious question: nobody runs 150 feet alone. He is right, and the way the
// app invited him to fix it was a trap. Typing 4 into the Men box does not
// spread 24 man-hours over four people; it bills 96 man-hours. The row read as
// a crew and a duration, and it was neither.
//
// So a generated task now carries a real crew size with the hours each, and
// `men × hrs` still comes to the man-hours the units produced. Same cost,
// truthful row, and the Men box does what someone would expect.

// Split man-hours into a crew and the hours EACH of them works, such that
// men × hrs is (to two decimals) the man-hours we started with.
export function splitAcrossCrew(manHours, crewSize) {
  const total = Number(manHours) || 0;
  // A crew is whole people, at least one. A blank or nonsense value means one.
  const men = Math.max(1, Math.round(Number(crewSize) || 1));
  // Two decimals keeps men × hrs within about a cent of the man-hours at any
  // realistic crew rate. Rounding to the quarter-hour reads nicer and drifts
  // enough on a 60-circuit job to be noticed.
  const hrs = Math.round((total / men) * 100) / 100;
  return { men, hrs, manHours: Math.round(men * hrs * 100) / 100 };
}

// What a field-task row actually represents, whoever typed it.
export function manHoursOf(task) {
  return (Number(task?.men) || 0) * (Number(task?.hrs) || 0);
}

// ── WHICH OF THESE NUMBERS ANYBODY HAS ACTUALLY CHECKED ──────────────────────
// The app's other numbers are checked against a document you can point at. The
// labor units were not — they were my ballparks. Marking which have since been
// confirmed, by whom, is the difference between a number and a guess wearing a
// number's clothes, and the estimator is entitled to see which one he is
// pricing with.
export const UNIT_PROVENANCE = {
  perJointSmall: { state: 'confirmed', note: 'Confirmed by a working estimator — brazing times looked right as they stood.' },
  perJointMed:   { state: 'confirmed', note: 'Confirmed by a working estimator — brazing times looked right as they stood.' },
  perJointLarge: { state: 'confirmed', note: 'Confirmed by a working estimator — brazing times looked right as they stood.' },
  perCase: {
    state: 'varies',
    note: 'A working estimator would not put one number on this: "it\'s always different, too many variables." '
      + 'Treated as a placeholder allowance, not an estimate — check it against the cases this job actually has.',
  },
  // Halved on an estimator's read of the totals, not on a measurement. That is
  // better than the ballpark it replaced and still short of a checked number,
  // so it stays marked unconfirmed — a cut in the right direction is not the
  // same as knowing the figure.
  perFtSmall:  { state: 'unconfirmed', note: 'Halved from 0.06 — a working estimator read the circuit totals as running about double. Not yet measured against a finished job.' },
  perFtMed:    { state: 'unconfirmed', note: 'Halved from 0.09 — a working estimator read the circuit totals as running about double. Not yet measured against a finished job.' },
  perFtLarge:  { state: 'unconfirmed', note: 'Halved from 0.13 — a working estimator read the circuit totals as running about double. Not yet measured against a finished job.' },
  perRackTie:  { state: 'unconfirmed', note: 'Not yet checked against a finished job.' },
  stickLength: { state: 'unconfirmed', note: 'Assumes 20 ft hard stick at every size. Soft coil on the small sizes would mean far fewer joints than this produces.' },
  jointsPerCircuit: {
    state: 'unconfirmed',
    note: 'Joints beyond one per stick. Two covers the rack tie and the case — and nothing else, '
      + 'which means a circuit with no ells, tees, reducers or valves. Raise it to whatever this job\'s runs actually carry.',
  },
};

export const PROVENANCE_MARK = { confirmed: '✓', varies: '~', unconfirmed: '?' };

export function provenanceOf(key) {
  return UNIT_PROVENANCE[key] || { state: 'unconfirmed', note: 'Not yet checked against a finished job.' };
}

// One line for the estimator card: how much of what it just priced is standing
// on a number nobody has checked.
export function unitsConfidence(keys = Object.keys(UNIT_PROVENANCE)) {
  const tally = { confirmed: 0, varies: 0, unconfirmed: 0 };
  keys.forEach(k => { tally[provenanceOf(k).state] += 1; });
  return tally;
}
