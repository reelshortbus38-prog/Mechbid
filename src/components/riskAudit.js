// ── WHAT THE DOCUMENTS REQUIRE THAT THE BID DOES NOT ASSUME ─────────────────
// The takeoff answers "how much pipe." Nothing in this app ever answered "under
// what conditions" — and that is where jobs are lost. Two identical takeoffs,
// one on a new build in daylight and one on a live store at night behind dust
// barriers with a 24-hour pressure hold, are not the same job and not the same
// number.
//
// The app already knows this and says so, in its own printed terms:
//
//   "Pricing assumes normal working hours, Monday through Friday, and
//    continuous uninterrupted access to the work areas. Premium time, phased
//    or after-hours work, and remobilization are not included unless stated."
//
// So the proposal DISCLAIMS exactly the conditions nothing ever checked for.
// That is the worst of both: bid at straight time, and holding a piece of
// paper saying it was not included. On a grocery remodel where the spec
// requires night work, "not included" is not a position anybody holds — the
// crew works the nights and the shop eats them.
//
// This reads the scope, the specs and the plan notes for those conditions and
// says which ones are in the documents. It does NOT price them. It cannot:
// what a night shift costs depends on the shop's premium, the crew and the
// local agreement, and inventing a multiplier would be the same sin as every
// other number in here that nobody has checked. It finds the sentence, quotes
// it back, and says what it contradicts.
//
// QUOTING IS THE POINT. A label saying "night work detected" is a claim the
// estimator has to go and verify. The sentence that triggered it is evidence
// he can read in five seconds and act on or dismiss. Every finding carries its
// own words from the document.
//
// Pure — no React, no store, no network.

// A matcher that must NOT fire, and the reason, kept beside the pattern it
// guards so the two are read together.
const NOT = (re, why) => ({ re, why });

