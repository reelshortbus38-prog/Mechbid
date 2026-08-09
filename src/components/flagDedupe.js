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
  return out;
}

// How much noise was removed — for a one-line "collapsed N repeats" note.
export function dedupeSavings(flags = []) {
  const deduped = dedupeFlags(flags);
  return { before: flags.length, after: deduped.length, removed: flags.length - deduped.length };
}
