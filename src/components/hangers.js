// ── WHAT HOLDS THE PIPE UP ──────────────────────────────────────────────────
// Two things hang off a support point and they behave completely differently,
// which is the whole story of this module.
//
// A TRAPEZE is shared. One hanger — a piece of unistrut across two lengths of
// all-thread — carries six or eight circuits at once. How many a store needs
// depends on where the circuits actually route, how many of them travel
// together, whether there is headroom to double-stack past six or eight or
// whether a second run of hangers has to be built somewhere else, how far the
// drop is from the joist, and which way the bar joists happen to run.
//
// A SADDLE is not shared. Every insulated pipe rides in its own cradle at every
// point it crosses a support, so the hanger doesn't crush the insulation.
//
// Neither exists for a line run IN THE FLOOR. Those are supported by the slab,
// and a circuit flagged that way is skipped by both.
//
// The old takeoff calculated both the same way: sum every circuit's run length,
// divide by six. For saddles that is exactly right. For trapezes it is a hanger
// under every single pipe — eight circuits down the same back hall bought eight
// sets of strut and rod where the crew builds one. On thirty circuits sharing a
// route it ran roughly three times high on strut and nearly four times high on
// rod, and it carried a comment above it explaining why it was correct.
//
// So: saddles still calculate, because the arithmetic matches the thing. The
// trapeze lines do not, because no arithmetic does. From the mechanic who
// builds them: "It's really hard to auto calculate the hangers because you
// just never know till you go look." They generate at ZERO, carrying the facts
// the takeoff does know, and get filled in after somebody walks the job.
//
// A zero reads as unfinished, and the bid pre-flight says so before it prints.
// A confident wrong number reads as done.
//
// Pure — no React, no store.

// Food Lion's spec, and the most common one. It is still a SPEC: it changes by
// chain and by job, which is why it is a setting rather than a constant.
export const DEFAULT_SPACING_FT = 6;

// How many circuits ride one trapeze before it has to be doubled up or a second
// route found. Used only in the wording on the line — the app does not act on
// it, because whether there is room to double-stack is a site question.
export const CIRCUITS_PER_HANGER = '6-8';

// All-thread size. Rod, beam clamps, couplings, nuts and washers all share it,
// so it is written once rather than typed into four descriptions that can drift
// apart. 3/8" is what refrigeration trapezes run.
export const ROD_SIZE = '3/8"';

export const normalizeSpacing = (ft) => Math.max(1, Number(ft) || DEFAULT_SPACING_FT);

// The facts the takeoff can honestly state about a hanger route, for printing
// on the manual lines. Not a quantity — the arithmetic an estimator does on
// site, with the numbers already filled in.
//
// Route length is the LONGEST run (or the header, if there is one), never the
// sum: circuits that travel together travel the same feet, and adding them is
// precisely the mistake this replaces.
export function hangerBasis(circuits = [], headerHorizFt = 0, spacingFt = DEFAULT_SPACING_FT) {
  const spacing = normalizeSpacing(spacingFt);
  // In-floor lines carry nothing: "some lines might get pushed in the floor
  // and those don't need hangers". They are excluded from the route entirely,
  // not just from the count, because a store whose circuits all run in the
  // floor should generate no trapeze lines at all.
  const onRoute = circuits.filter(c =>
    !c?.isRiserOnly && !c?.inFloor && (parseFloat(c?.runLength) || 0) > 0);
  const longestRun = onRoute.reduce((m, c) => Math.max(m, parseFloat(c.runLength) || 0), 0);
  const headerFt = Number(headerHorizFt) || 0;
  const routeFt = Math.max(longestRun, headerFt);
  return {
    circuits: onRoute.length,
    longestRun: Math.round(longestRun),
    headerFt: Math.round(headerFt),
    routeFt: Math.round(routeFt),
    spacingFt: spacing,
    supportsPerRoute: routeFt > 0 ? Math.ceil(routeFt / spacing) : 0,
  };
}

export function basisText(b) {
  return `${b.circuits} circuit(s), longest run ${b.longestRun} ft`
    + (b.headerFt > 0 ? `, header ${b.headerFt} ft` : '')
    + ` — about ${b.supportsPerRoute} supports per route at ${b.spacingFt} ft`;
}

