// ── EQUIPMENT HEAD, READ OFF THE SUBMITTALS ──────────────────────────────────
// Until now the pump sizing carried a flat 25 ft for "everything that is not
// pipe" — the chiller barrel, the case coils, the valve train. That number was
// a placeholder wearing the same font as the computed ones, and on a compact
// loop it is frequently the LARGER half of total head. This replaces it with
// the figures that are actually printed on the equipment submittals.
//
// THE MISTAKE THIS MODULE EXISTS TO PREVENT.
// Head does not add up across everything in the building. It adds up along ONE
// path — the same critical circuit the pipe length uses. A pump has to overcome
// the worst route through the system, and everything hanging in parallel with
// that route is not in its way.
//
//   SERIES   — every gallon goes through it. The chiller barrel, the main
//              strainer, the triple-duty valve at the pump. These ADD.
//   BRANCH   — one of many parallel paths. A case coil, its circuit setter, its
//              control valve. Only the WORST ONE counts.
//
// Add up thirty case coils at 8 ft each and you get 240 ft of head that does
// not exist, a 40 HP motor for a 7.5 HP job, and a bid with a service upgrade
// in it that nobody asked for. This is the same error as feeding total pipe
// footage in where the longest path belongs, and it is made the same way: by
// adding what is actually in parallel.
//
// THREE CORRECTIONS THE SUBMITTAL DOES NOT MAKE FOR YOU.
//   1. Units. Manufacturers quote feet, psi, or kPa as they please, and psi to
//      feet is fluid-dependent — 2.31 ft per psi is a WATER number.
//   2. Flow. Every quoted drop is quoted AT A STATED FLOW. Push more through it
//      and the drop climbs with the square. A coil rated 8 ft at 20 GPM is
//      12.5 ft at 25 GPM, and that is not a rounding difference.
//   3. Fluid. Coil ratings are usually published on water. Cold glycol is
//      thicker and costs more to push through the same coil.
//
// Pure — no React.

import { viscosityFactor, specificGravity } from './glycolHydraulics.js';

export const SERIES = 'series';
export const BRANCH = 'branch';

// The catalogue. `typicalFt` is a trade-typical placeholder for before the
// submittals arrive — every one of them is a round number nobody here has read
// off a real sheet, and the app says so until the estimator overwrites it.
export const COMPONENT_TYPES = [
  { key: 'chillerBarrel', label: 'Chiller barrel / heat exchanger', position: SERIES, typicalFt: 15, range: [8, 25],
    note: 'Usually the single largest item. Plate-and-frame runs higher than shell-and-tube.' },
  { key: 'fluidCooler', label: 'Fluid cooler coil', position: SERIES, typicalFt: 12, range: [8, 20],
    note: 'The water-loop equivalent of the barrel — it is what the loop rejects heat through.' },
  { key: 'mainStrainer', label: 'Main basket strainer', position: SERIES, typicalFt: 5, range: [3, 8],
    note: 'Clean. A loaded strainer is worse, which is why the pump gets some margin.' },
  { key: 'suctionDiffuser', label: 'Suction diffuser', position: SERIES, typicalFt: 3, range: [2, 5] },
  { key: 'tripleDuty', label: 'Triple-duty valve', position: SERIES, typicalFt: 10, range: [8, 14],
    note: 'Check, balance and shutoff in one body — and it charges head for all three.' },
  { key: 'flowMeter', label: 'Flow meter / venturi', position: SERIES, typicalFt: 3, range: [2, 6] },
  { key: 'seriesOther', label: 'Other — every gallon goes through it', position: SERIES, typicalFt: 0, range: [0, 0] },

  { key: 'caseCoil', label: 'Case coil (worst case on the loop)', position: BRANCH, typicalFt: 8, range: [4, 12],
    note: 'ONE of them. The other twenty-nine are in parallel with this one, not behind it.' },
  { key: 'walkinCoil', label: 'Walk-in unit cooler coil', position: BRANCH, typicalFt: 10, range: [6, 15] },
  { key: 'circuitSetter', label: 'Circuit setter / balance valve', position: BRANCH, typicalFt: 5, range: [3, 9],
    note: 'At its design setting. Set further closed it is higher, which is the whole point of it.' },
  { key: 'controlValve', label: '2-way control valve', position: BRANCH, typicalFt: 8, range: [4, 14],
    note: 'Sized for authority — deliberately a real share of the branch drop, or it cannot control.' },
  { key: 'solenoid', label: 'Solenoid valve', position: BRANCH, typicalFt: 3, range: [2, 6] },
  { key: 'branchStrainer', label: 'Branch strainer', position: BRANCH, typicalFt: 3, range: [2, 5] },
  { key: 'branchValves', label: 'Branch isolation valves', position: BRANCH, typicalFt: 1.5, range: [1, 3] },
  { key: 'branchOther', label: 'Other — on one branch only', position: BRANCH, typicalFt: 0, range: [0, 0] },
];