// ── THE CONDITIONS ──────────────────────────────────────────────────────────
// `affects` says what an estimator would change if the finding is real:
//   'hours'   the labor number is wrong at straight time
//   'access'  the crew cannot work continuously, so the schedule is wrong
//   'method'  the materials or the process change
//   'terms'   a commercial condition that belongs in the proposal, not the math
export const RISKS = [
  {
    key: 'nightWork',
    title: 'Night or after-hours work',
    affects: 'hours',
    why: 'Bid at straight time this is short by the shop\'s premium on every hour of it.',
    contradicts: 'normal working hours',
    re: [
      /\b(?:after|outside)\s+(?:normal\s+)?(?:store\s+)?(?:business\s+)?hours\b/i,
      /\b(?:night|nights|nightly|overnight|night[- ]?shift|second\s+shift|third\s+shift)\s+(?:work|shift|crew|hours|operations?)\b/i,
      /\bwork\s+(?:shall|will|is to)\s+be\s+performed\s+(?:at\s+night|after|during\s+the\s+night)/i,
      /\bafter\s+(?:the\s+)?store\s+clos(?:es|ing|ure)\b/i,
      /\bnon[- ]business\s+hours\b/i,
      /\b(?:10|11|12)\s*(?:p\.?m\.?|:00\s*p\.?m\.?)\s*(?:to|-|–|until)\s*\d/i,
    ],
    not: [
      NOT(/\bovernight\s+(?:ship|deliver|mail|courier)/i, 'overnight shipping is not night work'),
    ],
  },
  {
    key: 'phasing',
    title: 'Phased or sequenced construction',
    affects: 'access',
    why: 'Every phase is its own mobilization, and the terms exclude remobilization unless stated.',
    contradicts: 'continuous uninterrupted access',
    re: [
      /\bphas(?:ed|ing)\s+(?:construction|work|schedule|plan|approach|sequence)\b/i,
      /\bin\s+(?:multiple|two|three|four|\d+)\s+phases\b/i,
      /\bphase\s+(?:1|2|3|one|two|three|i\b|ii\b)/i,
      /\bphasing\s+(?:plan|requirements?|schedule)\b/i,
      /\bsequence\s+of\s+(?:work|operations|construction)\b/i,
    ],
    not: [
      // The single biggest false positive in this trade. Every panel schedule
      // and every compressor nameplate says "3 phase".
      NOT(/\b(?:single|three|two|1|3|2)[\s-]?phase\b/i, 'electrical phase, not construction phasing'),
      NOT(/\bphase\s+(?:converter|monitor|loss|protect|imbalance|rotation)\b/i, 'electrical device'),
      NOT(/\bphase\s+change\s+material\b/i, 'a material, not a schedule'),
    ],
  },
  {
    key: 'occupied',
    title: 'Store stays open during the work',
    affects: 'hours',
    why: 'Working around shoppers is slower than an empty building, and nothing here accounts for it.',
    contradicts: 'continuous uninterrupted access',
    re: [
      /\bstore\s+(?:will\s+)?(?:remain|remains|stay|stays)\s+open\b/i,
      /\b(?:occupied|fully\s+operational)\s+(?:store|building|facility|space)\b/i,
      /\bremain\s+(?:fully\s+)?operational\s+(?:during|throughout)\b/i,
      /\bcustomers?\s+(?:will\s+be\s+)?present\b/i,
      /\bwhile\s+the\s+store\s+is\s+(?:open|operating)\b/i,
    ],
  },
  {
    key: 'height',
    title: 'Work above roughly 12 feet',
    affects: 'hours',
    why: 'Lift time, and everything carried up. Also a rental line that may not be on the bid.',
    contradicts: null,
    re: [
      // No \b after the unit: an apostrophe is not a word character, so
      // `18'\b` can never match. It cost two of these patterns silently.
      /\b(?:1[2-9]|[2-9]\d)\s*(?:['\u2019]|ft\.?|feet)[^.]{0,60}?\b(?:deck|ceiling|roof|structure|above\s+finished\s+floor|a\.?f\.?f\.?|elevation|high)\b/i,
      /\b(?:deck|ceiling|roof)\s+(?:height|elevation)[^.]{0,30}?\b(?:1[2-9]|[2-9]\d)\s*(?:['\u2019]|ft\.?|feet)/i,
      /\b(?:boom|articulating|scissor)\s+lift\s+(?:required|necessary|will\s+be)\b/i,
      /\bhigh\s+(?:bay|ceiling)\b/i,
    ],
  },
  {
    key: 'pressureTest',
    title: 'Extended pressure test or evacuation spec',
    affects: 'hours',
    why: 'A 24-hour standing hold is a day the crew is not piping, and it has to be manned and logged.',
    contradicts: null,
    re: [
      /\b(?:24|48|72)\s*[- ]?\s*(?:hour|hr\.?)\b[^.]{0,50}?\b(?:hold|standing|pressure|test|leak)\b/i,
      /\bnitrogen\s+(?:hold|stand|standing\s+pressure|pressure\s+test)\b/i,
      /\b(?:250|300|500)\s*microns?\b/i,
      /\bstanding\s+pressure\s+test\b/i,
      /\btriple\s+evacuat/i,
    ],
  },
  {
    key: 'specialtyAlloy',
    title: 'CO₂ transcritical or K65 piping',
    affects: 'method',
    why: 'High-pressure alloy: different fittings, different brazing, different qualification.',
    contradicts: null,
    re: [
      /\bk[- ]?65\b/i,
      /\btranscritical\b/i,
      /\br[- ]?744\b/i,
      /\bco2\s+(?:rack|system|booster|refrigeration)\b/i,
    ],
  },
  {
    key: 'barriers',
    title: 'Dust barriers or containment',
    affects: 'access',
    why: 'Built, moved and taken down every shift on a live store — real hours nobody bid.',
    contradicts: 'continuous uninterrupted access',
    re: [
      /\b(?:dust|temporary|temp\.?)\s+(?:barrier|partition|wall|enclosure)s?\b/i,
      /\bcontainment\s+(?:required|barrier|area)\b/i,
      /\bnegative\s+air\b/i,
      /\bpoly\s+(?:sheeting|barrier)\b/i,
    ],
  },
  {
    key: 'wage',
    title: 'Prevailing wage or certified payroll',
    affects: 'terms',
    why: 'The labor rate on this bid is the shop\'s, not the determination\'s.',
    contradicts: null,
    re: [
      /\bprevailing\s+wage\b/i,
      /\bdavis[- ]?bacon\b/i,
      /\bcertified\s+payroll\b/i,
      /\bunion\s+(?:labor|shop|agreement|scale|wages?)\b/i,
    ],
    not: [
      // A union is also a pipe fitting, and this trade buys them by the box.
      NOT(/\b(?:dielectric|ground\s+joint|flare|brass|black|malleable)\s+union\b/i, 'a fitting, not labor'),
    ],
  },
  {
    key: 'badging',
    title: 'Background checks, badging or escort',
    affects: 'access',
    why: 'Days before the crew can start, and an escort means they cannot split up.',
    contradicts: null,
    re: [
      /\bbackground\s+checks?\b/i,
      /\bbadg(?:e|es|ing)\s+(?:required|process|shall)\b/i,
      /\bescort(?:ed)?\s+(?:at\s+all\s+times|required|by\s+store)\b/i,
      /\bsecurity\s+clearance\b/i,
    ],
  },
  {
    key: 'liquidatedDamages',
    title: 'Liquidated damages',
    affects: 'terms',
    why: 'A schedule with a price on it. Worth reading before the schedule is agreed to.',
    contradicts: null,
    re: [
      /\bliquidated\s+damages\b/i,
      /\$\s*[\d,]+\s*(?:per|\/)\s*(?:calendar\s+)?day\b[^.]{0,40}\bdelay\b/i,
    ],
  },
];

const SENTENCE_SPLIT = /(?<=[.!?;])\s+|\n+/;

function sentencesOf(text) {
  return String(text || '')
    .split(SENTENCE_SPLIT)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 0);
}

// Trim a long sentence around the part that matched, so the quote is readable
// without losing the words that caused it.
export function excerpt(sentence, re, max = 220) {
  const s = String(sentence || '');
  if (s.length <= max) return s;
  const m = s.match(re);
  const at = m && typeof m.index === 'number' ? m.index : 0;
  const start = Math.max(0, at - Math.floor(max / 3));
  const end = Math.min(s.length, start + max);
  return (start > 0 ? '…' : '') + s.slice(start, end).trim() + (end < s.length ? '…' : '');
}

function suppressed(sentence, risk) {
  return (risk.not || []).some(n => n.re.test(sentence));
}

// → findings for one document's text.
// Each finding is one CONDITION, carrying up to `maxQuotes` sentences that
// showed it — an estimator wants to know a thing is true and see why, not read
// forty copies of the same clause from a spec that repeats itself.
export function auditText(text, { source = '', maxQuotes = 3 } = {}) {
  const sentences = sentencesOf(text);
  const found = [];

  for (const risk of RISKS) {
    const quotes = [];
    for (const sentence of sentences) {
      if (suppressed(sentence, risk)) continue;
      const hit = risk.re.find(re => re.test(sentence));
      if (!hit) continue;
      const q = excerpt(sentence, hit);
      if (!quotes.some(x => x.text === q)) quotes.push({ text: q, source });
      if (quotes.length >= maxQuotes) break;
    }
    if (quotes.length) {
      found.push({
        key: risk.key, title: risk.title, affects: risk.affects,
        why: risk.why, contradicts: risk.contradicts, quotes,
      });
    }
  }
  return found;
}

// → findings across every document, with quotes merged per condition so the
// same requirement appearing in the scope AND the spec reads as one thing.
export function auditDocuments(docs = [], opts = {}) {
  const byKey = new Map();
  for (const doc of docs || []) {
    if (!doc || !doc.text) continue;
    for (const f of auditText(doc.text, { ...opts, source: doc.name || '' })) {
      const existing = byKey.get(f.key);
      if (!existing) { byKey.set(f.key, { ...f, quotes: [...f.quotes] }); continue; }
      for (const q of f.quotes) {
        if (!existing.quotes.some(x => x.text === q.text)) existing.quotes.push(q);
      }
    }
  }
  // Stable, meaningful order: the ones that change the hours first.
  const rank = { hours: 0, access: 1, method: 2, terms: 3 };
  return [...byKey.values()].sort((a, b) => (rank[a.affects] ?? 9) - (rank[b.affects] ?? 9));
}

// ── THE CONTRADICTION ───────────────────────────────────────────────────────
// A finding whose `contradicts` phrase appears in the printed terms is not
// just a note. The documents require it and the proposal says it was not
// priced, which is the position nobody can hold.
export function contradictedTerms(findings = [], terms = []) {
  const text = (terms || []).join(' ').toLowerCase();
  return (findings || []).filter(f => f.contradicts && text.includes(f.contradicts.toLowerCase()));
}

export function riskSummary(findings = []) {
  const list = findings || [];
  return {
    total: list.length,
    hours: list.filter(f => f.affects === 'hours').length,
    access: list.filter(f => f.affects === 'access').length,
    method: list.filter(f => f.affects === 'method').length,
    terms: list.filter(f => f.affects === 'terms').length,
  };
}

// ── READING WHAT THE APP ALREADY PULLED OUT OF THE DOCUMENTS ────────────────
// Raw file text is not kept — a job stores the FLAGS the analyzers extracted,
// which is the scope language and the plan notes, and those persist with the
// job. So that is what this reads, and it keeps working after a save and
// reload when the original PDF is long gone.
//
// Diagnostics are skipped. Those are the analyzer talking about its own run
// ("no schedule table on this sheet") and contain no requirement — auditing
// them would only invent findings out of the app's own housekeeping.
export function auditFlags(flags = [], triage, opts = {}) {
  const split = triage ? triage(flags) : { actionable: (flags || []).filter(Boolean) };
  const docs = (split.actionable || []).map(f => ({
    name: f.source || 'document',
    text: f.text || '',
  }));
  return auditDocuments(docs, opts);
}
