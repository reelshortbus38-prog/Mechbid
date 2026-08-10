// ── COVERAGE-GAP RESOLUTION ──────────────────────────────────────────────────
// The analyzers emit a whole species of flag that reads like a problem but
// usually isn't:
//
//   "Referenced exhaust fan tags EF-01, EF-02, EF-04, EF-05, EF-08 appear only
//    within sequence-of-operation narrative text, not as rows in a schedule
//    table … so they cannot be extracted as scheduled equipment from this page."
//
// That is a per-page statement. It is TRUE of that page and irrelevant to the
// bid whenever the schedule sheet three pages later carried those same units —
// which is the normal case in a real set. The estimator gets eight of these
// lines and has to hand-check every tag against the takeoff to learn that
// nothing is actually missing.
//
// So resolve them against the takeoff instead of printing them:
//
//   every tag already in the equipment list → the page note is bookkeeping.
//     Demoted to a diagnostic; still viewable, never in the way.
//   some tag NOT in the equipment list → that is a real hole. Those tags were
//     drawn but never scheduled, so there is no size, model or CFM to price
//     them with. Collected across every page and reported ONCE, naming only
//     the tags that are genuinely missing.
//
// The estimator's question is "is anything missing?", and this answers it
// directly instead of handing over the evidence to check by hand.
//
// Pure — no React.

import { canonicalTag, expandEquipTags, proseTagRe } from './hvacEquip.js';

// The analyzer explaining that it saw a tag but could not schedule it.
const COVERAGE_RE = /\b(?:cannot|could not|couldn't) be extracted\b|\bnot (?:be )?extracted as\b|\bnot as rows in a schedule\b|\b(?:have|has) no associated schedule data\b|\bno schedule data\b|\bnot a scheduled equipment tag\b|\bnot separate scheduled equipment\b|\bappears? only within\b|\breferenced only within\b|\b(?:referenced|mentioned)\b.{0,40}?\b(?:sequence of operation|sequence-of-operation|narrative)\b|\bnot provided in this text\b|\bshares? a sequence of operation\b/i;

// Tags as they appear inside prose — the shared prose pattern, which knows
// the real equipment prefixes instead of matching any capitalised word plus a
// number, and accepts the space form ("CU 1-3") that real sets use. Bare class
// names ("RTU", "VAV terminal units") carry no unit number and are skipped:
// there is nothing to look up.
const TAG_IN_PROSE_RE = proseTagRe('g');
// "VRF-01 thru VRF-06" written into a sentence.
const RANGE_IN_PROSE_RE = new RegExp(`\\b(${proseTagRe().source})\\s*(?:THRU|THROUGH)\\s*((?:[A-Z]{2,6}[\\s-])?\\d{1,3})\\b`, 'gi');

export function isCoverageFlag(flag) {
  const text = String((typeof flag === 'string' ? flag : flag?.text) || '');
  return COVERAGE_RE.test(text);
}

// Every equipment tag named in a flag's text, ranges expanded.
export function extractFlagTags(text) {
  const s = String(text || '');
  const out = [];
  const seen = new Set();
  const add = t => {
    const c = canonicalTag(t);
    if (c && !seen.has(c)) { seen.add(c); out.push(t); }
  };
  for (const m of s.matchAll(RANGE_IN_PROSE_RE)) {
    // Reuse the tag-range expander rather than re-deriving padding rules.
    expandEquipTags({ tag: `${m[1]} THRU ${m[2]}` }).forEach(e => add(e.tag));
  }
  for (const m of s.matchAll(TAG_IN_PROSE_RE)) add(m[0]);
  return out;
}

// flags: the merged flag list. equipment: the takeoff's equipment entries.
// Returns a NEW flag list with covered page-notes demoted and one aggregate
// warning added for tags that were never scheduled anywhere.
export function resolveCoverageFlags(flags = [], equipment = []) {
  const known = new Set();
  (equipment || []).forEach(e => {
    const c = canonicalTag(e?.tag);
    if (c) known.add(c);
  });

  const gaps = new Map(); // canonical → the tag as it was written
  const out = [];

  for (const f of flags) {
    if (!f) continue;
    const flag = typeof f === 'string' ? { text: f } : f;
    if (!isCoverageFlag(flag)) { out.push(flag); continue; }

    const tags = extractFlagTags(flag.text);
    // No tags to resolve — it's the analyzer describing the sheet, not a
    // coverage claim. Let flag triage place it.
    if (!tags.length) { out.push({ ...flag, category: 'diagnostic' }); continue; }

    const missing = tags.filter(t => !known.has(canonicalTag(t)));
    if (!missing.length) {
      // Every tag it worried about is already priced. Bookkeeping.
      out.push({ ...flag, category: 'diagnostic' });
      continue;
    }
    // Superseded by the aggregate below — keep the evidence out of the way
    // but not lost.
    out.push({ ...flag, category: 'diagnostic' });
    missing.forEach(t => gaps.set(canonicalTag(t), t));
  }

  if (gaps.size) {
    const list = [...gaps.values()];
    out.push({
      type: 'warn',
      category: 'scope', // a real hole in the bid — never demote this
      source: 'System',
      text: `${list.length} equipment tag(s) appear on the drawings but were never found in any schedule: ${list.join(', ')}. There is no size, model or CFM to price them — check for a missing schedule sheet before bidding.`,
    });
  }
  return out;
}
