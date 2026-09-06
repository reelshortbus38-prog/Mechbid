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
// The old takeoff calculated both the same way: sum every circuit's run length,
// divide by six. For saddles that is exactly right. For trapezes it is a hanger
// under every single pipe — eight circuits down the same back hall bought eight
// sets of strut and rod where the crew builds one. On thirty circuits sharing a
// route it ran roughly three times high on strut and nearly four times high on
// rod, and it carried a comment above it explaining why it was correct.
//
// So: saddles still calculate, because the arithmetic matches the thing. The
// trapeze lines do not, because no arithmetic does. From the estimator who
// installs them: "It's really hard to auto calculate the hangers because you
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
  const onRoute = circuits.filter(c => !c?.isRiserOnly && (parseFloat(c?.runLength) || 0) > 0);
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
  return [
    { section: 'Hardware', hangerManual: true, unit: 'ea', qty: 0, unitCost: 0, total: 0,
      desc: `Pipe Hangers / trapezes — COUNT ON SITE (${basisText(b)})` },
    { section: 'Hardware', hangerManual: true, unit: 'stick', qty: 0, unitCost: 0, total: 0,
      desc: `Unistrut — trapeze (10' sticks) — MEASURE ON SITE (5-6 ft per hanger, ${CIRCUITS_PER_HANGER} circuits each; double-stack or a second route past that)` },
    // Rod does not say MEASURE ON SITE, because that is not what happens.
    // Verifying a drop length means getting up in the ceiling with a tape, and
    // the estimator's read is that most contractors won't: "they just order a
    // bundle or so depending on their own experience." Telling somebody to go
    // measure something they are not going to measure produces a zero on the
    // bid, not a measurement. So the line asks for the thing they will actually
    // give it — a bundle count off experience — and says what drives it.
    { section: 'Hardware', hangerManual: true, unit: 'stick', qty: 0, unitCost: 0, total: 0,
      desc: `3/8" All-Thread Rod — ORDER FROM EXPERIENCE (2 drops per hanger; drop length is joist-to-pipe and varies with the route, longer where hangers are double-stacked. Sold in 10' sticks — switch the unit to bundle if that is how you buy it)` },
    // Beam clamps were missing from the takeoff entirely. They are how the rod
    // gets attached to the bar joist — every drop needs one — so on a store
    // with fifty hangers that is a hundred of them, at real money each. They
    // were not folded into the loose-hardware lot below; they simply were not
    // on the list.
    { section: 'Hardware', hangerManual: true, unit: 'ea', qty: 0, unitCost: 0, total: 0,
      desc: `Beam clamps — bar joist attachment (2 per hanger, one per rod drop; check the spec, some jobs call for welded or bolted attachment instead)` },
    // Loose hardware stays one lot. Nuts and washers are genuinely pocket
    // change and nobody counts them; the beam clamps that used to be lumped in
    // with items like this are now their own line above, because they are not.
    { section: 'Hardware', unit: 'lot', qty: 0, unitCost: 0, total: 0,
      desc: 'Strut Nuts, Rod Couplings, Nuts & Washers' },
  ];
}

// Saddles, which DO calculate. One per pipe per support point over every
// insulated horizontal run — suction at both temperatures, plus low-temp
// liquid. Risers are strapped, not saddled.
//
// normalize: the app's pipe-size normalizer, passed in so this module stays
// free of store imports.
//
// → [{ pipeSize, qty }] sorted by size, for the caller to turn into line items.
export function saddleCounts(circuits = [], spacingFt = DEFAULT_SPACING_FT, normalize = (s) => String(s || '')) {
  const spacing = normalizeSpacing(spacingFt);
  const bySize = {};
  for (const c of circuits) {
    if (c?.isRiserOnly) continue;
    const run = parseFloat(c?.runLength) || 0;
    if (run <= 0) continue;
    const add = (size) => {
      if (!size) return;
      const k = normalize(size);
      bySize[k] = (bySize[k] || 0) + run;
    };
    add(c.sucHoriz);
    // Medium-temp liquid is not insulated, so it carries no saddle.
    if (c.tempType === 'low') add(c.liqHoriz);
  }
  return Object.entries(bySize).map(([pipeSize, ft]) => ({
    pipeSize, ft, qty: Math.ceil(ft / spacing),
  }));
}