const BY_KEY = Object.fromEntries(COMPONENT_TYPES.map(t => [t.key, t]));
export const componentType = key => BY_KEY[key] || null;
export const positionOf = key => (BY_KEY[key] ? BY_KEY[key].position : SERIES);

// What a fresh card starts with — the spine of a loop, no branch items yet,
// because the branch is where the estimator has to make a judgement about which
// case is worst and the app should not make it for them.
export function seedComponents(loopType = 'chilled') {
  const spine = loopType === 'water'
    ? ['fluidCooler', 'mainStrainer', 'tripleDuty']
    : ['chillerBarrel', 'mainStrainer', 'tripleDuty'];
  return spine.map(key => newComponent(key));
}

let seq = 0;
export function newComponent(key = 'seriesOther') {
  const t = BY_KEY[key];
  return {
    id: `eh${Date.now().toString(36)}${(seq++).toString(36)}`,
    key,
    label: t ? t.label : 'Component',
    value: t ? t.typicalFt : 0,
    unit: 'ft',            // 'ft' | 'psi' | 'kpa'
    ratedGpm: 0,           // 0 = the submittal's flow was not noted, so no flow correction
    // What is ACTUALLY going through this component. 0 = derive it: a series
    // item sees the whole loop, a branch item sees an even split of it. The
    // override is for when the even split is a lie — a 40 MBH walk-in on the
    // same loop as twenty reach-ins carries far more than 1/21st of the flow,
    // and it is the worst branch precisely because it does.
    actualGpm: 0,
    ratedOn: 'water',      // 'water' | 'glycol' — what the published drop was measured with
    fromSubmittal: false,  // true once the estimator has actually read it off a sheet
  };
}

// ── UNIT CONVERSION ──────────────────────────────────────────────────────────
// Pump head is expressed in feet OF THE FLUID BEING PUMPED, which is why pump
// curves do not mention density. So a psi drop becomes fewer feet in a denser
// fluid: the same pressure is a shorter column of heavier stuff.
export const FT_PER_PSI_WATER = 2.31;
export const FT_PER_KPA_WATER = 0.334552;

// ── Cv IS NOT A PRESSURE DROP ────────────────────────────────────────────────
// Valve schedules give Cv, not feet, and it is a different KIND of number: the
// flow a valve passes at 1 psi drop. So it does not describe a drop at all — it
// describes the valve, and the drop follows from whatever flow is actually
// going through it:
//
//   Q = Cv × √(ΔP / SG)   →   ΔP(psi) = SG × (Q / Cv)²
//
// Converted to feet of the fluid being pumped, ΔP × 2.31 / SG, the specific
// gravity CANCELS:
//
//   head(ft) = 2.31 × (Q / Cv)²
//
// which is worth knowing — a valve's head loss in feet is the same on glycol as
// on water at the same flow. The glycol penalty on a valve shows up in the psi
// it takes to get that head, not in the head itself.
//
// TWO THINGS FOLLOW, and both are handled in resolveComponent rather than here:
// a Cv row must NOT get the flow-square correction on top (the formula already
// uses actual flow — correcting again would square it twice), and it must not
// get the water-to-glycol multiplier either, for the cancellation above.
export function cvHeadFt(cv, gpm) {
  const c = Number(cv), q = Number(gpm);
  if (!(c > 0)) return null;
  if (!(q > 0)) return 0;   // no flow through it, no drop across it
  return FT_PER_PSI_WATER * Math.pow(q / c, 2);
}

export function feetOfHead(value, unit = 'ft', pct = 35) {
  // A blank field is 0 ft ON PURPOSE — an unentered component contributes
  // nothing and should still show in the list rather than vanish from it. The
  // sanity pass is what says a row is sitting at zero; Number('') doing this
  // by accident is not a good enough reason for it to be right.
  if (value === '' || value === null || value === undefined) return 0;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const u = String(unit || 'ft').toLowerCase();
  if (u === 'ft') return v;
  const sg = specificGravity(pct) || 1;
  if (u === 'psi') return (v * FT_PER_PSI_WATER) / sg;
  if (u === 'kpa') return (v * FT_PER_KPA_WATER) / sg;
  return null;
}

