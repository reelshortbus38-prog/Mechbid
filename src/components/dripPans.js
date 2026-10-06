// ── DRIP PANS ARE FABRICATED, NOT BOUGHT ────────────────────────────────────
// First pass had these as a purchased part generated on every refrigeration
// job. Both halves were wrong:
//
//   "We fabricate our own pans. 16" wide with 1 1/2" lips with 1/4"-1/2" fold
//    on the lips. Each circuit is anywhere from 4"-8" wide so one pan
//    generally covers 2-4 circuits. The pans should probably be manually added
//    because some stores don't have drop ceilings."
//
// So: flat stock and shop time, not a catalogue number. And NOT generated —
// a store with no drop ceiling needs none, and a line that turns up on every
// job and reads zero is a line people learn to scroll past.
//
// ── THE BLANK IS WIDER THAN THE PAN ─────────────────────────────────────────
// What gets ordered is flat stock, and the flat width is the pan plus
// everything folded out of it:
//
//   16" floor + 1-1/2" lip each side + the hem folded on each lip
//   16 + 3 + 2 × fold  →  19-1/2" at a 1/4" hem, 20" at 1/2"
//
// The DEFAULT TAKES THE LARGER. A blank cut half an inch narrow is scrap; half
// an inch wide is half an inch of waste on a sheet that was going to have some
// anyway.
//
// ── AND PANS RUN SIDE BY SIDE, NOT JUST END TO END ──────────────────────────
// The first version counted the route end to end and stopped there. A pan is
// 16" and the circuits on the route are 4-8" wide each, so a wide bundle takes
// more than one pan ACROSS as well:
//
//   circuits per pan = 16" ÷ circuit width
//   4" circuits → 4     6" → 2     8" → 2
//
// which is the "2-4" he gave, arrived at from the geometry rather than written
// down as a range. Eleven circuits down a back hall at 6" each is two pans
// wide for the whole length of it — double what the first version counted.
//
// Pure — no React, no store.

// ── WHAT GETS BOUGHT IS A SHEET ─────────────────────────────────────────────
// "we get sheet metal in 4' x 8' sheets and we fabricate our own in our shop.
//  Other companies may have to buy them already built"
//
// Two things in one sentence.
//
// The line said linear feet of blank, which is a true description of what gets
// CUT and not of anything anybody orders. A 4x8 sheet is 48" across, a blank is
// 20", so a sheet yields TWO pans and 8" of scrap down one edge. 72 pans is 36
// sheets — that is the number on a purchase order, and "576 ft of 20" stock"
// is not.
//
// Three across would need a blank under 16", which is the pan floor with no
// lips. It does not fit and the arithmetic says so rather than rounding its way
// into a sheet that does not exist.
//
// AND NOT EVERY SHOP HAS A BRAKE. His does; he said plainly that others do not.
// A shop that buys them finished wants pans by the each, not sheets they have
// no way to fold — so it is a setting, and it is the kind that belongs to the
// company rather than the job, because it is a fact about the shop's building.
export const SHEET_WIDTH_IN = 48;
export const SHEET_LENGTH_FT = 8;
export const SOURCE_FABRICATE = 'fabricate';
export const SOURCE_BUY = 'buy';

export const PAN_LENGTH_FT = 8;
export const PAN_WIDTH_IN = 16;
export const LIP_IN = 1.5;
// 1/4"-1/2". The larger, because a blank cut narrow is scrap.
export const FOLD_IN = 0.5;
// 4"-8". The middle, and the direction each way errs is in the note on the
// line: narrower circuits mean more fit per pan and fewer pans.
export const CIRCUIT_WIDTH_IN = 6;

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Flat width to cut, in inches: the pan floor plus both lips plus both hems.
export function blankWidthIn({ widthIn = PAN_WIDTH_IN, lipIn = LIP_IN, foldIn = FOLD_IN } = {}) {
  return num(widthIn, PAN_WIDTH_IN) + 2 * num(lipIn, LIP_IN) + 2 * num(foldIn, FOLD_IN);
}

// How many circuits sit in one pan, from the geometry rather than a remembered
// range. Always at least one — a circuit wider than the pan still gets a pan.
export function circuitsPerPan({ widthIn = PAN_WIDTH_IN, circuitWidthIn = CIRCUIT_WIDTH_IN } = {}) {
  return Math.max(1, Math.floor(num(widthIn, PAN_WIDTH_IN) / num(circuitWidthIn, CIRCUIT_WIDTH_IN)));
}

