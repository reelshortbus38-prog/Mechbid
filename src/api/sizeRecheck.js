// ── DUCT SIZE RECHECK ────────────────────────────────────────────────────────
// When a duct size comes back looking wrong — "32x0" with a side missing,
// "19x1" with a digit dropped — the app's only move was to flag it and make
// the estimator open the plan. But there is a second, independent copy of that
// same label sitting right there: the PDF's TEXT LAYER.
//
// The vision model reads a rendered IMAGE. The text layer is what the drafter
// actually typed. They fail in completely different ways, which makes one a
// genuine check on the other: a label that reads "32x0" in a 200-dpi raster
// often reads "32x20" in the text layer, exactly and for free.
//
// So a suspect size gets rechecked against the page text before anyone is
// asked to go look. No second model call, no cost, and a deterministic answer
// rather than another opinion.
//
// The rules are deliberately conservative — a wrong "correction" is worse than
// a flag, because it looks like a fact:
//
//   the known dimension must appear ADJACENT to a candidate in the text
//     ("32x20", not "32" somewhere and "20" elsewhere)
//   the candidate must be a plausible duct dimension (4"-120")
//   two different candidates means ambiguous: report both, correct neither
//
// Pure — no React, no network.

const MIN_DIM = 4;    // smaller than this is not a duct side
const MAX_DIM = 120;  // larger is a room dimension or an elevation

// Is this size worth rechecking, and what do we know for certain about it?
// "32x0"  → { kind: 'zeroSide',     known: 32 }  one side absent
// "19x1"  → { kind: 'droppedDigit', known: 19 }  a 1"-3" side is not real
export function suspectDuctSize(size) {
  const m = String(size || '').match(/(\d{1,3}(?:\.\d+)?)\s*(?:"|″|in)?\s*[x×]\s*(\d{1,3}(?:\.\d+)?)/i);
  if (!m) return null;
  const a = parseFloat(m[1]), b = parseFloat(m[2]);
  const known = Math.max(a, b), other = Math.min(a, b);
  if (known < MIN_DIM) return null;      // nothing solid to search on
  if (other === 0) return { kind: 'zeroSide', known };
  if (other < MIN_DIM) return { kind: 'droppedDigit', known };
  return null;                            // both sides plausible — not suspect
}

// Every dimension the page text pairs with `known` in a WxH label.
export function pairedDimensions(known, pageText) {
  const d = String(known).replace('.', '\\.');
  const re = new RegExp(
    `(?:\\b(\\d{1,3})\\s*(?:"|″|in)?\\s*[x×]\\s*${d}\\b)|(?:\\b${d}\\s*(?:"|″|in)?\\s*[x×]\\s*(\\d{1,3})\\b)`, 'gi');
  const out = new Set();
  for (const m of String(pageText || '').matchAll(re)) {
    const v = parseFloat(m[1] ?? m[2]);
    if (v >= MIN_DIM && v <= MAX_DIM) out.add(v);
  }
  return [...out].sort((x, y) => x - y);
}

// size: what vision read. pageText: that page's text layer.
// Returns null when there is nothing to say, else:
//   { status: 'corrected',  size, from, basis }   one unambiguous match
//   { status: 'ambiguous',  from, candidates }    several — the human decides
//   { status: 'unconfirmed', from, kind }         text layer has no opinion
export function recheckDuctSize(size, pageText) {
  const suspect = suspectDuctSize(size);
  if (!suspect) return null;
  const found = pairedDimensions(suspect.known, pageText);
  if (found.length === 1) {
    return {
      status: 'corrected',
      size: `${suspect.known}x${found[0]}`,
      from: String(size),
      basis: "the drawing's own text layer",
    };
  }
  if (found.length > 1) return { status: 'ambiguous', from: String(size), candidates: found, known: suspect.known };
  return { status: 'unconfirmed', from: String(size), kind: suspect.kind, known: suspect.known };
}

// Repair a page's duct runs in place-ish (returns new objects) and collect the
// flags to raise. runs: [{ size, ... }] straight from the vision read.
export function recheckDuctRuns(runs = [], pageText = '', label = '') {
  const out = [], flags = [];
  const where = label ? `${label}: ` : '';
  for (const r of runs) {
    const verdict = recheckDuctSize(r?.size, pageText);
    if (!verdict || verdict.status === 'unconfirmed') { out.push(r); continue; }
    if (verdict.status === 'corrected') {
      out.push({ ...r, size: verdict.size, sizeCorrectedFrom: verdict.from });
      flags.push({ type: 'info', source: label || undefined,
        text: `${where}duct size "${verdict.from}" was corrected to "${verdict.size}" — the sheet's own text layer carries the full label, so the missing digit was recovered rather than guessed.` });
      continue;
    }
    // Ambiguous: the page pairs the known side with more than one dimension.
    // Naming the candidates turns "go find it" into "pick one".
    out.push(r);
    flags.push({ type: 'warn', source: label || undefined,
      text: `${where}duct size "${verdict.from}" is missing a dimension. The sheet's text layer pairs ${verdict.known}" with ${verdict.candidates.map(c => `${verdict.known}x${c}`).join(' and ')} — check which run this is and fix the size.` });
  }
  return { runs: out, flags };
}
