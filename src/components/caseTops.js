// ── EVERYTHING THAT HAPPENS ABOVE THE CASES ─────────────────────────────────
// "The main run goes to the case but there's nothing for the tops of the cases
//  or any piping beyond the drop."
//
// Four things, and they arrived one at a time because each one was reported
// after the last was shipped:
//
//   copper       both lines, the length of the lineup plus a foot per case
//   insulation   the same footage, at the circuit's own wall
//   strut        "3 on 12' case 2 on 8' and below"
//   saddles      one per insulated line at every support
//
// ── WHY THIS IS A MODULE AND NOT TWENTY LINES IN THE STEP ───────────────────
// It was twenty lines in the step, and a test caught nothing when the support
// count was short-circuited to zero. The checks were greps over the source —
// `circuitCaseTopSupports(c, {` was still written there, so they passed while
// the generator produced no strut and no saddles at all. That is the second
// time in three days a source-grep has held a dead code path up as working.
//
// Out here it returns a list, and a test can ask what is on it.
//
// Lines come back UNPRICED, carrying what they are (`material`) and what they
// are made of (`pipeSize`, `insulCategory`, `saddleSize`). The caller prices
// them through the same path as every other case-hookup line, so the shop's
// price book beats the shipped defaults here exactly as it does everywhere
// else — which is not true of a line that prices itself on the way out.
//
// Pure — no React, no store.
import {
  circuitCaseTopFeet, circuitCaseTopSupports, CASE_TOP_EXTRA_FT, STRUT_SPACING_FT,
} from './caseSizes.js';
import { saddleSizeFor } from './hangers.js';

export const DEFAULT_STRUT_PIECE_FT = 2;
export const STRUT_STICK_FT = 10;

const INSUL_LABEL = {
  medSuction: 'suction, Med Temp',
  lowSuction: 'suction, Low Temp',
  lowLiquid: 'liquid',
};

export function caseTopLines(circuits = [], {
  normalize = s => String(s || ''),
  defaultCaseFt = 12,
  strutSpacingFt = STRUT_SPACING_FT,
  strutPieceFt = DEFAULT_STRUT_PIECE_FT,
  extraPerCase = CASE_TOP_EXTRA_FT,
  insulMedLiquid = true,
  medLiquidCategory = 'lowLiquid',
  insulWall = {},
} = {}) {
  const suc = {}, liq = {};
  const insul = new Map();      // `${category}|${size}` → ft
  const saddles = new Map();    // saddle size → count
  let supports = 0, cases = 0, basis = '';

  for (const c of circuits || []) {
    // A riser-only drop is a new riser on an existing circuit. There is no
    // lineup at the bottom of it that this job is piping.
    if (!c || c.isRiserOnly) continue;
    const top = circuitCaseTopFeet(c, { defaultCaseFt, extraPerCase });
    if (!(top.ft > 0)) continue;
    cases += top.cases;
    // 'count' is the weaker basis and wins the label: a mixed job has to read
    // as the least certain thing in it.
    if (top.basis === 'count' || !basis) basis = top.basis;

    const isLow = c.tempType === 'low';
    const liquidInsulated = isLow || insulMedLiquid;

    const addFt = (bucket, size) => {
      if (!size) return;
      const k = normalize(size);
      bucket[k] = (bucket[k] || 0) + top.ft;
    };
    addFt(suc, c.sucHoriz);
    addFt(liq, c.liqHoriz);

    const addInsul = (size, category) => {
      if (!size || !category) return;
      // Keyed on category AND size: two circuits at one pipe size and
      // different temperatures take different walls at different prices, and
      // merging them charges one wall for both.
      const key = `${category}|${normalize(size)}`;
      insul.set(key, (insul.get(key) || 0) + top.ft);
    };
    addInsul(c.sucHoriz, isLow ? 'lowSuction' : 'medSuction');
    if (isLow) addInsul(c.liqHoriz, 'lowLiquid');
    else if (insulMedLiquid) addInsul(c.liqHoriz, medLiquidCategory);

    const n = circuitCaseTopSupports(c, { defaultCaseFt, spacingFt: strutSpacingFt });
    if (!(n > 0)) continue;
    supports += n;
    const addSaddle = (size, role) => {
      if (!size) return;
      const sz = saddleSizeFor(size, c.tempType, role);
      if (!sz) return;
      saddles.set(sz, (saddles.get(sz) || 0) + n);
    };
    // A saddle protects insulation. A line carrying none has nothing to
    // protect and takes none.
    addSaddle(c.sucHoriz, 'suction');
    if (liquidInsulated) addSaddle(c.liqHoriz, 'liquid');
  }

  if (!cases) return [];

  const basisNote = basis === 'sizes'
    ? 'case lengths off the schedule'
    : `no case lengths on the schedule — ${defaultCaseFt} ft assumed per case`;
  const feetNote = `${cases} case(s), each case length + ${extraPerCase} ft for the jog to the `
    + `next — ${basisNote}`;
  const lines = [];

  const pushRun = (bucket, label) => {
    for (const [size, ft] of Object.entries(bucket)) {
      if (!(ft > 0)) continue;
      lines.push({
        section: 'Case Hookups', desc: `${size}" Case-top run — ${label}`,
        qty: Math.ceil(ft), unit: 'ft', pipeSize: size, material: 'copper', notes: feetNote,
      });
    }
  };
  pushRun(suc, 'suction');
  pushRun(liq, 'liquid');

  for (const [key, ft] of insul.entries()) {
    if (!(ft > 0)) continue;
    const [category, size] = key.split('|');
    const wall = insulWall[category] ? ` (${insulWall[category]} wall)` : '';
    lines.push({
      section: 'Case Hookups',
      desc: `${size}" Case-top insulation — ${INSUL_LABEL[category] || category}${wall}`,
      qty: Math.ceil(ft), unit: 'ft', pipeSize: size,
      material: 'insulation', insulCategory: category,
      notes: `the tops are insulated at the circuit temperature, same as the run they came off `
        + `— ${basisNote}`,
    });
  }

  if (supports > 0) {
    const piece = Number(strutPieceFt) > 0 ? Number(strutPieceFt) : DEFAULT_STRUT_PIECE_FT;
    lines.push({
      section: 'Case Hookups', material: 'hardware',
      desc: `Unistrut — case tops (${STRUT_STICK_FT}' sticks)`,
      qty: Math.ceil((supports * piece) / STRUT_STICK_FT), unit: 'stick',
      supports,
      notes: `${supports} support(s) at ${strutSpacingFt} ft spacing across ${cases} case(s), `
        + `${piece} ft per piece — ${basisNote}. The PIECE LENGTH is an assumption, not a `
        + 'measurement; set it on the rates panel if your strut is cut longer or shorter.',
    });
  }

  for (const [size, qty] of [...saddles.entries()].sort((a, b) => a[0] - b[0])) {
    if (!(qty > 0)) continue;
    lines.push({
      section: 'Case Hookups', material: 'hardware', saddleSize: size,
      desc: `${size}" Pipe Saddles (Insuguard) — case tops`, qty, unit: 'ea',
      notes: `one per insulated line at each of ${supports} support(s) — ${basisNote}`,
    });
  }

  return lines;
}
