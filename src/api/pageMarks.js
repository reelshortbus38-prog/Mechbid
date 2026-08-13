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
    if (v.length >= 2 && !out.includes(v)) out.push(v);
  };

  // Quoted fragments first — they are what the flag is naming. Take the head
  // of the quote before any parenthetical gloss, so "40x0 (40"ø SA labeled)"
  // searches for 40x0.
  for (const m of text.matchAll(/"([^"]{2,60})"/g)) {
    add(m[1].split('(')[0]);
    add(m[1]);
  }
  // Then anything shaped like a size or a tag, wherever it appears.
  for (const m of text.matchAll(/\b\d{1,3}\s*[x×]\s*\d{1,3}\b/gi)) add(m[0]);
  for (const m of text.matchAll(/\b\d{1,3}\s*(?:"|″)?\s*[ø⌀∅]/g)) add(m[0]);
  for (const m of text.matchAll(/\b[A-Z]{2,6}[-\s]\d{1,3}(?:-\d{1,3})?\b/g)) add(m[0]);
  return out;
}

// Loose equality for drawing text: case and whitespace vary, and a label may
// carry an inch mark the flag dropped (or the reverse).
function norm(s) {
  return String(s || '').toUpperCase().replace(/["″\s]+/g, '');
}

export function itemMatches(itemStr, term) {
  const a = norm(itemStr), b = norm(term);
  if (!a || b.length < 2) return false;
  return a.includes(b);
}

// items: pdf.js text items — { str, transform, width, height }.
// The transform is [a,b,c,d,e,f]; e/f are the item's x/y in PDF user space,
// which has its origin at the BOTTOM left, so y is flipped for screen use.
// viewportHeight is the page height in the same units.
//
// Returns boxes in PDF space: { x, y, w, h } with y measured from the TOP.
export function findTermBoxes(items = [], terms = [], viewportHeight = 0) {
  const boxes = [];
  for (const term of terms) {
    for (const it of items) {
      if (!itemMatches(it?.str, term)) continue;
      const tr = it.transform || [];
      const x = Number(tr[4]) || 0;
      const yBottom = Number(tr[5]) || 0;
      const h = Math.abs(Number(tr[3])) || Number(it.height) || 10;
      const w = Number(it.width) || (String(it.str).length * h * 0.5);
      boxes.push({ x, y: Math.max(0, viewportHeight - yBottom - h), w, h, str: it.str, term });
    }
    // First term that hits anything wins — later terms are broader fallbacks
    // and would only add noise once something specific matched.
    if (boxes.length) break;
  }
  return boxes;
}