// The trapeze lines, at zero, plus the loose hardware that goes with them.
// `hangerManual: true` is what the bid pre-flight looks for — matching on
// description text would break the moment the wording improved.
//
// → [] when there is no horizontal pipe at all (a riser-only or rack-only
// scope), because there is nothing to hang.
export function hangerLines(circuits = [], headerHorizFt = 0, spacingFt = DEFAULT_SPACING_FT) {
  const b = hangerBasis(circuits, headerHorizFt, spacingFt);
  if (b.routeFt <= 0) return [];
  // Rod, beam clamps, couplings, nuts and washers are all the SAME thread, so
  // the size is written once and the whole set of lines stays consistent. 3/8"
  // is what this trade runs; a heavier trapeze that specs 1/2" is one edit on
  // each line, and every description in this app is editable.
  const R = ROD_SIZE;
  return [
    { section: 'Hardware', hangerManual: true, unit: 'ea', qty: 0, unitCost: 0, total: 0,
      desc: `Pipe Hangers / trapezes — COUNT ON SITE (${basisText(b)})` },
    { section: 'Hardware', hangerManual: true, unit: 'stick', qty: 0, unitCost: 0, total: 0,
      desc: `Unistrut — trapeze (10' sticks) — MEASURE ON SITE (5-6 ft per hanger, ${CIRCUITS_PER_HANGER} circuits each; double-stack or a second route past that)` },
    // Rod does not say MEASURE ON SITE, because that is not what happens.
    // Verifying a drop length means getting up in the ceiling with a tape, and
    // the read from the field is that most contractors won't: "they just order a
    // bundle or so depending on their own experience." Telling somebody to go
    // measure something they are not going to measure produces a zero on the
    // bid, not a measurement. So the line asks for the thing they will actually
    // give it — a bundle count off experience — and says what drives it.
    { section: 'Hardware', hangerManual: true, unit: 'stick', qty: 0, unitCost: 0, total: 0,
      desc: `${R} All-Thread Rod — ORDER FROM EXPERIENCE (2 drops per hanger; drop length is joist-to-pipe and varies with the route, longer where hangers are double-stacked. Sold in 10' sticks — switch the unit to bundle if that is how you buy it)` },
    // Beam clamps were missing from the takeoff entirely. They are how the rod
    // gets attached to the bar joist — every drop needs one — so on a store
    // with fifty hangers that is a hundred of them, at real money each. They
    // were not folded into the loose-hardware lot below; they simply were not
    // on the list.
    { section: 'Hardware', hangerManual: true, unit: 'ea', qty: 0, unitCost: 0, total: 0,
      desc: `${R} Beam clamps — bar joist attachment (2 per hanger, one per rod drop; check the spec, some jobs call for welded or bolted attachment instead)` },
    // ── FOUR LINES, NOT ONE LOT ─────────────────────────────────────────────
    // This was a single line reading "Strut Nuts, 3/8" Rod Couplings, Nuts &
    // Washers", on the reasoning written here before: nuts and washers are
    // pocket change and nobody counts them.
    //
    // From the mechanic who installs them: "the nuts, washers, and rod
    // couplings need to be separated."
    //
    // They are not one thing. A strut nut and a rod coupling are different
    // parts at different prices from different bins, and a lot line priced as
    // a guess cannot be checked against a supplier quote — which is what the
    // materials list is for. Bundling them made the cheap ones invisible and
    // the coupling, which is not cheap, invisible with them.
    //
    // All four are hangerManual so the pre-flight lists them. Four zeros
    // nobody is told about is worse than the one zero this replaced.
    { section: 'Hardware', hangerManual: true, unit: 'ea', qty: 0, unitCost: 0, total: 0,
      desc: 'Strut Nuts — channel nuts, strut-to-rod and clamp-to-strut' },
    { section: 'Hardware', hangerManual: true, unit: 'ea', qty: 0, unitCost: 0, total: 0,
      desc: `${R} Rod Couplings — rod-to-rod splices; how many depends on drop length and how rod is cut` },
    { section: 'Hardware', hangerManual: true, unit: 'ea', qty: 0, unitCost: 0, total: 0,
      desc: `${R} Hex Nuts` },
    { section: 'Hardware', hangerManual: true, unit: 'ea', qty: 0, unitCost: 0, total: 0,
      desc: `${R} Flat Washers` },
  ];
}

