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
//   · Setting the rack — the whole crane operation, hooking through final
//     position. Stored as a DURATION and a CREW rather than a man-hour figure;
//     see below and rackSetHrs' provenance.
//   · Setting walk-in panels.
//
// ── WHY THESE ARE TASK ROWS AND NOT A HIDDEN TOTAL ──────────────────────────
// They land in the field-task list as rows the estimator reads, edits and
// deletes, the same way the circuit generator works. A number he cannot see is
// a number he cannot defend, and one of the three below is still in open
// dispute.
//
// ── AND WHY THEY DO NOT DOUBLE-COUNT ────────────────────────────────────────
// `perRackTie` in the labor units is a CIRCUIT tying into the rack — one per
// circuit, already charged by the takeoff. The rack set here is the rack
// itself, once per rack. Different work, and the names are close enough that
// this comment is the guard against somebody folding one into the other later.
//
// ── AND THE CRANE IS NOT IN THESE HOURS ─────────────────────────────────────
// The crew hours below INCLUDE working with the crane — hooking on, directing
// the driver, unhooking, walking it to its spot. What they do not include is
// what the crane COSTS. That is hired, so it is a rental or a subcontract
// line, and both of those paths already exist. No man-hour unit is invented
// for it: a number nobody has quoted does not belong in a bid.

import { splitAcrossCrew } from './laborUnits.js';

// Defaults live in DEFAULT_LABOR_UNITS so they are frozen onto each job at save
// time like every other unit. These are the keys.
export const SCOPE_UNIT_KEYS = ['perRackCommission', 'rackSetHrs', 'rackSetCrew', 'perWalkInPanel'];

// rackSetHrs and rackSetCrew are shown as two boxes, not one, because they are
// not equally well known — see the store comment. The label says which is
// which so nobody types man-hours into the hours box.
export const SCOPE_UNIT_FIELDS = [
  { key: 'perRackCommission', label: 'Commission / rack (man-hrs)' },
  { key: 'rackSetHrs', label: 'Set rack — hrs on site' },
  { key: 'rackSetCrew', label: 'Set rack — men' },
  { key: 'perWalkInPanel', label: 'Walk-in panel (man-hrs)' },
];

// The whole crane operation, in man-hours: the clock time multiplied by the
// crew standing there for it.
export function rackSetManHours(units = {}) {
  const hrs = Math.max(0, Number(units.rackSetHrs) || 0);
  const men = Math.max(0, Number(units.rackSetCrew) || 0);
  return hrs * men;
}

// → [{ kind, desc, manHours }] before crew splitting. Pure, and separate from
// the row building so the arithmetic can be tested without any React.
export function scopeLines({ racks = 0, walkInPanels = 0 } = {}, units = {}) {
  const n = v => Math.max(0, Math.floor(Number(v) || 0));
  const u = k => Math.max(0, Number(units[k]) || 0);
  const out = [];

  const rackCount = n(racks);
  for (let i = 1; i <= rackCount; i++) {
    // Setting first: it happens first, and a list that reads in the order the
    // work happens is one an estimator can check against a schedule.
    const setHrs = rackSetManHours(units);
    if (setHrs > 0) {
      out.push({ kind: 'rackSet', desc: `Set rack ${i} in place`, manHours: setHrs });
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
