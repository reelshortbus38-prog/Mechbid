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
export function partitionHvacEquipment(collected = []) {
  const hasSchedule = collected.some(c => c?.e?.source === 'schedule');
  const major = [];
  const seenTag = new Set();
  const termGroups = new Map(); // "type|model|size" → grouped line
  let suppressed = 0;

  for (const c of collected) {
    const e = c?.e;
    if (!e) continue;
    // Schedule owns the equipment count — drop plan-read units when one exists.
    if (hasSchedule && e.source !== 'schedule') { suppressed++; continue; }

    if (e.category === 'terminal') {
      const type = e.type || 'VAV box', model = e.model || '', size = e.size || '';
      const key = `${type}|${model}|${size}`;
      const g = termGroups.get(key) || { type, model, size, qty: 0, fileName: c.fileName, drawing: c.drawing };
      g.qty += 1;
      termGroups.set(key, g);
      continue;
    }

    // Major unit — dedupe by tag across the whole batch (three shots of one
    // sheet must not make three RTU-1s). Tagless units always pass through.
    const tag = String(e.tag || '').trim().toUpperCase();
    if (tag && seenTag.has(tag)) continue;
    if (tag) seenTag.add(tag);
    major.push({ e, fileName: c.fileName, drawing: c.drawing });
  }

  return { hasSchedule, suppressed, major, terminals: [...termGroups.values()] };
}