// ── FLOW CORRECTION ──────────────────────────────────────────────────────────
// Turbulent pressure drop goes with the square of velocity, so a component
// pushed past its rated flow costs disproportionately more head. Returns the ft
// unchanged when the rated flow was not recorded — a correction against an
// unknown baseline is worse than no correction.
export function flowCorrect(ft, ratedGpm, actualGpm) {
  const f = Number(ft), r = Number(ratedGpm), a = Number(actualGpm);
  if (!Number.isFinite(f)) return null;
  if (!(r > 0) || !(a > 0)) return f;
  return f * Math.pow(a / r, 2);
}

// ── FLUID CORRECTION ─────────────────────────────────────────────────────────
// A drop published on water understates a glycol loop. This uses the same
// lumped viscosity factor the pipe friction uses — it is an estimating
// approximation for a coil rather than a manufacturer's curve, and it lands in
// the same 10–30% band manufacturers publish as their own glycol multiplier.
export function fluidCorrect(ft, ratedOn = 'water', pct = 35) {
  const f = Number(ft);
  if (!Number.isFinite(f)) return null;
  if (String(ratedOn) !== 'water') return f;   // already measured on the real fluid
  return f * (viscosityFactor(pct) || 1);
}

const round1 = n => Math.round(n * 10) / 10;

// One component → the feet of head it actually contributes, plus a plain
// account of every correction applied on the way, so a number that moved can be
// explained rather than merely trusted.
export function resolveComponent(c = {}, { gpm = 0, branchGpm = 0, pct = 35 } = {}) {
  const type = BY_KEY[c.key] || null;
  const position = type ? type.position : SERIES;
  const unit = String(c.unit || 'ft').toLowerCase();
  const isCv = unit === 'cv';

  // A branch component sees its own share of the flow, not the whole loop's —
  // unless the estimator has said otherwise, which is the only way to be right
  // about a loop whose branches are not equal.
  const override = Number(c.actualGpm) > 0 ? Number(c.actualGpm) : 0;
  const derived = position === BRANCH ? Number(branchGpm) || 0 : Number(gpm) || 0;
  const actual = override || derived;
  const flowBasis = override ? 'override' : position === BRANCH ? 'even-split' : 'loop';
  const how = flowBasis === 'override' ? 'entered'
    : flowBasis === 'even-split' ? 'even split of the loop'
      : 'full loop flow';

  const corrections = [];
  let ft;

  if (isCv) {
    // The drop comes out of the flow and the coefficient together. No flow
    // correction on top — the formula already used actual flow, and applying
    // the square again would square it twice. No fluid correction either;
    // specific gravity cancels out of head in feet.
    ft = cvHeadFt(c.value, actual);
    if (ft === null) return null;
    corrections.push(`Cv ${c.value} at ${round1(actual)} GPM (${how}) → ${round1(ft)} ft`);
  } else {
    const raw = feetOfHead(c.value, c.unit, pct);
    if (raw === null) return null;
    if (unit !== 'ft') corrections.push(`${c.value} ${c.unit} → ${round1(raw)} ft of ${pct}% glycol`);

    const flowed = flowCorrect(raw, c.ratedGpm, actual);
    if (flowed !== raw) {
      corrections.push(
        `rated at ${c.ratedGpm} GPM, running ${round1(actual)} GPM (${how})`
        + ` → ×${Math.round(Math.pow(actual / Number(c.ratedGpm), 2) * 100) / 100}`);
    }

    ft = fluidCorrect(flowed, c.ratedOn, pct);
    if (ft !== flowed) corrections.push(`published on water → ×${Math.round((viscosityFactor(pct) || 1) * 100) / 100} for glycol`);
  }

  return {
    id: c.id,
    key: c.key,
    label: c.label || (type ? type.label : 'Component'),
    position,
    ft: round1(ft),
    basis: c.fromSubmittal ? 'submittal' : 'typical',
    // The flow the correction ran against, and where that flow came from — so
    // an override can be told apart from an assumption at a glance.
    actualGpm: round1(actual),
    derivedGpm: round1(derived),
    ratedGpm: Number(c.ratedGpm) || 0,
    flowBasis,
    isCv,
    corrections,
  };
}

