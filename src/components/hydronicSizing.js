// ── SIZING A HYDRONIC RUNOUT FROM ITS FLOW ───────────────────────────────────
// Terminal connections were sized by hand: one size picked in the card and
// applied to every fixture on the job. That is right only when every terminal
// draws the same, and the moment a job mixes big walk-ins or large panels with
// small ones it prices the wrong assembly — at a steep price difference, since
// a hose kit roughly doubles every size and a half.
//
// Engineers do not pick these by eye either. A drawing that says
//
//   "SIZE HOSE KIT PER HYDRONIC HOSE KIT PIPE SIZING SCHEDULE FOR GPM LISTED
//    FOR PANEL(S) ON PLANS"
//
// is telling the contractor to look the size up from the flow, which makes it a
// takeoff step and therefore something the app should do.
//
// THIS IS THE RULE, NOT ONE JOB'S TABLE.
// A real schedule was checked to find out which it was — Edmonds SD College
// Place, HYDRONIC HOSE KIT PIPE SIZING SCHEDULE. Running its band tops back
// through Hazen-Williams for Type L copper:
//
//   size     max GPM     ft/100      ft/s
//   1/2         0.9        1.55      1.24
//   3/4         3.6        3.42      2.39
//   1           5.7        2.19      2.22
//   1-1/4      10.1        2.27      2.58
//   1-1/2      16.1        2.31      2.90
//   2          33.8        2.37      3.50
//   2-1/2      60.8        2.45      4.09
//   3          97.9        2.50      4.61
//
// From 1" up, friction is flat at 2.2-2.5 ft per 100 while velocity nearly
// doubles. That is constant-friction sizing, which is standard hydronic
// practice — not a house preference — so the physics underneath it is what
// gets implemented, and their schedule becomes the fixture that proves it.
//
// The two smallest sizes are where their table departs, in both directions, and
// that is expected: down there practical minimums govern rather than friction.
// The model is NOT bent to match them. It reports what the rule gives and the
// test records the divergence.
//
// Pure — no React.

// Hazen-Williams roughness. Copper and plastic are smooth; steel is not, and a
// black-steel hydronic main sized on the copper number comes out light.
export const C_FACTOR = { copper: 150, pvc: 150, steel: 120 };

// Design friction rate. 2.4 ft per 100 ft is the middle of what the schedule
// above works out to, and it sits inside the 1-4 ft/100 band hydronic design
// normally uses.
export const DEFAULT_FRICTION_TARGET = 2.4;

// Type L copper inside diameters, the same geometry the volume table uses.
export const TYPE_L_ID = {
  0.5: 0.545, 0.75: 0.785, 1: 1.025, 1.25: 1.265, 1.5: 1.505,
  2: 1.985, 2.5: 2.465, 3: 2.945, 4: 3.857,
};

export const NOMINAL_SIZES = Object.keys(TYPE_L_ID).map(Number).sort((a, b) => a - b);

export const sizeLabel = d => (
  d === 0.5 ? '1/2"' : d === 0.75 ? '3/4"' : d === 1.25 ? '1-1/4"'
    : d === 1.5 ? '1-1/2"' : d === 2.5 ? '2-1/2"' : `${d}"`
);

// Smallest connection anyone actually runs to a terminal unit.
export const MIN_SIZE = 0.5;

// ── WHERE FRICTION STOPS GOVERNING ───────────────────────────────────────────
// The 1"-and-up bands are constant friction and the model reproduces them. The
// two smallest are NOT, and checking the rule against the project's own piping
// plans showed the model wrong in BOTH directions there:
//
//   0.8 and 0.9 GPM   plan runs 3/4",  friction alone says 1/2"   (undersized)
//   3.2 GPM           plan runs 3/4",  friction alone says 1"     (oversized)
//
// Two independent sources agree on the bands — the hose kit sizing schedule
// prints them, and eleven tagged runouts on M4.12b follow them — so they are
// carried as what they are: a CONVENTION, not a friction result. Down here the
// runs are short enough that friction is not what anyone is sizing for.
export const CONVENTION_MAX_GPM = { 0.5: 0.9, 0.75: 3.6 };

// ── MINIMUM CONNECTION, WHICH IS A PROPERTY OF THE DEVICE ────────────────────
// The same plan settles this beyond argument. At 0.5 GPM — one flow, ten tags,
// every one of them three points from its device tag:
//
//   FT-M223, FT-M224, FT-M235A, FT-M236A, FT-M238A   →  3/4"
//   PR-MH21A through PR-MH21E                        →  1/2"
//
// Identical flow, different pipe, because a fin tube arrives with 3/4"
// connections on it. No flow rule produces that, and without it the app cannot
// be right about both at once.
export const TERMINAL_MIN_SIZE = {
  finTube: 0.75,
  unitHeater: 0.75,
  reheatCoil: 0.5,
  radiantPanel: 0.5,
  radiantWall: 0.5,
  caseCoil: 0.5,
};

export const terminalMinSize = kind => TERMINAL_MIN_SIZE[kind] ?? MIN_SIZE;

const K = 0.2083;

// ── HAZEN-WILLIAMS ───────────────────────────────────────────────────────────
// Feet of head lost per 100 feet of pipe, at a flow, in an inside diameter.
export function frictionPer100(gpm, idInches, material = 'copper') {
  const q = Number(gpm), d = Number(idInches);
  const c = C_FACTOR[material] || C_FACTOR.copper;
  if (!(q > 0) || !(d > 0)) return null;
  return K * Math.pow(100 / c, 1.852) * Math.pow(q, 1.852) / Math.pow(d, 4.8655);
}

