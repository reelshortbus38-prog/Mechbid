// ── DID THE READ ACTUALLY COVER THE SHEET? ───────────────────────────────────
// Every other check in this app looks at what the AI DID report and asks
// whether it is right. None of them can see what it never reported at all, and
// that is the more dangerous failure: a duct size that was missed does not show
// up wrong on screen, it does not show up at all, and the bid is short by
// however much metal it represented with nothing anywhere saying so.
//
// A vector sheet carries the answer. The text layer lists every label on the
// drawing, so the sizes that are PRESENT can be counted independently of the
// vision read — the same trick the size recheck and the device-face rule use,
// pointed at coverage instead of correctness.
//
// One live sheet (M3.12b, a school job) carries 39 distinct rectangular duct
// sizes across 106 callouts, 4 round diameters across 78, and 155 air devices.
// A read that comes back with 12 duct sizes has missed two thirds of the
// ductwork on the page, and until now nothing would have said so.
//
// This is deliberately phrased as EVIDENCE, not as an accusation. The text
// layer is not a takeoff: a size can appear in a schedule table, a detail
// callout or a general note without being a run on this sheet, and the same
// run can be labeled twice. So the check reports what the sheet's own text
// shows and lets the estimator reconcile it — a named list of sizes to look
// for beats a number that says something is missing.
//
// Pure — no pdf.js, no React.

import { sizeContexts, deviceFaceSizes } from './deviceFace.js';
import { isLinearDevice } from '../components/ductwork.js';

// Rectangular sizes the sheet's text shows standing alone on a run, minus
// everything already known not to be duct: linear device faces (caught by
// aspect) and sizes that only ever appear on a device tag (caught by context).
export function textDuctSizes(pageText = '') {
  const faces = deviceFaceSizes(pageText);
  const out = new Map();
  for (const [size, rec] of sizeContexts(pageText)) {
    if (!rec.alone || faces.has(size)) continue;
    const [w, h] = size.split('x').map(Number);
    if (isLinearDevice(w, h)) continue;
    out.set(size, rec.alone);
  }
  return out;
}

// Round diameters written with any of the diameter marks.
export function textRoundSizes(pageText = '') {
  const out = new Map();
  for (const m of String(pageText || '').matchAll(/(\d{1,2})\s*"?\s*[ø⌀∅]/g)) {
    const d = Number(m[1]);
    if (d > 0) out.set(d, (out.get(d) || 0) + 1);
  }
  return out;
}

const normRect = s => {
  const m = String(s || '').match(/(\d{1,3})\s*[x×]\s*(\d{1,3})/);
  return m ? `${Number(m[1])}x${Number(m[2])}` : '';
};
const normDia = s => {
  const m = String(s || '').match(/(\d{1,2})/);
  return m ? Number(m[1]) : 0;
};

// Listing forty sizes helps nobody. Name enough to act on and count the rest.
const MAX_NAMED = 10;
// Below this the gap is noise — a label in a detail, a size read off a
// schedule stub — and a flag on every sheet trains the estimator to ignore all
// of them. The failure worth interrupting for is a read that missed a
// SUBSTANTIAL part of the drawing.
const MIN_GAP = 3;

// runs: the duct runs the vision read returned for THIS page.
// → flags naming sizes the sheet's text shows but the read did not return.
export function coverageGap(runs = [], pageText = '', label = '') {
  const text = String(pageText || '');
  if (!text.trim()) return { flags: [], missingRect: [], missingRound: [] };

  const gotRect = new Set(), gotRound = new Set();
  for (const r of runs) {
    if (r?.shape === 'round') { const d = normDia(r.size); if (d) gotRound.add(d); }
    else { const s = normRect(r?.size); if (s) gotRect.add(s); }
    // A round run can be written into a rect slot and vice versa; count both
    // readings so a shape mix-up never shows up here as a coverage hole.
    const s = normRect(r?.size); if (s) gotRect.add(s);
    const d = normDia(r?.size); if (d) gotRound.add(d);
  }

  const missingRect = [...textDuctSizes(text).entries()]
    .filter(([s]) => !gotRect.has(s)).sort((a, b) => b[1] - a[1]);
  const missingRound = [...textRoundSizes(text).entries()]
    .filter(([d]) => !gotRound.has(d)).sort((a, b) => b[1] - a[1]);

  const flags = [];
  const pfx = label ? `${label}: ` : '';
  const total = missingRect.length + missingRound.length;
  if (total >= MIN_GAP) {
    const named = [
      ...missingRect.slice(0, MAX_NAMED).map(([s, n]) => `${s} (×${n})`),
      ...missingRound.slice(0, Math.max(0, MAX_NAMED - missingRect.length)).map(([d, n]) => `${d}"ø (×${n})`),
    ];
    const rest = total - named.length;
    flags.push({ type: 'warn', text:
      `${pfx}the sheet's own text shows ${total} duct size(s) the read did not return — ${named.join(', ')}${rest > 0 ? ` and ${rest} more` : ''}. Counts in parentheses are how many times each is labeled on the drawing. Some may be schedule or detail callouts rather than runs on this sheet, but any that ARE runs are missing from the takeoff and are costing nothing in the bid. Open the sheet and reconcile.` });
  }
  return { flags, missingRect, missingRound };
}
