// ── HVAC EQUIPMENT PARTITION (plan vs schedule) ─────────────────────────────────
// When a job carries both plan sheets and an equipment SCHEDULE, the same unit
// appears on both — a VAV-M101 is drawn on the plan AND listed in the schedule
// table. Counting it in both places silently inflates the bid. The schedule is
// the authoritative source, so when any collected unit came from a schedule we
// DROP the ones vision read off the plans. With no schedule in the batch, every
// plan unit maps through unchanged.
//
// Pure and batch-level: it takes every collected unit at once (units may span
// files — plans in one upload, schedules in another) and decides suppression
// from the whole batch. Kept out of the React component so it's unit-testable.
//
// Input: array of { e, fileName, drawing } where e is a raw extracted unit
//   { tag, category:'major'|'terminal', type, model, size, cfm, electrical,
//     notes, source } (source==='schedule' marks the authoritative rows).
// Output:
//   hasSchedule  — did the batch contain any schedule-sourced unit?
//   suppressed   — how many plan-read units were set aside as duplicates
//   major        — [{ e, fileName, drawing }] deduped by tag → Equipment cards
//   terminals    — [{ type, model, size, qty, fileName, drawing }] grouped
//                  terminal boxes (VAV/FPB) → one counted material line each
// A terminal air unit — VAV / CV / fan-powered / PIU / reheat box — the kind
// that repeats by the dozen and should group into counted material lines, not
// flood the Equipment step as individual cards. Derived from the type/tag, NOT
// the model's separate "category" field: that label swings run to run (one read
// called a sheet's VAV boxes 109 "terminal", the next called the same 31), which
// bounced ~80 boxes between grouped lines and individual cards. The type name
// ("VAV box", tag "VAV-M101") is stable; the category field isn't.
const TERMINAL_RE = /\b(vav|cv|fpb|piu|fan[-\s]?powered|terminal\s*(unit|box)|reheat\s*(box|terminal))\b/i;
export function isTerminalUnit(e = {}) {
  return TERMINAL_RE.test(`${e.type || ''} ${e.tag || ''}`);
}

// A cross-reference, not a real scheduled unit. In a VAV schedule every row
// names the AHU it's "served by" (the Associated Unit column), and the
// extractor sometimes turns that reference into its own AHU entry — inflating
// the count (24 AHUs when the schedule lists 20). A REAL major schedule row
// always carries at least a model or a capacity (CFM / tonnage / kW / voltage);
// a bare tag with none of that is the give-away. Only applied to SCHEDULE
// sources — a plan/vision read legitimately gives just a bare tag, so those
// pass through.
export function isPhantomScheduleUnit(e = {}) {
  return e.source === 'schedule' && !e.model && !e.size && !e.cfm && !e.electrical;
}

// A narrative or diagram sometimes hands the extractor a RANGE or LIST as one
// unit's tag — "RTU-01 THRU RTU-08" from a sequence-of-operations paragraph,
// "EF-12, EF-13, EF-14" from a callout. Left alone, that phrase matches no
// schedule tag and survives as a phantom 13th RTU. Expanding it into the
// individual tags lets per-tag dedupe fold every one into its schedule row.
// Returns an array of entries (clones with individual tags); a normal tag
// passes through as [e]. Expansion is capped so a misparse can't explode.
const RANGE_RE = /^\s*([A-Z][A-Z-]*-?)(\d{1,3})\s*(?:THRU|THROUGH|TO)\s*(?:[A-Z][A-Z-]*-?)?(\d{1,3})\s*$/i;
const LOOKS_LIKE_TAG = /^[A-Z][A-Z-]*-?\d{1,3}[A-Z]?$/i;
export function expandEquipTags(e = {}) {
  const tag = String(e.tag || '').trim();
  if (!tag) return [e];
  // Range: "RTU-01 THRU RTU-08" (separator must be a WORD — a bare dash is
  // indistinguishable from the dashes inside tags).
  const r = tag.match(RANGE_RE);
  if (r) {
    const [, prefix, a, b] = r;
    const n1 = parseInt(a, 10), n2 = parseInt(b, 10);
    const pad = a.startsWith('0') ? a.length : 0; // keep the zero-padding style of the start tag
    if (n2 > n1 && n2 - n1 <= 40) {
      return Array.from({ length: n2 - n1 + 1 }, (_, k) => {
        const num = String(n1 + k);
        return { ...e, tag: `${prefix}${pad ? num.padStart(pad, '0') : num}` };
      });
    }
  }
  // List: "EF-12, EF-13 & EF-14" / "EF-12/EF-13" — every token must look like
  // a tag (or a bare number inheriting the previous token's prefix).
  if (/[,/&]/.test(tag)) {
    const tokens = tag.split(/\s*[,/&]\s*|\s+AND\s+/i).map(s => s.trim()).filter(Boolean);
    if (tokens.length >= 2 && tokens.length <= 40) {
      const out = [];
      let lastPrefix = '';
      for (const tok of tokens) {
        if (LOOKS_LIKE_TAG.test(tok)) {
          lastPrefix = (tok.match(/^[A-Z-]+-?/i) || [''])[0];
          out.push({ ...e, tag: tok });
        } else if (/^\d{1,3}[A-Z]?$/i.test(tok) && lastPrefix) {
          out.push({ ...e, tag: `${lastPrefix}${tok}` });
        } else {
          return [e]; // one non-tag token → treat the whole thing as a single odd tag
        }
      }
      return out;
    }
  }
  return [e];
}