// The inverse: the most flow a diameter carries without exceeding a friction rate.
export function flowAtFriction(targetPer100, idInches, material = 'copper') {
  const h = Number(targetPer100), d = Number(idInches);
  const c = C_FACTOR[material] || C_FACTOR.copper;
  if (!(h > 0) || !(d > 0)) return null;
  return Math.pow((h * Math.pow(d, 4.8655)) / (K * Math.pow(100 / c, 1.852)), 1 / 1.852);
}

// ── THE ANSWER ───────────────────────────────────────────────────────────────
// The most flow a size carries: convention where convention governs, friction
// everywhere else. `convention: false` gets pure physics, for a caller who has
// deliberately moved the friction target and wants it applied throughout.
export function sizeCapacity(dia, {
  target = DEFAULT_FRICTION_TARGET, material = 'copper', convention = true,
} = {}) {
  if (convention && CONVENTION_MAX_GPM[dia] !== undefined) return CONVENTION_MAX_GPM[dia];
  return flowAtFriction(target, TYPE_L_ID[dia], material);
}

// The smallest nominal size that carries this flow — never below the device's
// own connection size, whatever the flow says.
export function sizeForFlow(gpm, opts = {}) {
  const { minSize = MIN_SIZE, terminal = null } = opts;
  const q = Number(gpm);
  if (!(q > 0)) return null;
  const floor = terminal ? Math.max(terminalMinSize(terminal), minSize) : minSize;
  for (const d of NOMINAL_SIZES) {
    if (d < floor) continue;
    const cap = sizeCapacity(d, opts);
    if (cap !== null && cap >= q) return d;
  }
  // Past the table. Returning the largest is a lie; say nothing instead.
  return null;
}

// The app's own version of the schedule, for showing next to the drawing's.
export function sizingTable(opts = {}) {
  const { minSize = MIN_SIZE } = opts;
  const rows = [];
  let floor = 0;
  for (const d of NOMINAL_SIZES) {
    if (d < minSize) continue;
    const cap = sizeCapacity(d, opts);
    if (cap === null) continue;
    const maxGpm = Math.round(cap * 10) / 10;
    rows.push({
      dia: d, label: sizeLabel(d), minGpm: Math.round(floor * 10) / 10, maxGpm,
      basis: (opts.convention !== false && CONVENTION_MAX_GPM[d] !== undefined) ? 'convention' : 'friction',
    });
    floor = maxGpm;
  }
  return rows;
}

// ── A TAKEOFF, NOT A LOOKUP ──────────────────────────────────────────────────
// Real input is "eight panels at 2 GPM, twelve at 4, six at 9", not thirty
// separate numbers. Folds a mix of flows into a count per size, which is what
// the valve and hose-kit lines need.
// flows: [{ gpm, count }] or a bare array of numbers.
export function sizeMix(flows = [], opts = {}) {
  const items = flows.map(f => (typeof f === 'number' ? { gpm: f, count: 1 } : f));
  const bySize = new Map();
  const unsized = [];
  for (const it of items) {
    const n = Number(it.count) || 0;
    const q = Number(it.gpm);
    if (n <= 0) continue;
    // A row may name its own device kind — a fin tube and a radiant panel at the
    // same flow are not the same connection.
    const d = sizeForFlow(q, it.terminal ? { ...opts, terminal: it.terminal } : opts);
    if (d === null) { unsized.push({ gpm: q, count: n }); continue; }
    bySize.set(d, (bySize.get(d) || 0) + n);
  }
  const sizes = [...bySize.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dia, count]) => ({ dia, label: sizeLabel(dia), count }));
  return {
    sizes,
    unsized,
    total: sizes.reduce((s, x) => s + x.count, 0),
    // The single size a hand-pick would most likely have landed on, so the
    // difference between sizing properly and picking one is visible.
    dominant: sizes.length ? sizes.reduce((a, b) => (b.count > a.count ? b : a)).dia : null,
  };
}

// What one hand-picked size would have cost against the sized mix, given a
// price-by-size table. Returns null when there is nothing to compare.
export function mixVsSingle(mix, priceBySize, singleSize) {
  if (!mix || !mix.sizes.length || !priceBySize) return null;
  const priceAt = d => {
    const keys = Object.keys(priceBySize).map(Number).sort((a, b) => a - b);
    if (priceBySize[d] !== undefined) return priceBySize[d];
    const up = keys.find(k => k > d);
    return priceBySize[up ?? keys[keys.length - 1]];
  };
  const sized = mix.sizes.reduce((s, x) => s + x.count * (priceAt(x.dia) || 0), 0);
  const one = Number(singleSize) > 0 ? singleSize : mix.dominant;
  const flat = mix.total * (priceAt(one) || 0);
  return {
    sizedTotal: Math.round(sized * 100) / 100,
    singleTotal: Math.round(flat * 100) / 100,
    singleSize: one,
    deltaPct: flat > 0 ? Math.round(((sized - flat) / flat) * 1000) / 10 : null,
  };
}

export function sizingNote(target = DEFAULT_FRICTION_TARGET) {
  return `Sized at ${target} ft per 100 ft of friction — constant-friction, which is what hydronic `
    + 'schedules do. Velocity rises with size on purpose; it is the friction that is held. '
    + 'At the two smallest sizes practical minimums govern instead, and a published schedule may differ there.';
}
