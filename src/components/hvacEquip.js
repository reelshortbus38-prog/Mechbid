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

export function partitionHvacEquipment(collected = []) {
  const hasSchedule = collected.some(c => c?.e?.source === 'schedule');
  const major = [];
  const seenTag = new Set();
  const termGroups = new Map(); // "type|model|size" → grouped line
  let suppressed = 0, crossRefs = 0;

  for (const c of collected) {
    const e = c?.e;
    if (!e) continue;
    // Schedule owns the equipment count — drop plan-read units when one exists.
    if (hasSchedule && e.source !== 'schedule') { suppressed++; continue; }

    if (isTerminalUnit(e)) {
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

    // Major unit — dedupe by tag across the whole batch (three shots of one
    // sheet must not make three RTU-1s). Tagless units always pass through.
    const tag = String(e.tag || '').trim().toUpperCase();
    if (tag && seenTag.has(tag)) continue;
    if (tag) seenTag.add(tag);
    major.push({ e, fileName: c.fileName, drawing: c.drawing });
  }

  return { hasSchedule, suppressed, crossRefs, major, terminals: [...termGroups.values()] };
}