export function partitionHvacEquipment(collected = []) {
  const hasSchedule = collected.some(c => c?.e?.source === 'schedule');
  const major = [];
  const seenTag = new Set();
  const seenTermTag = new Set();
  const termGroups = new Map(); // "type|model|size" → grouped line
  let suppressed = 0, crossRefs = 0;

  // Suppression is PER-TAG, not wholesale: a plan-read unit is dropped only
  // when the SAME tag has a schedule row (that's the double-count). A unit
  // that lives only on the drawings — an industrial set carries whole VRF
  // systems and fan lineups on schematic sheets with no schedule row at all —
  // must survive, or the takeoff loses most of its equipment. (The wholesale
  // "schedule owns everything" version of this rule did exactly that: 96 read,
  // 10 kept.) Schedule rows are processed FIRST so the schedule's copy is the
  // one that wins whenever both exist.
  // Canonical tag for COMPARISON (display keeps the original): uppercase,
  // punctuation/spacing stripped, and leading zeros dropped from digit runs —
  // the schedule writes RTU-01..08 while the airflow diagrams label the same
  // units RTU-4, RTU-5, and exact matching counted them twice (12 RTUs on a
  // set that has 8).
  // (Only LEADING zeros of a digit run are stripped — RTU-100 must stay
  // distinct from RTU-10, so zeros after a digit are untouched.)
  const tagOf = (e) => String(e?.tag || '').toUpperCase().replace(/[^A-Z0-9]+/g, '').replace(/(?<![0-9])0+(?=[0-9])/g, '');
  // Expand range/list tags FIRST so "RTU-01 THRU RTU-08" becomes eight real
  // tags that fold into their schedule rows instead of one phantom unit.
  const flat = [];
  for (const c of collected) {
    if (!c?.e) continue;
    for (const e of expandEquipTags(c.e)) flat.push({ ...c, e });
  }
  const scheduleTags = new Set(
    flat.filter(c => c.e.source === 'schedule').map(c => tagOf(c.e)).filter(Boolean)
  );
  // Family closure: the letter prefixes the schedules enumerate (RTU, EF, MAU…).
  // A non-schedule unit claiming a NEW member of a scheduled family (RTU-09 on
  // a set whose schedule lists RTU-01..08) is almost always a misread — but not
  // certainly, so it goes to REVIEW rather than silently in or out.
  const familyOf = (canon) => (canon.match(/^[A-Z]+/) || [''])[0];
  const scheduleFamilies = new Set([...scheduleTags].map(familyOf).filter(Boolean));
  const hasScheduleRows = scheduleTags.size > 0;
  const review = [];
  const ordered = [
    ...flat.filter(c => c.e.source === 'schedule'),
    ...flat.filter(c => c.e.source !== 'schedule'),
  ];

  for (const c of ordered) {
    const e = c.e;
    const tag = tagOf(e);
    if (e.source !== 'schedule' && tag && scheduleTags.has(tag)) { suppressed++; continue; }

    if (isTerminalUnit(e)) {
      // Tag-dedupe terminals across the batch too: the same VAV drawn on two
      // plan sheets (or on a plan AND in a schedule) is one box, not two.
      if (tag) {
        if (seenTermTag.has(tag)) continue;
        seenTermTag.add(tag);
      }
      const type = e.type || 'VAV box', model = e.model || '', size = e.size || '';
      const key = `${type}|${model}|${size}`;
      const g = termGroups.get(key) || { type, model, size, qty: 0, fileName: c.fileName, drawing: c.drawing };
      g.qty += 1;
      termGroups.set(key, g);
      continue;
    }

    // Bare schedule tag (no model/capacity) = an Associated-Unit cross-reference,
    // not a real row. Drop it so a VAV schedule's AHU references don't inflate.
    if (isPhantomScheduleUnit(e)) { crossRefs++; continue; }

    // Family closure → review, not straight onto the Equipment step:
    //  • a plan/narrative unit claiming a NEW member of a scheduled family
    //    (RTU-09 when the schedule lists RTU-01..08) is usually a misread;
    //  • a TAGLESS non-schedule unit, when real schedules exist, is usually a
    //    narrative mention ("provide make-up air unit") of gear already counted.
    // Both are "usually" — so the user confirms via the Accept/Skip review
    // screen. A unit from a family the schedules DON'T cover (the VRF system
    // that lives only on diagrams) still passes straight through.
    if (e.source !== 'schedule' && hasScheduleRows) {
      if (tag && scheduleFamilies.has(familyOf(tag)) && !scheduleTags.has(tag)) {
        if (!seenTag.has(tag)) { seenTag.add(tag); review.push({ e, fileName: c.fileName, drawing: c.drawing, reason: `not in the ${familyOf(tag)} schedule` }); }
        continue;
      }
      if (!tag) { review.push({ e, fileName: c.fileName, drawing: c.drawing, reason: 'untagged mention' }); continue; }
    }

    // Major unit — dedupe by tag across the whole batch (three shots of one
    // sheet must not make three RTU-1s). Tagless units always pass through.
    if (tag && seenTag.has(tag)) continue;
    if (tag) seenTag.add(tag);
    major.push({ e, fileName: c.fileName, drawing: c.drawing });
  }

  return { hasSchedule, suppressed, crossRefs, major, review, terminals: [...termGroups.values()] };
}
