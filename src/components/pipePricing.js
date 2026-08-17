// ── HYDRONIC PIPE — DEFAULT MATERIAL PRICE PER FOOT ──────────────────────────
// A read of a piping plan used to land with every line at $0, so a takeoff that
// was otherwise right added nothing to the bid. Pipe is the one material here
// that cannot take a single flat rate: it swings by more than 10x across the
// sizes on one sheet, so it needs a table.
//
// TWO MATERIALS, BECAUSE ONE SHEET USES BOTH. Hydronic runs copper up to about
// 2-1/2" and black steel above it — 4" and 6" copper exist but essentially
// nobody hangs them, and pricing a 6" main as copper would put roughly $250/ft
// against a line that should be nearer $40. A live sheet carried 1/2" through
// 6" on the same drawing, so getting this split wrong is not a corner case.
//
// WHERE THE NUMBERS COME FROM — this matters, because only one of them is real:
//
//   COPPER is derived from the estimator's own figure, 3/4" Type L at $9/ft.
//   Copper cost tracks the weight of metal in the pipe, so every other size is
//   that price scaled by Type L weight per foot. Change the anchor and the whole
//   table moves with it, staying internally consistent.
//
//   STEEL is NOT from the estimator. It is a round placeholder from typical
//   schedule-40 black pipe pricing, and it is flagged as such wherever it is
//   used. Anyone bidding off it should replace it with a real quote.
//
// Everything here is MATERIAL only. Fittings, hangers, valves and insulation
// are their own lines, and labor is bid on the Labor step.

// Type L copper, pounds per foot. This is the physical basis for the scaling —
// not a price, so it does not go stale.
export const COPPER_L_LB_FT = {
  0.5: 0.285, 0.75: 0.455, 1: 0.655, 1.25: 0.884, 1.5: 1.14, 2: 1.75, 2.5: 2.48,
};

// The estimator's quote, and the size it applies to.
export const COPPER_ANCHOR = { dia: 0.75, pricePerFt: 9 };

// Above this, hydronic is black steel rather than copper.
export const COPPER_MAX_IN = 2.5;

// Schedule-40 black steel, material only. PLACEHOLDERS — see the note above.
export const STEEL_40_PER_FT = { 3: 16, 4: 22, 5: 30, 6: 38, 8: 60, 10: 88, 12: 120 };

// Services this table applies to. Refrigerant lines are ACR tubing bought on
// different terms and are left to the lineset rule; gas, condensate and the
// rest keep whatever the generic table already says about them.
const HYDRONIC_RE = /\b(?:C?HWS|C?HWR|HHWS|HHWR|CWS|CWR|CDWS|CDWR|GLYS?|GLYR|HW|CHW|GLY)\b/i;

export function isHydronicService(service) {
  return HYDRONIC_RE.test(String(service || ''));
}

// $/lb implied by the anchor. One number, so the table can never drift out of
// step with the figure it was built from.
export const copperPerLb = (anchor = COPPER_ANCHOR) =>
  (anchor.pricePerFt || 0) / (COPPER_L_LB_FT[anchor.dia] || 1);

const round2 = n => Math.round(n * 100) / 100;

// → { pricePerFt, material, derived } — derived:false means the number is a
// placeholder nobody has verified, which the caller should say out loud.
export function pipeMaterialPrice(dia, anchor = COPPER_ANCHOR) {
  const d = Number(dia);
  if (!(d > 0)) return null;
  if (d <= COPPER_MAX_IN) {
    const lb = COPPER_L_LB_FT[d];
    if (!lb) return null;
    return { pricePerFt: round2(lb * copperPerLb(anchor)), material: 'copper type L', derived: true };
  }
  const steel = STEEL_40_PER_FT[d];
  if (!steel) return null;
  return { pricePerFt: steel, material: 'sch-40 black steel', derived: false };
}

// Pull the nominal size out of a takeoff description: "Pipe — 1-1/2" HWS".
export function pipeDescSize(desc = '') {
  const s = String(desc || '');
  const m = s.match(/(\d{1,2})\s*[-–\s]\s*(\d{1,2})\s*\/\s*(\d{1,2})|(\d{1,2})\s*\/\s*(\d{1,2})|(\d{1,2})(?:\.\d+)?\s*"/);
  if (!m) return 0;
  if (m[1]) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  if (m[4]) return Number(m[4]) / Number(m[5]);
  return Number(m[6]);
}

// The entry point the price table uses. Returns 0 when this module has nothing
// to say, so the caller falls through to its own rules.
export function pipeDefaultPrice(desc = '', anchor = COPPER_ANCHOR) {
  const s = String(desc || '');
  if (!/^\s*pipe\b|—\s*pipe\b/i.test(s)) return 0;
  if (!isHydronicService(s)) return 0;
  const hit = pipeMaterialPrice(pipeDescSize(s), anchor);
  return hit ? hit.pricePerFt : 0;
}
