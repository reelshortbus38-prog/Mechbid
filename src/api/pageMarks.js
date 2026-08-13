// ── FINDING THE LABEL A FLAG IS ABOUT ────────────────────────────────────────
// Opening the right sheet is most of the job, but a mechanical sheet is four
// feet wide and the thing in question is a half-inch label somewhere on it.
// "Duct size 40x0 looks misread" still leaves the estimator scanning.
//
// The PDF text layer knows exactly where that label sits: pdf.js gives every
// text item with a transform matrix, so a string match yields real coordinates
// on the page. Draw a box there and the flag points at its own evidence.
//
// This only works on a vector PDF. A scanned sheet has no text layer and no
// positions, so nothing is marked and the sheet simply opens — same as before,
// never a wrong box.
//
// Pure — no React, no pdf.js. Callers pass the flag's wording and the page's
// text items.

// What a flag is actually about. Flags quote the value in question — duct
// size "40x0 (40"ø SA labeled)", tag "EF-09", "6" EA (exhaust air)" — so the
// quoted fragments are the best terms, and bare size tokens catch the rest.
export function searchTerms(flagText) {
  const text = String(flagText || '');
  const out = [];
  const add = t => {
    const v = String(t || '').trim();
    // A term MUST carry a digit. Without this rule the inch mark — which is
    // itself a double quote — turns "6\" EA (exhaust air…)" into the fragment
    // EA, and EA matches every exhaust-air label on the sheet. A live page
    // came back with four red boxes for a flag about one 6" run.
    if (v.length >= 2 && /\d/.test(v) && !out.includes(v)) out.push(v);
  };

  // PRECISE patterns first. These are what a flag is actually about, and
  // unlike quoted fragments they cannot be broken by an inch mark.
  for (const m of text.matchAll(/\b\d{1,3}\s*[x×]\s*\d{1,3}\b/gi)) add(m[0]);
  for (const m of text.matchAll(/\b\d{1,3}\s*(?:"|″)?\s*[ø⌀∅]/g)) add(m[0]);
  // A size with its service on it: 6" EA, 40"ø SA, 1 1/4" RS.
  for (const m of text.matchAll(/\b\d{1,3}\s*(?:"|″)?\s*[ø⌀∅]?\s*(?:EA|SA|RA|OA|MA|TA|RS|RL|RD|HG)\b/gi)) add(m[0]);
  for (const m of text.matchAll(/\b[A-Z]{2,6}[-\s]\d{1,3}(?:-\d{1,3})?\b/g)) add(m[0]);

  // Quoted fragments last, and only when they carry a digit — they are the
  // richest terms when they survive, and the most easily mangled.
  for (const m of text.matchAll(/"([^"]{2,60})"/g)) {
    add(m[1].split('(')[0]);
    add(m[1]);
  }
  return out;
}

// Loose equality for drawing text: case and whitespace vary, and a label may
// carry an inch mark the flag dropped (or the reverse).
function norm(s) {
  // Diameter symbols go too: the flag says 6" EA where the drawing says
  // 6"ø EA, and they are the same run.
  // Strip BEFORE uppercasing would also work; including both cases is clearer.
  // toUpperCase() turns ø into Ø, and a class holding only the lowercase form
  // silently stopped matching anything at all.
  return String(s || '').toUpperCase().replace(/["″øØ⌀∅\s]+/g, '');
}

export function itemMatches(itemStr, term) {
  const a = norm(itemStr), b = norm(term);
  if (!a || b.length < 2) return false;
  const i = a.indexOf(b);
  if (i < 0) return false;
  // Not mid-number: "16EA" must not match a search for "6EA". Plain substring
  // matching boxed the 16", 14" and 12" runs on a flag about the 6".
  return !(i > 0 && /\d/.test(a[i - 1]));
}

// items: pdf.js text items — { str, transform, width, height }.
// The transform is [a,b,c,d,e,f]; e/f are the item's x/y in PDF user space,
// which has its origin at the BOTTOM left, so y is flipped for screen use.
// viewportHeight is the page height in the same units.
//
// Returns boxes in PDF space: { x, y, w, h } with y measured from the TOP.
// A term that hits half the sheet is not identifying anything. Marking
// everything is the same as marking nothing, except it also misleads.
const MAX_MARKS = 3;

export function findTermBoxes(items = [], terms = [], viewportHeight = 0) {
  let boxes = [];
  for (const term of terms) {
    const found = [];
    for (const it of items) {
      if (!itemMatches(it?.str, term)) continue;
      const tr = it.transform || [];
      const x = Number(tr[4]) || 0;
      const yBottom = Number(tr[5]) || 0;
      const h = Math.abs(Number(tr[3])) || Number(it.height) || 10;
      const w = Number(it.width) || (String(it.str).length * h * 0.5);
      found.push({ x, y: Math.max(0, viewportHeight - yBottom - h), w, h, str: it.str, term });
    }
    // First term that identifies something SPECIFIC wins. A term matching more
    // than a handful of labels is too broad to be the thing the flag meant, so
    // move on rather than box them all.
    if (found.length && found.length <= MAX_MARKS) return found;
    if (found.length && !boxes.length) boxes = found; // remember, in case nothing better turns up
  }
  return boxes.length <= MAX_MARKS ? boxes : [];
}
