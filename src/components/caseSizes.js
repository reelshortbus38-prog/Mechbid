// ── HOW LONG THE CASES ARE, AND WHAT THAT COSTS IN COPPER ───────────────────
// From the mechanic:
//
//   "there needs to be a way to add copper for piping the tops of the cases.
//    Generally a 12' case would need 13' for the top. 8' case would need 9'
//    extra and so on."
//
// Both lines run the length of the lineup along the case tops, and the extra
// foot per case is the jog between one case and the next. A six-case lineup of
// twelves is 78 ft of suction AND 78 ft of liquid that was on no line: the
// takeoff had the branch coming from the rack and a 5 ft drop at each case,
// and nothing for the pipe that runs from one end of the lineup to the other.
//
// ── THE SIZES ARE ALREADY IN THE KWRS ───────────────────────────────────────
// He asked whether the fixture plan could be read for case lengths. It can,
// but it does not have to be: the Kysor Warren summary the app already parses
// carries a Size column, and the app was reading every column around it and
// not that one.
//
//   Store Circ ID   Size                    Model
//   A1              8'8'12'12'12'12'        64' IDD5SL
//   A3              12'12'12'12',6'         48' D6L1, 6' IDD5SL
//   B4              8'8'12',4'              28' DX6LN, 4' PF
//
// Written with and without commas, in the same file. The Model column states
// the same footage a second way, which makes it a CHECK rather than a second
// guess — see sizesAgree below.
//
// ── NOT EVERY ROW IS A LINEUP ───────────────────────────────────────────────
// The same column holds walk-in box dimensions and floor areas:
//
//   A4   16' x 27' x 8.5'    Meat Cooler
//   B2   773 sq.ft.          Produce Prep
//
// A cooler has no case tops to pipe. Reading "16' x 27' x 8.5'" as three cases
// would put 48 ft of copper on a box, so the shape is classified before any
// number is taken out of it.
//
// Pure — no React, no store.

// The jog from one case to the next: "a 12' case would need 13' for the top."
export const CASE_TOP_EXTRA_FT = 1;

const FEET = /(\d+(?:\.\d+)?)\s*'/g;

// → { kind, cases, totalFt }
//   kind 'lineup'  a run of display cases, the only kind with tops to pipe
//   kind 'walkin'  box dimensions (L x W x H)
//   kind 'area'    a floor area
//   kind 'none'    blank, spare, or nothing readable
export function parseCaseSizes(text) {
  const s = String(text ?? '').trim();
  const none = { kind: 'none', cases: [], totalFt: 0 };
  if (!s || /^spare$/i.test(s)) return none;

  // Shape first, numbers second. A walk-in is "16' x 27' x 8.5'" and an area
  // is "773 sq.ft." — both full of feet, neither a lineup.
  if (/\bsq\.?\s*ft/i.test(s)) return { kind: 'area', cases: [], totalFt: 0 };
  if (/\d\s*'?\s*[x×]\s*\d/i.test(s)) return { kind: 'walkin', cases: [], totalFt: 0 };

  const cases = [];
  for (const m of s.matchAll(FEET)) {
    const n = Number(m[1]);
    // A case is feet of lineup, not inches and not a typo'd hundred.
    if (Number.isFinite(n) && n > 0 && n <= 60) cases.push(n);
  }
  if (!cases.length) return none;
  return { kind: 'lineup', cases, totalFt: cases.reduce((a, b) => a + b, 0) };
}

// The Model column states the same lineup a second way — "48' D6L1, 6' IDD5SL"
// is 54 ft, and so is "12'12'12'12',6'". Used as a CHECK on the Size column
// rather than as a fallback: two readings that agree are worth more than
// either alone, and two that disagree are worth saying out loud.
export function modelTotalFt(text) {
  const s = String(text ?? '');
  let total = 0;
  for (const m of s.matchAll(FEET)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && n <= 200) total += n;
  }
  return total;
}

export function sizesAgree(sizeText, modelText) {
  const parsed = parseCaseSizes(sizeText);
  const model = modelTotalFt(modelText);
  // Nothing to compare is not a disagreement.
  if (parsed.kind !== 'lineup' || !(model > 0)) return null;
  return { sizeFt: parsed.totalFt, modelFt: model, agrees: parsed.totalFt === model };
}

// Copper along the tops, per LINE. Both suction and liquid run it, so the
// caller asks for it twice.
export function caseTopFeet(cases = [], extraPerCase = CASE_TOP_EXTRA_FT) {
  const extra = Number(extraPerCase);
  const per = Number.isFinite(extra) && extra >= 0 ? extra : CASE_TOP_EXTRA_FT;
  return (cases || []).reduce((ft, len) => {
    const n = Number(len);
    return Number.isFinite(n) && n > 0 ? ft + n + per : ft;
  }, 0);
}

// What a circuit contributes, from whatever the takeoff actually knows about
// it. Case sizes are the good answer; a case COUNT with no lengths is the
// fallback, priced at the job's default case length.
//
// → { ft, basis } — basis says which it used, because an estimator checking a
// number needs to know whether it came off the schedule or off a default.
export function circuitCaseTopFeet(circuit = {}, { defaultCaseFt = 12, extraPerCase = CASE_TOP_EXTRA_FT } = {}) {
  const sizes = circuitCaseSizes(circuit).cases;
  if (sizes.length) {
    return { ft: caseTopFeet(sizes, extraPerCase), basis: 'sizes', cases: sizes.length };
  }
  const count = Math.round(Number(circuit.caseCount) || 0);
  if (count > 0) {
    const len = Number(defaultCaseFt) > 0 ? Number(defaultCaseFt) : 12;
    return { ft: caseTopFeet(Array(count).fill(len), extraPerCase), basis: 'count', cases: count };
  }
  // No sizes and no count. NOT a zero dressed up as an answer — the caller
  // has to be able to tell "this lineup has no tops" from "nobody told us how
  // many cases there are", because only one of those is finished.
  return { ft: 0, basis: 'unknown', cases: 0 };
}

// What the app knows about one circuit's cases, from whichever of the two the
// takeoff has: sizes somebody typed, or the Size column carried out of the
// Kysor summary as raw text.
//
// The text is parsed HERE rather than in api/parse-excel.js because that file
// is CommonJS and this one is a module. One reading of the column, on one side
// of that line — two copies of this parser is how they start disagreeing about
// what counts as a lineup.
export function circuitCaseSizes(circuit = {}) {
  const typed = Array.isArray(circuit.caseSizes) ? circuit.caseSizes.filter(n => Number(n) > 0) : [];
  if (typed.length) return { cases: typed, kind: 'lineup', source: 'entered' };
  const parsed = parseCaseSizes(circuit.caseSizeText);
  return { cases: parsed.cases, kind: parsed.kind, source: parsed.cases.length ? 'schedule' : 'none' };
}

// The Size column against the Model column, for a circuit that carries both.
export function circuitSizeCheck(circuit = {}) {
  return sizesAgree(circuit.caseSizeText, circuit.caseModelText);
}
