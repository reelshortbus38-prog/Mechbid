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
// The times are a different question from the materials, and they have had two
// pairs of eyes: his foreman checked the brazing units on one occasion, and
// somebody who has estimated jobs has been involved throughout the app's
// development.
//
// WHAT IS STILL MISSING IS NOT AN OPINION, IT IS A JOB. No number here has been
// bid with, won, built, and checked against the timesheet that came back. Every
// 'confirmed' means "somebody who knows this work says the figure looks right",
// which is worth a great deal and is still not evidence.
//
// That gap is the one components/laborHistory.js exists to close, and it closes
// per shop: record what a job was bid at and what it took, and after a few the
// units stop being anybody's opinion and start being that shop's measurement.
// ── AND WHEN TWO PEOPLE WHO DO THE WORK DISAGREE ────────────────────────────
// 'disputed' is not a worse 'unconfirmed'. Unconfirmed means nobody has
// checked. Disputed means two qualified people HAVE, and they do not agree —
// which is strictly more information and strictly less certainty, and the one
// state that must never be rounded off to either neighbour.
//
// It exists because the brazing times were marked ✓ confirmed on one working
// foreman's read, and a second reviewer — an estimator, on 2026-09-12 — put a
// large braze joint at 0.15 hr against the 1.1 hr standing here. That is 7×.
// Joints dominate this estimate, so it is the difference between a 341
// man-hour bid and a 217 man-hour one on a twenty-circuit store.
//
// Neither of them is being overruled by an app, and leaving a ✓ on a figure
// that is in open dispute would be the app claiming a confidence nobody has.
// See docs/labor-review-2026-09-12.md for the review as it was given.
const BRAZE_DISPUTE = 'A working foreman read these as right where they stand. A second reviewer, estimating, '
  + 'puts a large joint at 0.15 hr against the 1.1 hr here — about 7× apart, and joints dominate this '
  + 'estimate. Nothing has been changed on that: one reading does not settle it, and on a twenty-circuit '
  + 'store the two answers are 341 man-hours and 217. Worth resolving before a bid leans on it.';

// The per-foot rate is the one number here that is not somebody's opinion, and
// it took two people to get there. The estimator measured a day; the mechanic
// who runs the pipe said the size split is not real for the sizes they run,
// which is what turned a single figure with no bucket attached into a figure
// for all three.
const PER_FT_MEASURED = '0.075 hr/ft, from a counted day: 400 ft, three men, ten hours. All three sizes carry '
  + 'the same number on purpose — for the sizes actually run (1/2"-7/8" liquid, 5/8"-1 5/8" suction) the '
  + 'mechanic who runs it says "the time is pretty much the same, it\'s the materials that changes the price", '
  + 'and the part that DOES vary with size, the brazing, is charged separately. One day on one job is not a '
  + 'body of evidence — but it is a job, which is more than anything else in this table stands on.';

export const UNIT_PROVENANCE = {
  perJointSmall: { state: 'disputed', note: BRAZE_DISPUTE },
  perJointMed:   { state: 'disputed', note: BRAZE_DISPUTE },
  perJointLarge: { state: 'disputed', note: BRAZE_DISPUTE },
  perCase: {
    state: 'varies',
    note: 'A working estimator would not put one number on this: "it\'s always different, too many variables." '
      + 'Treated as a placeholder allowance, not an estimate — check it against the cases this job actually has.',
  },
  // Settled, and settled by two people rather than one. The measured day gave
  // the number; the installing mechanic's read that the size split is not real
  // for the sizes they run is what said the number applies to all three rows.
  // Neither answer alone was usable — a day with no pipe size attached could
  // have belonged to any bucket.
  perFtSmall:  { state: 'confirmed', note: PER_FT_MEASURED },
  perFtMed:    { state: 'confirmed', note: PER_FT_MEASURED },
  perFtLarge:  { state: 'confirmed', note: PER_FT_MEASURED },
  perRackTie:  { state: 'unconfirmed', note: 'Not yet checked against a finished job. This is a CIRCUIT landing on the rack, one per circuit — not setting the rack itself, which is perRackSet.' },

  // ── THE THREE THAT WERE NOT IN THE BID AT ALL ─────────────────────────────
  perRackCommission: {
    state: 'varies',
    note: 'The one figure two independent sources agree on: 24-48 hr per rack, from the 2026-09-12 review and '
      + 'from the PRD, arrived at separately. It is marked as varying because BOTH gave a range rather than a '
      + 'number — a 2x spread is the honest answer here, and 36 is the middle of it, not a measurement. On a '
      + 'two-rack store this is 48-96 man-hours the app previously did not charge for at all.',
  },
  perRackSet: {
    state: 'confirmed',
    note: 'SETTING THE RACK IN PLACE — and only that. It read as an 8-12x dispute against the PRD\'s 16-24 hr '
      + 'until the mechanic settled it: "that 2 hour is for setting the rack in place." The two figures were '
      + 'never in conflict, they were describing different scopes, so the PRD number is not a competing answer '
      + 'to this question and is not recorded as one. What is NOT in here: offloading the rack, getting it into '
      + 'the building and through the store. That is a crane or a rigging crew, and it belongs in '
      + 'Subcontractors or Rentals, not in a man-hour unit — the Proposal step already carries crane/rigging as '
      + 'a pass-through.',
  },
  perWalkInPanel: {
    state: 'disputed',
    note: 'Setting one walk-in panel. The 2026-09-12 review says 0.45 hr; the PRD says 1.5-2 hr — 3-4x apart. '
      + 'The reviewer\'s figure is the default because he is a named estimator who bids these and the PRD is '
      + 'not attributed to anybody. Panels multiply fast, so on a box with forty of them the two answers are 18 '
      + 'man-hours and 60-80. Worth asking the same question that settled the rack set: what does each figure '
      + 'cover? A gap that wide is often two people describing different scopes rather than disagreeing.',
  },
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

export const PROVENANCE_MARK = { confirmed: '✓', varies: '~', unconfirmed: '?', disputed: '!' };

export function provenanceOf(key) {
  return UNIT_PROVENANCE[key] || { state: 'unconfirmed', note: 'Not yet checked against a finished job.' };
}

// One line for the estimator card: how much of what it just priced is standing
// on a number nobody has checked.
export function unitsConfidence(keys = Object.keys(UNIT_PROVENANCE)) {
  // Every state PROVENANCE_MARK knows about starts at zero. Seeding this from
  // the marks rather than by hand is what stops a new state landing on an
  // undefined and tallying NaN — which is what "0 unconfirmed" would look like
  // on screen, and it would look like good news.
  const tally = {};
  for (const state of Object.keys(PROVENANCE_MARK)) tally[state] = 0;
  keys.forEach(k => { tally[provenanceOf(k).state] += 1; });
  return tally;
}
