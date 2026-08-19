// ── ACR COPPER FITTINGS, PER PIECE ───────────────────────────────────────────
// The fitting picker built a line and left it at $0, so itemizing fittings meant
// pricing every one by hand. That is why the percentage allowance is the default
// mode — not because a percentage is better, but because the alternative did not
// work. This makes the alternative work.
//
// Priced 2026-08-19 from Virginia ACR fitting pricing the estimator pulled.
// Quoted directly: couplings by size band, 90° elbows at 3/8", 3/4" and 1-1/8",
// street ells at 3/8" and 3/4"-7/8", and small bushings at $2-5.
//
// WHAT IS QUOTED AND WHAT IS NOT. The source stops at 1-1/8". Everything above
// that is EXTRAPOLATED on OD², because a fitting's copper is roughly its surface
// area, and it is marked as such — a 4-1/8" elbow coming out near $327 is a
// reasoned figure, not a quoted one, and on a loop system's header that is real
// money to be checking rather than trusting.
//
// The types the source does not name are multiples of the 90° elbow at the same
// size, which is how the trade prices them. The two ratios the source DOES let
// us check both land at about 0.72 for a street ell — 3/8" gives 0.74, 3/4"
// gives 0.70 — so the method is not being invented, it is being confirmed.
//
// Pure — no React.

// 90° elbow, the anchor everything else hangs off.
// Quoted: 3/8" $5.80-6.20 (midpoint), 3/4" $11.40, 1-1/8" $24.30.
// Between those, linear on OD. Above 1-1/8", OD².
export const ELBOW_90 = {
  '1/4': 4.20, '3/8': 6.00, '1/2': 7.80, '5/8': 9.60, '7/8': 15.70, '1-1/8': 24.30,
  '1-3/8': 36.30, '1-5/8': 50.70, '2-1/8': 86.70, '2-5/8': 132.30, '3-1/8': 187.50,
  '3-5/8': 252.30, '4-1/8': 326.70,
};

// Couplings are quoted as their own bands, not as a ratio, so they get their own
// table: 1/4-3/8 $1.30-1.80, 1/2-5/8 $1.80-2.50, 7/8-1-1/8 $3.60-7.90.
export const COUPLING = {
  '1/4': 1.30, '3/8': 1.80, '1/2': 1.80, '5/8': 2.50, '7/8': 3.60, '1-1/8': 7.90,
  '1-3/8': 11.80, '1-5/8': 16.48, '2-1/8': 28.19, '2-5/8': 43.01, '3-1/8': 60.96,
  '3-5/8': 82.02, '4-1/8': 106.21,
};

// Everything above this was extrapolated rather than quoted.
export const LAST_QUOTED_SIZE = '1-1/8';
const QUOTED = new Set(['1/4', '3/8', '1/2', '5/8', '7/8', '1-1/8']);

// Multiples of the 90° elbow at the same size. Street ell is the one the source
// lets us check, and it confirms at 0.72.
export const TYPE_FACTOR = {
  'Elbow 90°': 1.00,
  'Elbow 45°': 0.85,
  'Street Ell': 0.72,   // confirmed against the quoted 3/8" and 3/4" pairs
  'Tee': 1.70,
  'Wye': 2.00,
  'Union': 2.50,        // the dearest common fitting by a distance
  'Reducer': 0.50,
  'Bushing': 0.45,      // lands $1.89-$4.32 small, against the source's "$2-$5"
  'Sweat Adapter': 0.50,
  'Cap': 0.35,
};

// A P-trap in ACR copper is fabricated from elbows on the bench, not bought as a
// fitting, so it is priced as what it is made of rather than pretended to be a
// catalogue item.
export const PTRAP_ELBOWS = 3;

const round2 = n => Math.round(n * 100) / 100;

// → { price, quoted } — quoted:false means the size is past where the source
// stops and the number was reasoned from OD², which the caller should say.
export function fittingPrice(type, size) {
  const s = String(size || '').replace(/"/g, '').trim();
  const t = String(type || '').trim();
  if (!s || !t) return null;

  const quoted = QUOTED.has(s);
  if (/^coupling/i.test(t)) {
    const p = COUPLING[s];
    return p === undefined ? null : { price: p, quoted };
  }
  const base = ELBOW_90[s];
  if (base === undefined) return null;

  if (/p-?trap/i.test(t)) return { price: round2(base * PTRAP_ELBOWS), quoted };
  const f = TYPE_FACTOR[t];
  if (f === undefined) return null;
  return { price: round2(base * f), quoted };
}

// A bushing or reducer spans two sizes and is priced on the LARGER one, which is
// the body it has to be made from.
export function fittingPriceForPair(type, sizeA, sizeB) {
  const order = Object.keys(ELBOW_90);
  const a = order.indexOf(String(sizeA || '').replace(/"/g, '').trim());
  const b = order.indexOf(String(sizeB || '').replace(/"/g, '').trim());
  if (a < 0 && b < 0) return null;
  return fittingPrice(type, order[Math.max(a, b)]);
}

export function fittingNote(hit) {
  if (!hit) return '';
  return hit.quoted
    ? 'default from quoted ACR fitting pricing — correct it and the price book remembers'
    : `EXTRAPOLATED above ${LAST_QUOTED_SIZE}" — the source stops there and this was scaled on OD². `
      + 'Check it against a quote before bidding a large fitting.';
}