// ── THE TOTAL ────────────────────────────────────────────────────────────────
// Series items add. Branch items add to each other — they are all on the ONE
// critical branch, in series with one another along it — and that single branch
// total adds to the series total. Nothing is multiplied by the fixture count,
// which is the whole point.
export function equipmentHead(components = [], { gpm = 0, fixtures = 0, pct = 35 } = {}) {
  const branchGpm = Number(fixtures) > 0 && Number(gpm) > 0 ? Number(gpm) / Number(fixtures) : 0;
  const lines = components.map(c => resolveComponent(c, { gpm, branchGpm, pct })).filter(Boolean);
  const seriesFt = lines.filter(l => l.position === SERIES).reduce((s, l) => s + l.ft, 0);
  const branchFt = lines.filter(l => l.position === BRANCH).reduce((s, l) => s + l.ft, 0);
  const fromSubmittal = lines.filter(l => l.basis === 'submittal').length;
  return {
    lines,
    seriesFt: round1(seriesFt),
    branchFt: round1(branchFt),
    totalFt: round1(seriesFt + branchFt),
    branchGpm: branchGpm ? round1(branchGpm) : 0,
    fromSubmittal,
    typical: lines.length - fromSubmittal,
  };
}

// What the naive addition would have produced, so the difference is visible
// rather than merely avoided. On a thirty-case loop this is a large number and
// seeing it is the fastest way to understand why the branch is not multiplied.
export function naiveTotalFt(result, fixtures = 0) {
  const n = Number(fixtures) || 0;
  if (!result || n <= 1 || !(result.branchFt > 0)) return null;
  return round1(result.seriesFt + result.branchFt * n);
}

// ── SANITY ───────────────────────────────────────────────────────────────────
// The ways this input goes wrong in practice, caught before it reaches a motor
// size. severity mirrors the glycol review card: 'blocker' | 'verify' | 'fyi'.
export const COIL_KEYS = ['caseCoil', 'walkinCoil'];

// How far a branch override departs from the even split before it is worth
// remarking on. Under this, the two agree closely enough that the override is
// just confirming the estimate.
export const SPLIT_TOLERANCE = 1.5;

// Past this, a Cv row is not a tight valve — it is a drop typed into a Cv field.
export const CV_IMPLAUSIBLE_FT = 100;

