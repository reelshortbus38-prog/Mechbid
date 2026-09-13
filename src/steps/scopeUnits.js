// ── THE WORK THAT WAS NEVER IN THE BID AT ALL ───────────────────────────────
// estimateCircuitLabor covers running and connecting circuits: footage, braze
// joints, case hookups, tying each circuit into the rack. That is most of a
// refrigeration job and it is not all of it.
//
// Three things a supermarket job always has were in this app NOWHERE — not
// under-estimated, absent. Every bid it has ever produced was short by them:
//
//   · Commissioning the rack. Both the 2026-09-12 review and the PRD put this
//     at 24-48 hr per rack, independently. On a two-rack store that is 48-96
//     man-hours the app was not charging for, and it is the one figure two
//     sources agree on.
//   · Rigging and setting the rack itself.
//   · Setting walk-in panels.
//
// ── WHY THESE ARE TASK ROWS AND NOT A HIDDEN TOTAL ──────────────────────────
// They land in the field-task list as rows the estimator reads, edits and
// deletes, the same way the circuit generator works. A number he cannot see is
// a number he cannot defend, and two of the three below are in open dispute.
//
// ── AND WHY THEY DO NOT DOUBLE-COUNT ────────────────────────────────────────
// `perRackTie` in the labor units is a CIRCUIT tying into the rack — one per
// circuit, already charged by the takeoff. `perRackSet` here is rigging and
// standing the rack itself, once per rack. Different work, and the names are
// close enough that this comment is the guard against somebody folding one
// into the other later.

import { splitAcrossCrew } from './laborUnits.js';

// Defaults live in DEFAULT_LABOR_UNITS so they are frozen onto each job at save
// time like every other unit. These are the keys.
export const SCOPE_UNIT_KEYS = ['perRackCommission', 'perRackSet', 'perWalkInPanel'];

export const SCOPE_UNIT_FIELDS = [
  { key: 'perRackCommission', label: 'Commission / rack' },
  { key: 'perRackSet', label: 'Rig & set / rack' },
  { key: 'perWalkInPanel', label: 'Walk-in panel' },
];

// → [{ kind, desc, manHours }] before crew splitting. Pure, and separate from
// the row building so the arithmetic can be tested without any React.
export function scopeLines({ racks = 0, walkInPanels = 0 } = {}, units = {}) {
  const n = v => Math.max(0, Math.floor(Number(v) || 0));
  const u = k => Math.max(0, Number(units[k]) || 0);
  const out = [];

  const rackCount = n(racks);
  for (let i = 1; i <= rackCount; i++) {
    // Rigging first: it happens first, and a list that reads in the order the
    // work happens is one an estimator can check against a schedule.
    if (u('perRackSet') > 0) {
      out.push({ kind: 'rackSet', desc: `Rig & set rack ${i}`, manHours: u('perRackSet') });
    }
    if (u('perRackCommission') > 0) {
      out.push({ kind: 'rackCommission', desc: `Commission rack ${i}`, manHours: u('perRackCommission') });
    }
  }

  const panels = n(walkInPanels);
  if (panels > 0 && u('perWalkInPanel') > 0) {
    // One row for all of them. Panels are interchangeable in a way racks are
    // not, and forty rows reading "Walk-in panel 37" is not a list anybody
    // reviews — it is a list they scroll past.
    out.push({
      kind: 'walkInPanels',
      desc: `Set walk-in panels (${panels})`,
      manHours: panels * u('perWalkInPanel'),
    });
  }

  return out;
}

// Total man-hours the scope adds, for showing beside the takeoff.
export function scopeManHours(counts, units) {
  return scopeLines(counts, units).reduce((s, l) => s + l.manHours, 0);
}

// Build the field-task rows, splitting each across the crew the same way the
// circuit generator does — the units are MAN-hours, and emitting them as one
// man says one person commissions a rack over four days.
//
// `existing` is deduped against by description, so pressing the button twice
// does not bill the job twice. That is the same guard the circuit generator
// has and for the same reason: an estimator pressing a button again because
// nothing visibly happened must not be charged for it.
export function scopeTasks({ counts, units, crewSize = 2, existing = [], mode = '', uid } = {}) {
  const have = new Set((existing || []).map(t => String(t?.desc || '').trim()));
  return scopeLines(counts, units)
    .filter(l => !have.has(l.desc))
    .map(l => {
      const rounded = Math.round(l.manHours * 10) / 10;
      const { men, hrs } = splitAcrossCrew(rounded, crewSize);
      return {
        id: typeof uid === 'function' ? uid() : `${l.kind}-${l.desc}`,
        desc: l.desc,
        men, hrs,
        notes: `Not in the circuit takeoff — ${rounded} man-hours over ${men} ${men === 1 ? 'man' : 'men'}`,
        crewAssignment: {},
        mode,
        scopeKind: l.kind,
      };
    });
}
