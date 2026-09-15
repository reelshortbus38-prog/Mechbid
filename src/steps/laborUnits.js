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

// ── HOW MANY MEN IS THIS ROW, AND IS ZERO AN ANSWER? ─────────────────────────
// It is, and the app could not hear it.
//
// `parseFloat(task.men) || 1` reads a blank box as one man, which is right —
// the hours in this library are man-hours, one person for one hour, so a row
// with hours and nobody named is one man. What it ALSO does is read an explicit
// 0 as one man, because 0 is falsy and `||` cannot tell "nobody typed anything"
// from "somebody typed nothing".
//
// On a rack task that is not academic. Zeroing the crew is how an estimator
// says the GC has that one — the same gesture the scope units already honour —
// and the Men box accepted the 0, displayed the 0, and the bid charged for a
// man anyway. Eight hours at a hundred dollars is eight hundred dollars of
// labor the estimator had explicitly taken out, added back silently, with the
// screen agreeing with him and the total not.
//
// Same shape as the saved-units bug: a falsy value mistaken for a missing one.
// The rule has to be written once, where both costing functions can reach it.
export function taskMen(task, whenUnset = 0) {
  const raw = task?.men;
  if (raw === undefined || raw === null || raw === '') return whenUnset;
  const n = Number(raw);
  // Not a number at all is not an answer either — fall back rather than bill 0.
  if (!Number.isFinite(n)) return whenUnset;
  return Math.max(0, n);
}

// What a field-task row actually represents, whoever typed it.
export function manHoursOf(task, whenUnset = 0) {
  return taskMen(task, whenUnset) * (Number(task?.hrs) || 0);
}

