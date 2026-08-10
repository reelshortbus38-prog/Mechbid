// ── VISION CROSS-CHECK DIFFER ────────────────────────────────────────────────
// Two AI models read the same drawing; this reports what the SECOND model saw
// that the primary didn't. The primary read stays authoritative — these are
// pointers for a human look, never merged into the takeoff.
//
// The hard part is precision, not recall. A naive "list every tag the second
// model has and the primary doesn't" floods a full set with false alarms:
// the two models tile differently, disagree about what counts as equipment,
// and the weaker one invents plausible tags on dense sheets. Forty "verify on
// the plan" lines that are all wrong is worse than no cross-check at all —
// the estimator stops reading them, including the one that was real.
//
// So finds are graded by whether the primary CORROBORATES the tag family
// (the letters before the first digit: RTU-08 → RTU):
//
//   family the primary knows      → report the tag individually. The primary
//     already found RTU-1…RTU-7 and the second model has an RTU-8: a missed
//     sibling in a known series is the single most likely real miss there is.
//   family the primary never saw, ≥2 members → report ONCE, as a family.
//     "6 EF tags the primary didn't see" on a sheet with no EF at all is the
//     expensive failure — a whole equipment class dropped — and it deserves a
//     line. But one line, not six.
//   family the primary never saw, 1 member  → drop. A lone tag in a class the
//     primary saw nothing of is the exact shape of a hallucination, and it
//     was the bulk of the noise in practice.
//
// Pure — no React, no network, no JSON parsing (callers pass parsed objects).

import { canonicalTag } from '../components/hvacEquip.js';

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

// Letters before the first digit of a canonical tag. RTU-08 → "RTU",
// VAV-M235A → "VAVM", AHU → "AHU". Both models canonicalize identically, so
// the grouping is consistent even where it isn't linguistically perfect.
export function tagFamily(tag) {
  const c = canonicalTag(tag);
  const m = /^[A-Z]+/.exec(c);
  return m ? m[0] : c;
}

// Grade one list of second-model items against the primary's.
// Returns { confirmed: [tag], unknownFamilies: { FAM: [tag] } }.
export function gradeTagFinds(primaryList, secondList, keyFn) {
  const seen = new Set();
  const families = new Set();
  (primaryList || []).forEach(x => {
    const raw = keyFn(x);
    const c = canonicalTag(raw);
    if (!c) return;
    seen.add(c);
    families.add(tagFamily(raw));
  });

  const confirmed = [];
  const unknownFamilies = {};
  const reported = new Set();
  (secondList || []).forEach(item => {
    const raw = keyFn(item);
    const c = canonicalTag(raw);
    if (!c || seen.has(c) || reported.has(c)) return;
    reported.add(c); // the second model repeating itself is not two findings
    const fam = tagFamily(raw);
    if (families.has(fam)) confirmed.push(String(raw));
    else (unknownFamilies[fam] ||= []).push(String(raw));
  });
  return { confirmed, unknownFamilies };
}

// primaryParsed / second: parsed extraction objects (not raw text).
// Returns human-readable fragments; the caller wraps them in flag wording.
export function crossCheckDiff(primaryParsed, second) {
  if (!second || !primaryParsed) return [];
  const msgs = [];

  const grade = (label, listA, listB, keyFn) => {
    const { confirmed, unknownFamilies } = gradeTagFinds(listA, listB, keyFn);
    confirmed.forEach(t => msgs.push(`${label} "${t}"`));
    Object.entries(unknownFamilies).forEach(([fam, tags]) => {
      // A lone tag in a class the primary saw nothing of is noise; a cluster
      // of them is a whole class the primary may have missed.
      if (tags.length < 2) return;
      msgs.push(`${tags.length} "${fam}" ${label}s (${tags.slice(0, 4).join(', ')}${tags.length > 4 ? ', …' : ''}) — a class the primary read found none of`);
    });
  };

  // Circuit IDs are panel-scoped and share the same family shape (A-12 → A).
  grade('circuit', primaryParsed.circuits, second.circuits, c => c.circuitId);
  grade('equipment tag', primaryParsed.equipment, second.equipment, e => e.tag);
  grade('air device', primaryParsed.airDevices, second.airDevices, d => d.tag);

  // Callouts are free text with no family to corroborate against — flag ones
  // whose opening words appear nowhere in the primary's callouts.
  const pTexts = (primaryParsed.fieldTasks || []).map(t => norm(t.desc));
  (second.fieldTasks || []).forEach(t => {
    const head = norm(t.desc).slice(0, 25);
    if (head.length >= 10 && !pTexts.some(pt => pt.includes(head))) {
      msgs.push(`callout "${String(t.desc || '').slice(0, 70)}"`);
    }
  });
  return msgs;
}
