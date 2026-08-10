// ── FLAG DEDUPLICATION ───────────────────────────────────────────────────────
// General notes are printed on EVERY sheet of a drawing set, so analyzing a
// 40-page set produces the same flag over and over — "FOR ALL EXTERIOR
// WALL/ROOF PENETRATIONS, COORDINATE WITH ARCHITECTURAL DRAWINGS" a dozen
// times, "REFER TO DETAIL SHEETS" a dozen more. The handful of flags that
// matter (a misread duct size, a vendor-package callout) end up buried in the
// repeats, which is the same as not surfacing them at all.
//
// Collapsing repeats to one entry with a count is also a storage win: flags are
// saved with the job, and a set that generates 200 near-identical flags eats
// the localStorage quota that a save failure comes from.
//
// Pure — no React. The count is kept so the estimator can still see "this note
// is on 12 sheets", which is itself information.

// Compare on the MESSAGE, ignoring case, punctuation and whitespace noise, so
// "Refer to detail sheets." and "REFER TO DETAIL SHEETS" collapse together.
// Page-number prefixes are stripped too: the same cross-check on pages 4, 5 and
// 7 is one finding, not three.
export function flagKey(text) {
  return String(text || '')
    .replace(/^\s*(?:page|sheet|part)\s*\d+[^:]*:\s*/i, '') // "Page 5 cross-check: …"
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Collapse repeated flags. Keeps first-seen order and the first flag's type and
// text; adds `count` and merges the distinct source documents.
// Returns [{ ...firstFlag, count, sources: [...] }].
export function dedupeFlags(flags = []) {
  const out = [];
  const byKey = new Map();
  for (const f of flags) {
    if (!f) continue;
    const flag = typeof f === 'string' ? { text: f } : f;
    const key = flagKey(flag.text);
    if (!key) continue;
    const hit = byKey.get(key);
    if (hit) {
      hit.count += 1;
      const src = flag.source || '';
      if (src && !hit.sources.includes(src)) hit.sources.push(src);
      // A repeat that arrives as a warning outranks an info-level first sighting.
      if (flag.type === 'warn' && hit.type !== 'warn') hit.type = 'warn';
      continue;
    }
    const entry = { ...flag, count: 1, sources: flag.source ? [flag.source] : [] };
    byKey.set(key, entry);
    out.push(entry);
  }
  return mergeNearDuplicates(out);
}

// ── NEAR-DUPLICATES ──────────────────────────────────────────────────────────
// Exact matching only catches a note printed identically on every sheet. The
// AI also RE-WORDS the same standing note from page to page, and those slip
// through:
//
//   "FOR DUCTWORK AND PIPING PENETRATING PARTITIONS ABOVE THE CEILING, THE
//    CONTRACTOR IS TO PROVIDE SLEEVE AND SEAL THE OPENING BACK TO …"
//   "CONTRACTOR IS TO PROVIDE SLEEVE AND SEAL THE OPENING FOR DUCTWORK AND
//    PIPING PENETRATING PARTITIONS ABOVE THE CEILING; IN THE EVENT THAT …"
//
// One note, twice. Word-set overlap catches the rewrite where exact matching
// can't. The threshold is deliberately HIGH: two scope notes that merely
// rhyme ("provide wire mesh screen at the exhaust duct" vs "…at the return
// duct") are DIFFERENT work at different locations, and silently merging them
// would drop scope from the bid. Losing a duplicate is cosmetic; losing a
// distinct requirement is money.
const NEAR_DUP_THRESHOLD = 0.75;
const MIN_TOKENS = 6; // short notes have too few words for overlap to mean much

const tokenSet = text => new Set(flagKey(text).split(' ').filter(w => w.length > 2));

export function textSimilarity(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  if (A.size < MIN_TOKENS || B.size < MIN_TOKENS) return 0;
  let shared = 0;
  A.forEach(w => { if (B.has(w)) shared += 1; });
  return shared / (A.size + B.size - shared); // Jaccard
}

// Fold flags that say the same thing in different words into the first one,
// keeping whichever wording is LONGER (it carries the most detail) and adding
// the folded flag's count and sources.
export function mergeNearDuplicates(flags = []) {
  const out = [];
  for (const flag of flags) {
    const hit = out.find(k => textSimilarity(k.text, flag.text) >= NEAR_DUP_THRESHOLD);
    if (!hit) { out.push(flag); continue; }
    hit.count = (hit.count || 1) + (flag.count || 1);
    (flag.sources || []).forEach(s => { if (!hit.sources.includes(s)) hit.sources.push(s); });
    if (flag.type === 'warn' && hit.type !== 'warn') hit.type = 'warn';
    // Keep the fuller wording — a rewrite often drops a clause.
    if (String(flag.text || '').length > String(hit.text || '').length) hit.text = flag.text;
  }
  return out;
}

// How much noise was removed — for a one-line "collapsed N repeats" note.
export function dedupeSavings(flags = []) {
  const deduped = dedupeFlags(flags);
  return { before: flags.length, after: deduped.length, removed: flags.length - deduped.length };
}
