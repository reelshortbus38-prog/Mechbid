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

// ── WHICH OF THESE NUMBERS ANYBODY HAS ACTUALLY CHECKED, AND BY WHOM ────────
// The app's other numbers are checked against a document you can point at. The
// labor units were not — they were my ballparks. Marking which have since been
// confirmed, and by whom, is the difference between a number and a guess
// wearing a number's clothes.
//
// WHO HAS ACTUALLY LOOKED AT THESE. Almost everything in this app about what a
// job consists of came from a refrigeration mechanic who INSTALLS this work —
// what a case hookup is made of, where the fittings go, which lines change
// size, what runs in the floor. That is strong ground for materials and it is
// better than an estimator's read for the physical questions, because he is
// the one holding the torch.
//
// It is NOT the same as bidding knowledge. The times below were checked with
// his foreman on one occasion and are otherwise reasoned. NOBODY WHO BIDS JOBS
// FOR A LIVING HAS REVIEWED THIS APP. Until one has, every 'confirmed' here
// means "a man who does the work says the number looks right", which is worth
// a great deal and is not the same as a number that has been bid, won and
// built against.
export const UNIT_PROVENANCE = {
  perJointSmall: { state: 'confirmed', note: 'Checked with a working foreman — brazing times looked right as they stood.' },
  perJointMed:   { state: 'confirmed', note: 'Checked with a working foreman — brazing times looked right as they stood.' },
  perJointLarge: { state: 'confirmed', note: 'Checked with a working foreman — brazing times looked right as they stood.' },
  perCase: {
    state: 'varies',
    note: 'A working estimator would not put one number on this: "it\'s always different, too many variables." '
      + 'Treated as a placeholder allowance, not an estimate — check it against the cases this job actually has.',
  },
  // Halved on an installing mechanic's read of the totals, not on a measurement. That is
  // better than the ballpark it replaced and still short of a checked number,
  // so it stays marked unconfirmed — a cut in the right direction is not the
  // same as knowing the figure.
  perFtSmall:  { state: 'unconfirmed', note: 'Halved from 0.06 — a mechanic who runs this pipe read the circuit totals as about double. Not yet measured against a finished job, or against a bid.' },
  perFtMed:    { state: 'unconfirmed', note: 'Halved from 0.09 — a mechanic who runs this pipe read the circuit totals as about double. Not yet measured against a finished job, or against a bid.' },
  perFtLarge:  { state: 'unconfirmed', note: 'Halved from 0.13 — a mechanic who runs this pipe read the circuit totals as about double. Not yet measured against a finished job, or against a bid.' },
  perRackTie:  { state: 'unconfirmed', note: 'Not yet checked against a finished job.' },
  stickLength: {
    state: 'unconfirmed',
    note: '20 ft hard stick. Applies to everything overhead; a line in the FLOOR is soft copper and jointed by '
      + 'the coil instead — see coilLength.',
  },
  coilLength: {
    state: 'unconfirmed',
    note: 'Soft ACR copper arrives in coils, not sticks: "some lines might get pushed in the floor and those are '
      + 'always soft copper." Fifty feet is the common coil, so a 400 ft in-floor run is eight joints rather than '
      + 'the twenty a 20 ft stick length produced. Only applies to in-floor circuits at a size soft copper is '
      + 'actually drawn in — above about 1-1/8" there is no coil to buy and the stick length is used.',
  },
  jointsPerCircuit: {
    state: 'varies',
    note: 'Cannot be worked out from a drawing. A run ells out of the motor room, down the back hall, '
      + 'again onto the sales floor, sometimes up and over, then down to the case — and which of those a '
      + 'given circuit does is something you find out by walking it. This is an allowance until somebody has; '
      + 'a circuit with its own counted fittings uses that number instead.',
  },
  clusterFactor: {
    state: 'unconfirmed',
    note: 'What a joint costs when it is one of a bunch in the same place, as a fraction of a joint on its own. '
      + '"When you have a bunch of joints in the same place, like the end of the case, it\'s not gonna be the same '
      + 'as brazing each one and stopping to cool and check it and insulate it." The trip, the purge and the '
      + 'insulating are shared; the prep, braze, cool and check are not. 0.65 is a reasoned split of the unit, not '
      + 'a measurement — and the same estimator warned that "it takes different people different amounts of time". '
      + 'Set it to 1 to price every joint as a standalone one.',
  },
  jointsPerRiser: {
    state: 'unconfirmed',
    note: 'Added on top for a circuit with a riser — the ells up and over, and the P-trap at the bottom. '
      + 'The app can tell which circuits have one, because the riser length is on the sheet.',
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