export function equipmentHeadSanity(components = [], result = null, { fixtures = 0, gpm = 0 } = {}) {
  const out = [];
  const add = (severity, label, detail) => out.push({ severity, label, detail });

  if (!components.length) {
    add('blocker', 'No equipment head entered',
      'Pipe friction alone is not the pump. The barrel, the coils and the valve train are frequently the '
      + 'larger half of total head on a compact loop, and every one of those figures is printed on a submittal.');
    return out;
  }

  const coils = components.filter(c => COIL_KEYS.includes(c.key));
  if (coils.length > 1) {
    add('blocker', `${coils.length} coils entered as branch components`,
      'Case and walk-in coils hang in PARALLEL off the loop. The pump overcomes the worst one, not the sum '
      + 'of all of them. Enter only the worst branch — delete the rest, or the motor comes out several sizes '
      + 'too big and the bid carries an electrical upgrade nobody asked for.');
  }

  const typical = components.filter(c => !c.fromSubmittal);
  if (typical.length) {
    add('verify', `${typical.length} of ${components.length} still on trade-typical numbers`,
      'These are round figures nobody here has read off a sheet. Tick "from submittal" as each real number '
      + 'goes in — the pump size is provisional until they all are.');
  }

  const zero = components.filter(c => !(Number(c.value) > 0));
  if (zero.length) {
    add('verify', `${zero.length} component(s) sitting at zero`,
      'A blank row contributes nothing to the pump. That is correct if the component genuinely has no '
      + 'meaningful drop, and a hole in the estimate if the figure simply has not been looked up yet.');
  }

  // Cv rows are exempt — a Cv has no rated flow to note, which is the point of it.
  const noFlow = components.filter(c => !(Number(c.ratedGpm) > 0)
    && String(c.unit || 'ft').toLowerCase() !== 'cv');
  if (noFlow.length && Number(fixtures) > 0) {
    add('fyi', `${noFlow.length} component(s) have no rated flow noted`,
      'A published drop is published at a stated flow, and drop climbs with the square of it. Without the '
      + 'rated GPM the figure is taken at face value, which is right only if the design flow matches.');
  }

  // ── What Cv gets wrong ─────────────────────────────────────────────────────
  const lines = (result && result.lines) || [];
  const cvLines = lines.filter(l => l.isCv);

  // A Cv row with no flow through it computes 0 ft and looks settled. It is not
  // settled — it is waiting on a load, and it is the one unit that cannot fall
  // back on a stated figure, because a Cv IS NOT a drop.
  const cvNoFlow = cvLines.filter(l => !(l.actualGpm > 0));
  if (cvNoFlow.length) {
    add('blocker', `${cvNoFlow.length} Cv component(s) have no flow through them`,
      'A Cv is the flow a valve passes at 1 psi — it only becomes a pressure drop once there is a flow to '
      + 'put through it, so these are contributing 0 ft. Enter the load and ΔT, or type the actual GPM on '
      + 'the row.');
  }

  // Absurd head off a Cv row is nearly always a drop typed where a coefficient
  // belongs. Cv 8 at 240 GPM is 2,000 ft, which no valve does.
  const cvWild = cvLines.filter(l => l.ft > CV_IMPLAUSIBLE_FT);
  if (cvWild.length) {
    add('blocker', `A Cv row is computing ${round1(cvWild[0].ft)} ft`,
      'That is far past what a valve does, and it is what a pressure DROP typed into a Cv field looks like. '
      + 'Cv is the valve coefficient off the schedule — bigger Cv means less restriction, so the number is '
      + 'usually larger than the drop it replaces, not smaller.');
  }

  // ── What the flow override can get wrong ───────────────────────────────────
  const overBranch = lines.filter(l => l.position === BRANCH && l.flowBasis === 'override');

  // A branch cannot carry more than the loop. That is a units slip or a
  // component on the wrong side of the series/branch line.
  const impossible = overBranch.filter(l => Number(gpm) > 0 && l.actualGpm > Number(gpm));
  if (impossible.length) {
    add('blocker', `${impossible.length} branch flow(s) exceed the whole loop`,
      `The loop moves ${round1(Number(gpm))} GPM total, so no single branch off it can carry more. Either the `
      + 'figure is in the wrong units, or the component belongs in SERIES — where full loop flow is exactly right.');
  }

  // An override far off the even split is the reason the override exists, but
  // it is also what a mis-typed number looks like, so it gets said out loud.
  const skewed = overBranch.filter(l => l.derivedGpm > 0 && !impossible.includes(l)
    && (l.actualGpm / l.derivedGpm > SPLIT_TOLERANCE || l.derivedGpm / l.actualGpm > SPLIT_TOLERANCE));
  if (skewed.length) {
    const w = skewed[0];
    add('verify', `Branch flow is ${round1(w.actualGpm / w.derivedGpm)}× the even split`,
      `${w.actualGpm} GPM entered against ${w.derivedGpm} GPM if every fixture drew the same. On a loop with a `
      + 'few large walk-ins among small cases that is expected — it is why this branch is the worst one. Worth '
      + 'a second look only because a mis-keyed flow reads the same way, and drop moves with its square.');
  }

  // Full flow goes through a series component by definition. An override that
  // disagrees usually means the component is really on a branch.
  const seriesOff = lines.filter(l => l.position === SERIES && l.flowBasis === 'override'
    && Number(gpm) > 0 && Math.abs(l.actualGpm - Number(gpm)) / Number(gpm) > 0.1);
  if (seriesOff.length) {
    add('verify', `${seriesOff.length} series component(s) overridden off the loop flow`,
      `Series means every gallon passes through it, so it should see the loop's ${round1(Number(gpm))} GPM. A `
      + 'lower figure usually means the component is on a branch after all — which also changes whether its '
      + 'drop should be adding to the total at all.');
  }

  // Only worth saying when a rated flow is present, because that is the only
  // case where the assumed branch flow is actually moving the number.
  if (Number(fixtures) > 1 && Number(gpm) > 0 && !overBranch.length
      && lines.some(l => l.position === BRANCH && l.flowBasis === 'even-split' && l.ratedGpm > 0)) {
    add('fyi', 'Branch flow is an even split of the loop',
      `${round1(Number(gpm) / Number(fixtures))} GPM per fixture, which assumes every case draws the same. If a `
      + 'couple of large walk-ins share the loop with small reach-ins, enter the real flow on the worst branch '
      + 'instead — the even split understates it.');
  }

  if (result && result.branchFt > result.seriesFt && result.seriesFt > 0) {
    add('verify', 'The branch outweighs the machine room',
      `${result.branchFt} ft on one branch against ${result.seriesFt} ft series. That happens on jobs with `
      + 'aggressive control-valve authority, but it is worth a second look — a coil entered where a barrel '
      + 'belongs reads exactly like this.');
  }

  return out;
}

export function equipmentHeadNote(result) {
  if (!result || !result.lines.length) return '';
  return `${result.totalFt} ft = ${result.seriesFt} ft series (every gallon) + ${result.branchFt} ft `
    + `on the worst branch. ${result.fromSubmittal} of ${result.lines.length} from submittals.`;
}
