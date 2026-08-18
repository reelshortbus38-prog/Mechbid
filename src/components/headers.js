// ── SHARED SUCTION HEADERS ON A LOOP SYSTEM ──────────────────────────────────
// On a loop layout — the one Kroger and Walmart run — a large suction HEADER
// leaves the rack and circles the sales floor, and every case lineup taps into
// it. The header is ONE pipe serving many circuits.
//
// The circuit table has no place for that, and both ways of coping with the gap
// are wrong by a wide margin:
//
//   Enter each circuit's full distance back to the rack, and the header gets
//   counted once PER CIRCUIT — thirty circuits buys thirty headers.
//
//   Enter only the branch from the tap, which is correct for the circuit, and
//   the header is missing from the takeoff entirely — and on a loop system it
//   is the largest pipe on the job, 3-5/8 or 4-1/8 running the length of the
//   store.
//
// So the header is entered ONCE, on its own, and folded into the takeoff once.
// Circuits then carry what they should have carried all along: the branch from
// the tap to the case.
//
// Insulation follows the same rule the circuits use — suction is insulated at
// its temperature, low-temp liquid is insulated, medium-temp liquid is not.
//
// Pure — no React.

export const newHeader = (id) => ({
  id, label: '', size: '', lengthFt: 0, lineType: 'suction', tempType: 'medium',
});

// Which insulation bucket a header belongs in, or null for the one combination
// that does not get insulated at all.
export function headerInsulCategory(header = {}) {
  const low = header.tempType === 'low';
  if (header.lineType === 'liquid') return low ? 'lowLiquid' : null;
  return low ? 'lowSuction' : 'medSuction';
}

// headers: [{ size, lengthFt, lineType, tempType }]
// normalize: the app's pipe-size normalizer, passed in so this module stays
// free of store imports.
//
// → { copperBySize, medSucBySize, lowSucBySize, lowLiqBySize, horizFt }
// Buckets are keyed the same way the circuit fold keys them, so a caller merges
// rather than special-cases.
export function foldHeaders(headers = [], normalize = (s) => String(s || '')) {
  const copperBySize = {}, medSucBySize = {}, lowSucBySize = {}, lowLiqBySize = {};
  let horizFt = 0;

  for (const h of headers) {
    const ft = Number(h?.lengthFt) || 0;
    const size = h?.size ? normalize(h.size) : '';
    if (!size || ft <= 0) continue;

    copperBySize[size] = (copperBySize[size] || 0) + ft;
    // A header runs horizontally down the store, so it carries hangers the same
    // way a circuit's horizontal run does.
    horizFt += ft;

    const cat = headerInsulCategory(h);
    if (cat === 'medSuction') medSucBySize[size] = (medSucBySize[size] || 0) + ft;
    else if (cat === 'lowSuction') lowSucBySize[size] = (lowSucBySize[size] || 0) + ft;
    else if (cat === 'lowLiquid') lowLiqBySize[size] = (lowLiqBySize[size] || 0) + ft;
  }

  return { copperBySize, medSucBySize, lowSucBySize, lowLiqBySize, horizFt };
}

// Merge a header bucket into a circuit bucket, in place-free fashion.
export function mergeBySize(base = {}, add = {}) {
  const out = { ...base };
  for (const [k, v] of Object.entries(add)) out[k] = (out[k] || 0) + v;
  return out;
}

// A loop system whose circuits average a long run AND has no header entered is
// very likely carrying the header inside every circuit — thirty copies of it.
// Worth saying out loud rather than silently pricing.
export const LONG_RUN_FT = 120;

export function headerSanityNote(circuits = [], headers = []) {
  const entered = headers.some(h => (Number(h?.lengthFt) || 0) > 0 && h?.size);
  if (entered) return '';
  const runs = circuits.map(c => Number(c?.runLength) || 0).filter(n => n > 0);
  if (runs.length < 4) return '';
  const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
  if (avg < LONG_RUN_FT) return '';
  return `${runs.length} circuits average ${Math.round(avg)} ft of run and no shared header is entered. `
    + 'On a loop system the header is one pipe every circuit taps — if those run lengths reach all the way '
    + 'back to the rack, the header is being bought once per circuit. Enter it once here and shorten the '
    + 'circuits to the branch from the tap.';
}
