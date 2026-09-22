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

// ── STRUT IS BOUGHT IN STICKS AND USED IN PIECES ────────────────────────────
// "The strut on top of the cases is usually no longer than 2' or so. So it's
//  not full sticks. We cut them down from 10' sticks. So we get 5 2' struts
//  from one stick which is enough to pipe a 12' and 8' case."
//
// The 2 ft default was right, and the sentence after it corrected the
// arithmetic. This counted FOOTAGE and divided by ten, which quietly assumes
// the offcut from one stick can be joined to the next. It cannot — a piece is
// a piece, and what a stick yields is how many whole ones come out of it.
//
// At 2 ft the two agree, which is why it looked fine: 16 pieces is 32 ft is
// four sticks either way. At 4 ft they part company. Five pieces is 20 ft,
// which the footage way calls two sticks — but a 10 ft stick yields two 4 ft
// pieces and a 2 ft offcut, so five pieces takes THREE sticks. The footage
// model under-buys by one stick on every job that cuts longer than half a
// stick evenly divides.
//
// His own check on the spacing rule, worth keeping: five pieces is "enough to
// pipe a 12' and 8' case" — 3 on the twelve and 2 on the eight.
export const DEFAULT_STRUT_PIECE_FT = 2;
export const STRUT_STICK_FT = 10;

// How many whole pieces come out of one stick, and how many sticks a count of
// pieces takes. A piece longer than a stick is not a cut, it is a splice, and
// the footage answer is the right one for it.
export function piecesPerStick(pieceFt, stickFt = STRUT_STICK_FT) {
  const piece = Number(pieceFt) > 0 ? Number(pieceFt) : DEFAULT_STRUT_PIECE_FT;
  const stick = Number(stickFt) > 0 ? Number(stickFt) : STRUT_STICK_FT;
  return Math.floor(stick / piece);
}

export function strutSticks(pieces, pieceFt = DEFAULT_STRUT_PIECE_FT, stickFt = STRUT_STICK_FT) {
  const n = Math.max(0, Math.round(Number(pieces) || 0));
  if (!n) return 0;
  const per = piecesPerStick(pieceFt, stickFt);
  if (per >= 1) return Math.ceil(n / per);
  // Longer than a whole stick: back to footage, because it is spliced anyway.
  const piece = Number(pieceFt) > 0 ? Number(pieceFt) : DEFAULT_STRUT_PIECE_FT;
  const stick = Number(stickFt) > 0 ? Number(stickFt) : STRUT_STICK_FT;
  return Math.ceil((n * piece) / stick);
}

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
    const per = piecesPerStick(piece);
    lines.push({
      section: 'Case Hookups', material: 'hardware',
      desc: `Unistrut — case tops (${STRUT_STICK_FT}' sticks, cut to ${piece} ft)`,
      qty: strutSticks(supports, piece), unit: 'stick',
      supports, piecesPerStick: per,
      notes: `${supports} piece(s) at ${strutSpacingFt} ft spacing across ${cases} case(s)`
        + (per >= 1 ? `, ${per} per stick` : ', spliced from more than one stick each')
        + ` — ${basisNote}. Set the piece length on the rates panel if you cut them longer `
        + 'or shorter.',
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