// ── THE ROW THAT ACTUALLY REACHES THE BID ───────────────────────────────────
// Lifted out of the Generate button in Step5_Labor.jsx, and the reason is a
// mistake made three times in this repo already: a render test can prove a
// number is DRAWN on a card and cannot prove that the button produces it. The
// suite stayed green with the hydronic sizing wiring deleted, with the
// residential summary row wrong, and with the price-import supplier dropped,
// because every one of those tests was looking at the screen instead of at the
// thing that ships. The condition factor has to reach these rows or it is
// decoration, so the row-building is a function now and the test calls it.
export function circuitTaskRow(pc = {}, {
  crewSize = 2, multiplier = 1, mode = '', basisLabel = '', jobLabel = '', mintId = () => '',
} = {}) {
  const m = Number(multiplier);
  const mult = Number.isFinite(m) && m > 0 ? m : 1;
  const base = Math.max(0, Number(pc.hours) || 0);
  const manHours = Math.round(base * mult * 10) / 10;
  const { men, hrs } = splitAcrossCrew(manHours, crewSize);
  const adjusted = Math.abs(mult - 1) >= 0.0005;
  return {
    id: mintId(),
    desc: `Run & connect ${pc.circuitId || '?'}${pc.application ? ` — ${pc.application}` : ''} (${pc.ft || 0}ft)`,
    men, hrs,
    // "Auto-estimated" is load-bearing: countGeneratedTasks in laborMethod.js
    // reads it to tell a generated row from one somebody typed.
    notes: `Auto-estimated — ${manHours} man-hours over ${men} ${men === 1 ? 'man' : 'men'}`
      + (adjusted
        ? `; ${base} at unit rates ×${mult.toFixed(3)} for ${jobLabel} conditions against ${basisLabel} units`
        : ''),
    crewAssignment: {},
    mode,
  };
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
  perRackTie:  { state: 'unconfirmed', note: 'Not yet checked against a finished job. This is a CIRCUIT landing on the rack, one per circuit — not setting the rack itself, which is rackSetHrs x rackSetCrew.' },

  // ── THE THREE THAT WERE NOT IN THE BID AT ALL ─────────────────────────────
  perRackCommission: {
    state: 'varies',
    note: 'The one figure two independent sources agree on: 24-48 hr per rack, from the 2026-09-12 review and '
      + 'from the PRD, arrived at separately. It is marked as varying because BOTH gave a range rather than a '
      + 'number — a 2x spread is the honest answer here, and 36 is the middle of it, not a measurement. On a '
      + 'two-rack store this is 48-96 man-hours the app previously did not charge for at all.',
  },
  // ── THE RACK SET: A DURATION AND A CREW, NOT A MAN-HOUR FIGURE ────────────
  // These two are deliberately separate. Multiplying them into one box is how
  // this went wrong the first time: the 2 was entered as 2 MAN-hours when it
  // is two hours of clock with a crew standing there for it. Four men for two
  // hours is eight man-hours — the shipped figure was a quarter of the real
  // one, in the direction of under-billing.
  //
  // They also are not equally well known, which is the second reason to keep
  // them apart. The duration is from the man who does the work, describing the
  // operation step by step. The crew count is his estimate of it — "I'd say
  // four guys like normal" — and he said outright he was not sure. Folding a
  // guess into a measurement and reporting one number hides which half is soft.
  rackSetHrs: {
    state: 'confirmed',
    note: 'Two hours on site for the WHOLE crane operation, described first-hand: the crane arrives and sets '
      + 'up, the crew hooks on, somebody walks the driver in, they unhook, and the crew moves the rack the '
      + 'rest of the way and sets it. This is the clock, not the labor — the crew box beside it is what turns '
      + 'it into man-hours. It reconciles with the PRD\'s 16-24 hr once multiplied out, so the two were never '
      + 'as far apart as they looked.',
  },
  rackSetCrew: {
    state: 'unconfirmed',
    note: 'THE SOFT HALF, and it multiplies everything: "I\'m not sure how many crew workers are in that. '
      + 'I\'d say four guys like normal." Four is his estimate rather than a count, and the rack set costs '
      + 'whatever this says times the hours beside it — three men instead of four is a quarter off the line. '
      + 'Worth confirming against one real rack set.',
  },
  perWalkInPanel: {
    state: 'disputed',
    note: 'Setting one walk-in panel. The 2026-09-12 review says 0.45 hr; the PRD says 1.5-2 hr — 3-4x apart. '
      + 'The reviewer\'s figure is the default because he is a named estimator who bids these and the PRD is '
      + 'not attributed to anybody. Panels multiply fast, so on a box with forty of them the two answers are 18 '
      + 'man-hours and 60-80. Worth asking the same two questions that settled the rack set: what does each '
      + 'figure cover, and is it a duration or man-hours? Both of those turned out to matter there.',
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

// ── AND THE HVAC UNITS, WHICH STAND ON SOMETHING WEAKER AGAIN ───────────────
// Every refrigeration figure here came from somebody who does the work. The
// HVAC ones came off the open web in September 2026 — published industry
// ranges, no name attached, nobody who bids or installs this having looked at
// them. That is a real difference in kind, not degree, and 'unconfirmed' is
// the most any of them can honestly carry until the HVAC bidder reads them.
const WEB_SOURCED = 'Read off published industry sources in September 2026, not from anyone who bids or installs '
  + 'this work and not from a finished job. A starting point so the app produces SOMETHING for an HVAC takeoff '
  + 'instead of nothing — every hour on an HVAC job used to be hand-typed. Expect it to move once somebody who '
  + 'bids these looks at it.';

export const HVAC_PROVENANCE = {
  rtuSetHrsBase: {
    state: 'unconfirmed',
    note: `${WEB_SOURCED} The sources gave "8 to 16 hours for a two-person crew" for a 5-10 ton rooftop, `
      + 'excluding crane time. That is a DURATION with a crew beside it, which is why the hours and the men are '
      + 'separate boxes — the rack set was entered as man-hours once already, at a quarter of its real value.',
  },
  rtuSetHrsPerTon: {
    state: 'unconfirmed',
    note: `${WEB_SOURCED} Base plus per-ton, because a 3-ton swap is not three-fifths of a 5-ton: there is a `
      + 'fixed cost to getting there, opening the roof and making the connections every unit needs. Linear, and '
      + 'the sources say labor climbs faster than tonnage above about 25 tons — so it UNDER-reads on big units, '
      + 'and the card says so rather than pretending.',
  },
  rtuSetCrew: {
    state: 'unconfirmed',
    note: 'Two, which is what every source found described. It multiplies the whole unit-set line, so it is the '
      + 'one to check first on a shop that sends three.',
  },
  curbAdapterHrs: {
    state: 'unconfirmed',
    note: `${WEB_SOURCED} No source gave a figure for this separately — it is a reasoned allowance for a new `
      + 'unit that does not match the old curb, not a published number.',
  },
  ductHrsPerLb: {
    state: 'unconfirmed',
    note: `${WEB_SOURCED} Sheet metal is the one thing here quoted as a true MAN-hour rate — per man, per pound `
      + '— so it carries no crew multiplier. Published figures ran from about 44 lb/hr (0.023 hr/lb) down to '
      + 'roughly 22 sq ft/hr installed, which at 24 gauge is nearer 0.04. This sits between them. It counts the '
      + 'RECTANGULAR duct only, because that is what the takeoff weighs; spiral and flex are bought by the foot '
      + 'and by the box and are not in the pound count.',
  },
  startupHrsPerUnit: {
    state: 'unconfirmed',
    note: 'THE WEAKEST NUMBER IN THIS APP. No source gave hours for startup at all — they agree only that it '
      + 'must be its own line and never folded into the install, which is the part worth having. Four hours is '
      + 'a placeholder standing in for a real figure, and it is here so the line EXISTS to be corrected rather '
      + 'than being silently absent the way rack commissioning was.',
  },
  startupCrew: {
    state: 'unconfirmed',
    note: 'One, on the reasoning that startup is a tech with a gauge set rather than a crew. Unchecked.',
  },
};

// ── EVERY UNIT NEEDS A BOX ───────────────────────────────────────────────────
// "As long as the options are there to be edited it's ok." Said three separate
// ways across three conversations, which makes it the requirement rather than a
// preference — and it was not quite true. `coilLength` reached the bid (it is
// what decides how many joints an in-floor run has, because soft copper comes
// in a 50 ft coil rather than a 20 ft stick) and had no box anywhere. A number
// that moves a bid and cannot be corrected is the one thing this app must not
// have.
//
// These live here rather than inside the component so the guard in
// laborUnits.test.js can read them: every key in DEFAULT_LABOR_UNITS has to
// appear in exactly one of the three field lists.
export const CIRCUIT_UNIT_FIELDS = [
  { key: 'perFtSmall', label: 'Run/ft ≤7/8"' },
  { key: 'perFtMed', label: 'Run/ft 1⅛–1⅜"' },
  { key: 'perFtLarge', label: 'Run/ft ≥1⅝"' },
  { key: 'perJointSmall', label: 'Joint ≤7/8"' },
  { key: 'perJointMed', label: 'Joint 1⅛–1⅜"' },
  { key: 'perJointLarge', label: 'Joint ≥1⅝"' },
  { key: 'perCase', label: 'Case hookup' },
  { key: 'perRackTie', label: 'Rack tie-in' },
  { key: 'stickLength', label: 'Stick len (ft)' },
  // Soft copper comes in a coil, not a stick, so an in-floor run is jointed by
  // the coil length instead. 400 ft in the floor is eight joints at 50 ft and
  // twenty at 20 ft — the difference is real and it was not editable.
  { key: 'coilLength', label: 'Coil len (ft, in-floor)' },
  { key: 'jointsPerCircuit', label: 'Fittings/circuit' },
  { key: 'jointsPerRiser', label: 'Fittings/riser' },
  { key: 'clusterFactor', label: 'Bunched joint ×' },
];

export const PROVENANCE_MARK = { confirmed: '✓', varies: '~', unconfirmed: '?', disputed: '!' };

export function provenanceOf(key) {
  return UNIT_PROVENANCE[key]
    || HVAC_PROVENANCE[key]
    || { state: 'unconfirmed', note: 'Not yet checked against a finished job.' };
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