// ── A SADDLE IS SIZED TO THE INSULATION, NOT TO THE COPPER ──────────────────
// The takeoff named these after the pipe inside them — "1-3/8" Pipe Saddles",
// "7/8" Pipe Saddles" — which is not a thing anybody can order. From the
// mechanic: "for saddles can they be changed to 2", 3", 4" and so on."
//
// A saddle goes around the FINISHED line: copper plus insulation on both
// sides. Two lines of different copper land in the same saddle, and one copper
// size lands in two different saddles depending on how thick the insulation is
// — which on a refrigeration job means depending on whether it is low temp.
// His spec, verbatim:
//
//   2"   5/8 copper with 1/2" insulation, and below
//   3"   medium temp 7/8 - 1-1/8 with 3/4" insulation
//   4"   1-3/8 - 1-5/8 with 3/4", and smaller low-temp runs with 1"
//   5"   anything larger
//
// Encoded as the geometry rather than as a lookup of his four sentences, so a
// size he did not list still lands somewhere defensible. The breakpoints below
// reproduce every case he gave — including the one that proves the model:
// 7/8 low temp and 1-3/8 medium temp both finish at 2.875" and both take a 4".
// ── INSULATION IS A FUNCTION OF THE LINE'S JOB, NOT JUST ITS SIZE ───────────
// The first version of this read his "5/8 copper with 1/2" insulation and
// below" as a rule about SIZE, and applied it to anything 5/8 or smaller
// whatever the line was doing. Corrected by the mechanic:
//
//   "Low temp is always 1" insulation no matter the size on the suction.
//    Liquid line is still 1/2"."
//
// So there are three cases, and size only decides one of them:
//
//   low temp suction    1"     always, at every size
//   liquid              1/2"   always  (medium-temp liquid is not insulated
//                                       at all, so it never reaches here)
//   medium temp suction 1/2" at 5/8 and below, 3/4" above
//
// What this changes from the size-only reading: a small low-temp suction line
// was getting 1/2" and a 2" saddle, and takes 1" and a 3". A low-temp liquid
// line above 5/8 was getting 1" and is 1/2".
export const SMALL_LINE_MAX_OD = 0.625;   // 5/8 and below, medium-temp suction
export const INSULATION_WALL = { small: 0.5, medium: 0.75, low: 1, liquid: 0.5 };
// Finished outside diameter at or under `maxOd` takes `size`; past the last
// one, the largest saddle.
export const SADDLE_BREAKS = [
  { maxOd: 1.625, size: 2 },
  { maxOd: 2.625, size: 3 },
  { maxOd: 3.125, size: 4 },
];
export const LARGEST_SADDLE = 5;

