// ── PAGE-SUMMARY DIGEST ──────────────────────────────────────────────────────
// Every analyzed page returns a one-sentence summary, and they were joined
// end to end into a single paragraph. On a 16-sheet set that is a wall of
// several hundred words, and most of it says nothing:
//
//   "This sheet contains only BMS/controls narrative and instrument
//    identification legend text, not an equipment schedule table; no schedule
//    rows to extract. This page contains BMS/SCADA control narrative and
//    instrumentation tagging convention text … with no actual equipment
//    schedule table present, so no scheduled units can be extracted. This
//    page contains only sequence-of-operation control narrative text …"
//
// Three sentences, one fact, and the fact is "nothing here". Meanwhile the
// summary that matters — "Overall roof plan showing rooftop mechanical
// equipment layout including RTUs, exhaust fans, a make-up air unit,
// dehumidification unit, vendor-package heaters, and split system condensing
// units" — is buried in the middle of it.
//
// This is the same problem flag triage already solved, in a different field,
// so it reuses the same rule: a sentence that describes the DOCUMENT and asks
// nothing of the contractor is transcript. Keep the sheets that say what is
// ON them; drop the ones that say what isn't.
//
// Pure — no React.

import { flagCategory } from './flagTriage.js';
import { textSimilarity } from './flagDedupe.js';

const MAX_SUMMARIES = 12; // beyond this nobody is reading anyway

// One page summary is worth keeping when it describes content rather than
// the absence of content.
export function isUsefulSummary(text) {
  const s = String(text || '').trim();
  if (s.length < 15) return false;
  return flagCategory(s) !== 'diagnostic';
}

// summaries: the per-page sentences, in page order.
// Returns { text, kept, dropped } — text is the joined digest.
export function digestSummaries(summaries = []) {
  const kept = [];
  let dropped = 0;
  for (const raw of summaries) {
    const s = String(raw || '').trim();
    if (!s) continue;
    if (!isUsefulSummary(s)) { dropped += 1; continue; }
    // Sheet summaries repeat heavily across a set ("Overall first floor
    // mechanical plan…" once per sector). Near-duplicates add length and no
    // information.
    if (kept.some(k => textSimilarity(k, s) >= 0.6)) { dropped += 1; continue; }
    kept.push(s);
  }
  const shown = kept.slice(0, MAX_SUMMARIES);
  const overflow = kept.length - shown.length;
  const text = [
    ...shown,
    overflow > 0 ? `(+${overflow} more sheet${overflow === 1 ? '' : 's'})` : '',
  ].filter(Boolean).join(' ');
  return { text, kept: shown.length, dropped: dropped + overflow };
}