// Whole pans out of one sheet. A pan longer than the sheet cannot be made from
// one at all — that is a splice, not a cut, and it returns 0 so the caller can
// say so instead of quietly selling a sheet that will not do it.
export function pansPerSheet({
  widthIn = PAN_WIDTH_IN, lipIn = LIP_IN, foldIn = FOLD_IN, panFt = PAN_LENGTH_FT,
  sheetWidthIn = SHEET_WIDTH_IN, sheetLengthFt = SHEET_LENGTH_FT,
} = {}) {
  const blank = blankWidthIn({ widthIn, lipIn, foldIn });
  const sheetW = num(sheetWidthIn, SHEET_WIDTH_IN);
  const sheetL = num(sheetLengthFt, SHEET_LENGTH_FT);
  if (num(panFt, PAN_LENGTH_FT) > sheetL) return 0;
  return Math.floor(sheetW / blank);
}

// → { long, wide, pans, blankFt, sheets } — pans along the route and across the
// bundle, and the sheets they are cut from.
export function panLayout({
  coveredFt = 0, circuits = 1, panFt = PAN_LENGTH_FT,
  widthIn = PAN_WIDTH_IN, circuitWidthIn = CIRCUIT_WIDTH_IN,
} = {}) {
  const ft = Number(coveredFt) || 0;
  const len = num(panFt, PAN_LENGTH_FT);
  if (!(ft > 0)) return { long: 0, wide: 0, pans: 0, blankFt: 0 };
  const perPan = circuitsPerPan({ widthIn, circuitWidthIn });
  const long = Math.ceil(ft / len);
  const wide = Math.max(1, Math.ceil((Math.round(Number(circuits) || 0) || 1) / perPan));
  const pans = long * wide;
  const per = pansPerSheet({ ...arguments[0], panFt: len });
  return {
    long, wide, pans, blankFt: pans * len, perPan,
    perSheet: per,
    // 0 per sheet means the pan is longer than the sheet. No sheet count is
    // honest there, and a note on the line says why.
    sheets: per > 0 ? Math.ceil(pans / per) : 0,
  };
}

// The material line. SHEETS for a shop that fabricates, finished PANS for one
// that does not — the shop time to brake them is labor either way and is
// deliberately not priced here.
export function dripPanLines(opts = {}) {
  const l = panLayout(opts);
  if (!(l.pans > 0)) return [];
  const blank = blankWidthIn(opts);
  const len = num(opts.panFt, PAN_LENGTH_FT);
  const width = num(opts.widthIn, PAN_WIDTH_IN);
  const lip = num(opts.lipIn, LIP_IN);
  const fold = num(opts.foldIn, FOLD_IN);
  const fmtIn = n => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
  const layoutNote = `${l.pans} pan(s) — ${l.long} along the route × ${l.wide} across `
    + `(${l.perPan} circuit(s) per pan at ${fmtIn(num(opts.circuitWidthIn, CIRCUIT_WIDTH_IN))}" each).`;

  if (opts.source === SOURCE_BUY) {
    return [{
      section: 'Hardware', dripPan: true, dripPanSource: SOURCE_BUY,
      desc: `Drip pans — ${fmtIn(width)}" × ${len}', bought finished`,
      qty: l.pans, unit: 'ea', unitCost: 0, total: 0,
      pans: l.pans, panLong: l.long, panWide: l.wide,
      notes: layoutNote,
    }];
  }

  const sheetW = num(opts.sheetWidthIn, SHEET_WIDTH_IN);
  const sheetL = num(opts.sheetLengthFt, SHEET_LENGTH_FT);
  const sheetNote = l.perSheet > 0
    ? `${l.perSheet} pan(s) per ${fmtIn(sheetW / 12)}' × ${fmtIn(sheetL)}' sheet `
      + `(${fmtIn(blank)}" blank into ${fmtIn(sheetW)}"), `
      + `${fmtIn(sheetW - l.perSheet * blank)}" off the edge of each.`
    : `A ${len}' pan does not come out of a ${fmtIn(sheetL)}' sheet — order longer stock or `
      + 'splice, and set the pan length to what you actually brake.';

  return [{
    section: 'Hardware', dripPan: true, dripPanSource: SOURCE_FABRICATE,
    desc: l.sheets > 0
      ? `Sheet metal for drip pans — ${fmtIn(sheetW / 12)}' × ${fmtIn(sheetL)}' sheets`
      : `Sheet metal for drip pans — ${fmtIn(blank)}" blank × ${len}' per pan`,
    qty: l.sheets > 0 ? l.sheets : l.blankFt,
    unit: l.sheets > 0 ? 'sheet' : 'ft',
    unitCost: 0, total: 0,
    pans: l.pans, panLong: l.long, panWide: l.wide, blankWidthIn: blank, sheets: l.sheets,
    notes: `${layoutNote} ${sheetNote} Broken to ${fmtIn(width)}" wide with ${fmtIn(lip)}" lips `
      + `and a ${fmtIn(fold)}" hem. Shop time to brake them is labor, not here.`,
  }];
}