// "1-3/8" → 1.375. Returns 0 for anything unreadable, which the caller has to
// handle rather than price.
export function copperOd(size) {
  const s = String(size ?? '').replace(/"/g, '').trim().replace(/\s+/g, '-');
  if (!s) return 0;
  const m = /^(?:(\d+)-)?(\d+)\/(\d+)$/.exec(s);
  if (m) {
    const den = Number(m[3]);
    if (!den) return 0;
    return (m[1] ? Number(m[1]) : 0) + Number(m[2]) / den;
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function insulationWall(size, tempType, role = 'suction') {
  const od = copperOd(size);
  if (!(od > 0)) return 0;
  if (role === 'liquid') return INSULATION_WALL.liquid;
  if (tempType === 'low') return INSULATION_WALL.low;
  return od <= SMALL_LINE_MAX_OD ? INSULATION_WALL.small : INSULATION_WALL.medium;
}

// → 2 | 3 | 4 | 5, or 0 when the copper size cannot be read.
export function saddleSizeFor(size, tempType, role = 'suction') {
  const od = copperOd(size);
  if (!(od > 0)) return 0;
  const finished = od + 2 * insulationWall(size, tempType, role);
  for (const b of SADDLE_BREAKS) if (finished <= b.maxOd + 1e-9) return b.size;
  return LARGEST_SADDLE;
}

// ── WHAT A SADDLE COSTS ──────────────────────────────────────────────────────
// "let's start at $2 for the 2" and go up a dollar for each inch."
//
// This was one flat $3.00 for every saddle on the job, which was survivable
// while the line was named after the copper and nobody could tell the sizes
// apart. Now that a store generates 2" through 5" lines separately, charging
// the same for all of them is a visible error rather than a hidden one.
export const SMALLEST_SADDLE = 2;
export const SADDLE_BASE_PRICE = 2;
export const SADDLE_PRICE_PER_INCH = 1;
export const SADDLE_SIZES = [2, 3, 4, 5];

export function saddlePrice(saddleSize) {
  const n = Number(saddleSize) || 0;
  if (!(n >= SMALLEST_SADDLE)) return 0;
  return SADDLE_BASE_PRICE + (n - SMALLEST_SADDLE) * SADDLE_PRICE_PER_INCH;
}

// Saddles, which DO calculate. One per pipe per support point over every
// insulated horizontal run — suction at both temperatures, plus low-temp
// liquid. Risers are strapped, not saddled.
//
// normalize: the app's pipe-size normalizer, passed in so this module stays
// free of store imports.
//
// → [{ pipeSize, qty }] sorted by size, for the caller to turn into line items.
// `medLiquid` says whether this job insulates medium-temp liquid. A saddle
// exists to stop a hanger crushing insulation, so an uninsulated line does not
// take one — but that WAS hardcoded as "medium-temp liquid is never
// insulated", which is not true: it is not insulated in conditioned space and
// is in unconditioned space, and most shops bid all of it. The two questions
// have to move together or the job buys insulation with nothing to hold it.
export function saddleCounts(circuits = [], spacingFt = DEFAULT_SPACING_FT, normalize = (s) => String(s || ''), medLiquid = false) {
  const spacing = normalizeSpacing(spacingFt);
  const bySaddle = new Map();
  for (const c of circuits) {
    if (c?.isRiserOnly) continue;
    // Nothing in the floor rides in a saddle either — a saddle exists to stop
    // a hanger crushing insulation, and there is no hanger.
    if (c?.inFloor) continue;
    const run = parseFloat(c?.runLength) || 0;
    if (run <= 0) continue;
    const add = (size, tempType, role) => {
      if (!size) return;
      // 0 means the size could not be read. It is NOT dropped: a line that
      // exists and cannot be sized is a thing the estimator has to see, and
      // the old version at least printed the raw string. It groups under a
      // saddle size of 0 and the caller says so on the line.
      const saddle = saddleSizeFor(size, tempType, role);
      const e = bySaddle.get(saddle)
        || { saddleSize: saddle, ft: 0, covers: new Set() };
      e.ft += run;
      // The ROLE is on the label because it is now half the sizing: the same
      // 7/8 in the same circuit takes a different saddle as suction than as
      // liquid, and a line reading only "7/8 LT" could not be checked.
      e.covers.add(`${normalize(size)}" ${tempType === 'low' ? 'LT' : 'MT'} ${role}`);
      bySaddle.set(saddle, e);
    };
    add(c.sucHoriz, c.tempType, 'suction');
    // Low-temp liquid is always insulated. Medium-temp liquid is insulated
    // when the job says so, and then it needs a cradle like anything else.
    if (c.tempType === 'low' || medLiquid) add(c.liqHoriz, c.tempType, 'liquid');
  }
  return [...bySaddle.values()]
    .sort((a, b) => a.saddleSize - b.saddleSize)
    .map(e => ({
      saddleSize: e.saddleSize,
      ft: e.ft,
      qty: Math.ceil(e.ft / spacing),
      // What copper ended up in this saddle, so the estimator can check the
      // sizing on the line instead of taking it on faith.
      covers: [...e.covers].sort(),
    }));
}
