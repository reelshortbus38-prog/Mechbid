// ── SHEET OVERLAP RESOLUTION ─────────────────────────────────────────────────
// A mechanical set draws the same devices more than once. M0.01 is the overall
// floor plan; M1.03 is "ENLARGED FIRST FLOOR PLAN — BUILDING EAST HIGH BAY",
// a blow-up of one corner of that same floor. The six diffusers in the high
// bay appear on BOTH sheets. They are six diffusers.
//
// Summing every sheet's count gave twelve, and the app's answer was to tell
// the estimator to "trim the double-counted qty on the review screen" — which
// is asking a human to do the one thing they bought the tool to avoid. Worse,
// it is asking them to do it blind: nothing on the screen says WHICH sheets
// overlapped, so the only honest way to trim is to open both sheets and
// recount by hand.
//
// An estimator's actual rule is simple and this encodes it: you take off from
// the overall plan, and you use enlarged/partial plans for detail, not for
// additional count. So sheets are split into two pools by title —
//
//   plan      M0.01 MECHANICAL OVERALL PLAN, M1.01 FIRST FLOOR PLAN …
//   enlarged  M1.03 ENLARGED FIRST FLOOR PLAN, PARTIAL PLAN, blow-ups
//
// — counts SUM within a pool (two floors are two floors; two halves of one
// floor are additive) and the pools are combined with MAX, not addition. The
// enlarged sheet's devices are a subset of the plan pool's, so max is the
// count without the double.
//
// Max, not "ignore the enlarged pool", because sometimes the overall plan
// shows a mechanical room as an empty box and only the enlarged sheet has the
// devices. Max keeps those. The residual error case — an area drawn blank on
// the overall AND detailed on an enlarged sheet, where the true answer is the
// sum — is reported rather than hidden: the per-sheet tally stays in the
// notes, so the two numbers are on the card.
//
// Pure — no React.

import { normalizeDesc } from './scopeText.js';

// Blow-up of an area that a bigger plan already covers.
const ENLARGED_RE = /\benlarged\b|\bpartial\s+(?:plan|floor)\b|\bblow[-\s]?up\b|\benlargement\b/i;

export function sheetRole(drawing) {
  return ENLARGED_RE.test(String(drawing || '')) ? 'enlarged' : 'plan';
}

// contribs: [{ desc, qty, fileName, drawing, ...rest }] — one entry per sheet
// that reported this item. Returns one merged entry per distinct description,
// in first-seen order, carrying:
//   qty            the resolved count (pools summed, then max across pools)
//   summedQty      what naive addition would have given
//   overlapTrimmed true when those two differ — i.e. a double-count was removed
//   tally          per-sheet counts, for the note on the card
export function resolveHvacPartCounts(contribs = []) {
  const byKey = new Map();
  const order = [];

  for (const c of contribs) {
    if (!c) continue;
    const key = normalizeDesc(c.desc);
    if (!key) continue;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { first: c, pools: { plan: 0, enlarged: 0 }, tally: [], sheets: new Set() };
      byKey.set(key, entry);
      order.push(entry);
    }
    const qty = Number(c.qty) || 0;
    const role = sheetRole(c.drawing);
    entry.pools[role] += qty;
    if (qty > 0) entry.tally.push({ sheet: c.drawing || c.fileName || '', qty, role });
    if (c.fileName) entry.sheets.add(c.fileName);
    // Air devices merge on type + face/neck, because that is what you BUY — a
    // type-A 10" neck diffuser is one part number whatever air it is balanced
    // to. The flows still differ, so they are collected rather than dropped:
    // labelling a merged line with the first contribution's CFM states a
    // number that is wrong for most of the count.
    if (Number(c.cfm) > 0) (entry.cfms ||= new Set()).add(Number(c.cfm));
  }

  return order.map(({ first, pools, tally, sheets, cfms }) => {
    const summedQty = pools.plan + pools.enlarged;
    // Both pools have counts → the enlarged sheets are re-drawing what the
    // plan sheets already showed. Take the larger, never the total.
    const qty = pools.plan > 0 && pools.enlarged > 0
      ? Math.max(pools.plan, pools.enlarged)
      : summedQty;
    return {
      ...first,
      qty,
      summedQty,
      overlapTrimmed: qty !== summedQty,
      tally,
      cfms: [...(cfms || [])].sort((a, b) => a - b),
      sources: [...sheets],
    };
  });
}

// What air the merged line actually covers. One flow prints as itself; several
// print as a range with the count, so nobody prices 17 diffusers off the one
// number that happened to be read first.
export function cfmNote(entry) {
  const c = entry?.cfms || [];
  if (!c.length) return '';
  if (c.length === 1) return `${c[0]} CFM`;
  return `${c[0]}–${c[c.length - 1]} CFM (${c.length} different flows on this line)`;
}

// One line for the card's notes: which sheet contributed what. Without this
// the resolved number is unauditable, and an estimator will not stake a bid
// on a number they cannot trace back to a sheet.
export function tallyNote(entry) {
  if (!entry?.tally?.length || entry.tally.length < 2) return '';
  // Collapse repeats of the same sheet. A set can put two areas of one level on
  // one sheet number, and listing "M3.10a: 6, M3.10a: 1, M3.10a: 1, M3.10a: 2"
  // tells the estimator nothing except that something is wrong with the app.
  const bySheet = new Map();
  for (const t of entry.tally) {
    const k = t.sheet || 'sheet';
    bySheet.set(k, (bySheet.get(k) || 0) + t.qty);
  }
  const per = [...bySheet].map(([sheet, qty]) => `${sheet}: ${qty}`).join(', ');
  if (bySheet.size < 2 && !entry.overlapTrimmed) return '';
  return entry.overlapTrimmed
    ? `counted per sheet: ${per} — enlarged/partial sheets re-draw the plan sheets, so these were NOT added (${entry.summedQty} → ${entry.qty})`
    : `counted per sheet: ${per}`;
}
