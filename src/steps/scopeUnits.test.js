import { describe, it, expect } from 'vitest';
import { scopeLines, scopeManHours, scopeTasks, SCOPE_UNIT_KEYS, SCOPE_UNIT_FIELDS } from './scopeUnits.js';
import { DEFAULT_LABOR_UNITS } from '../state/store.js';
import { provenanceOf } from './laborUnits.js';

const U = DEFAULT_LABOR_UNITS;

describe('scopeLines', () => {
  it('gives every rack a set and a commission row', () => {
    const lines = scopeLines({ racks: 2 }, U);
    expect(lines.map(l => l.desc)).toEqual([
      'Set rack 1 in place', 'Commission rack 1',
      'Set rack 2 in place', 'Commission rack 2',
    ]);
  });

  it('reads in the order the work happens', () => {
    // A list an estimator can check against a schedule. You set it before you
    // commission it.
    const kinds = scopeLines({ racks: 1 }, U).map(l => l.kind);
    expect(kinds).toEqual(['rackSet', 'rackCommission']);
  });

  it('rolls walk-in panels into one row rather than forty', () => {
    // Panels are interchangeable in a way racks are not. Forty rows reading
    // "Walk-in panel 37" is not a list anybody reviews.
    const lines = scopeLines({ walkInPanels: 40 }, U);
    expect(lines).toHaveLength(1);
    expect(lines[0].desc).toBe('Set walk-in panels (40)');
    expect(lines[0].manHours).toBeCloseTo(40 * U.perWalkInPanel, 6);
  });

  it('charges commissioning at the shipped figure', () => {
    // 24-48 hr per rack from two independent sources; 36 is the middle.
    expect(scopeLines({ racks: 1 }, U).find(l => l.kind === 'rackCommission').manHours).toBe(36);
  });

  it('is empty when the job has none of this', () => {
    expect(scopeLines({}, U)).toEqual([]);
    expect(scopeLines({ racks: 0, walkInPanels: 0 }, U)).toEqual([]);
    expect(scopeLines(undefined, U)).toEqual([]);
  });

  it('drops a line whose unit has been zeroed rather than billing nothing', () => {
    // Zeroing a unit is how an estimator says "not my scope on this job" —
    // GC sets the panels, say. A zero-hour row in the list would be noise.
    const lines = scopeLines({ racks: 1, walkInPanels: 10 }, { ...U, perRackSet: 0, perWalkInPanel: 0 });
    expect(lines.map(l => l.kind)).toEqual(['rackCommission']);
  });

  it('ignores junk counts instead of emitting a NaN row', () => {
    expect(scopeLines({ racks: -3, walkInPanels: 'x' }, U)).toEqual([]);
    expect(scopeLines({ racks: 2.7 }, U).filter(l => l.kind === 'rackSet')).toHaveLength(2);
  });
});

describe('scopeManHours', () => {
  it('adds up what the takeoff was missing', () => {
    // A two-rack store with thirty panels, at the shipped units.
    const hrs = scopeManHours({ racks: 2, walkInPanels: 30 }, U);
    expect(hrs).toBeCloseTo(2 * (36 + 2.0) + 30 * 0.45, 6);
  });

  it('is zero on a job with none of it', () => {
    expect(scopeManHours({}, U)).toBe(0);
  });

  it('is most of a crew-week the app used to leave out entirely', () => {
    // The point of the whole module. Two racks is 76 man-hours of setting and
    // commissioning that was previously charged at nothing.
    expect(scopeManHours({ racks: 2 }, U)).toBeGreaterThan(70);
  });
});

describe('scopeTasks', () => {
  const uid = (() => { let n = 0; return () => `t${++n}`; })();

  it('splits man-hours across the crew rather than billing one man', () => {
    // The units are MAN-hours. Emitting 36 as men:1 says one person
    // commissions a rack over four and a half days, which nobody does.
    const [set] = scopeTasks({ counts: { racks: 1 }, units: U, crewSize: 2, uid });
    expect(set.men * set.hrs).toBeCloseTo(2.0, 1);
    const commission = scopeTasks({ counts: { racks: 1 }, units: U, crewSize: 2, uid })[1];
    expect(commission.men).toBe(2);
    expect(commission.men * commission.hrs).toBeCloseTo(36, 1);
  });

  it('says on every row that it is not in the takeoff', () => {
    // The estimator has to be able to tell at a glance which rows came from
    // circuits and which were added on top, or he cannot check for a
    // double-count.
    for (const t of scopeTasks({ counts: { racks: 1, walkInPanels: 5 }, units: U, uid })) {
      expect(t.notes).toMatch(/not in the circuit takeoff/i);
    }
  });

  it('does not bill the job twice when the button is pressed again', () => {
    const first = scopeTasks({ counts: { racks: 2 }, units: U, uid });
    const second = scopeTasks({ counts: { racks: 2 }, units: U, existing: first, uid });
    expect(second).toEqual([]);
  });

  it('adds only the new rack when the count goes up', () => {
    const first = scopeTasks({ counts: { racks: 1 }, units: U, uid });
    const second = scopeTasks({ counts: { racks: 2 }, units: U, existing: first, uid });
    expect(second.map(t => t.desc)).toEqual(['Set rack 2 in place', 'Commission rack 2']);
  });

  it('does not collide with a row the estimator typed himself', () => {
    const mine = [{ desc: 'Commission rack 1' }];
    const out = scopeTasks({ counts: { racks: 1 }, units: U, existing: mine, uid });
    expect(out.map(t => t.desc)).toEqual(['Set rack 1 in place']);
  });

  it('stamps the trade, so an HVAC job does not show refrigeration rack rows', () => {
    const [t] = scopeTasks({ counts: { racks: 1 }, units: U, mode: 'Commercial Refrigeration', uid });
    expect(t.mode).toBe('Commercial Refrigeration');
  });

  it('is empty rather than broken with nothing passed', () => {
    expect(scopeTasks()).toEqual([]);
  });
});

// ── THE NUMBERS THEMSELVES ──────────────────────────────────────────────────
describe('the scope units', () => {
  it('ships every key the fields claim, and vice versa', () => {
    expect(SCOPE_UNIT_FIELDS.map(f => f.key).sort()).toEqual([...SCOPE_UNIT_KEYS].sort());
    for (const k of SCOPE_UNIT_KEYS) expect(DEFAULT_LABOR_UNITS, k).toHaveProperty(k);
  });

  it('carries provenance for all three, because none of them is a settled measurement', () => {
    for (const k of SCOPE_UNIT_KEYS) {
      expect(provenanceOf(k).note, k).toBeTruthy();
    }
  });

  it('marks the walk-in panel DISPUTED, naming both figures', () => {
    // 0.45 hr against 1.5-2 hr. An app that silently picks one is taking a
    // decision it is not qualified to take.
    expect(provenanceOf('perWalkInPanel').state).toBe('disputed');
    expect(provenanceOf('perWalkInPanel').note).toMatch(/0\.45 hr/);
    expect(provenanceOf('perWalkInPanel').note).toMatch(/1\.5-2 hr/);
  });

  it('says WHY the named estimator wins the default', () => {
    // Not a coin toss. A named practitioner who bids these against a document
    // attributed to nobody.
    expect(provenanceOf('perWalkInPanel').note).toMatch(/named estimator/i);
  });

  it('the rack SET was never a dispute — the two sides meant different things', () => {
    // It read as 8-12x apart against the PRD's 16-24 hr until the mechanic
    // settled it: "that 2 hour is for setting the rack in place." So the PRD
    // figure is not a competing answer to this question, and recording it as
    // one would manufacture a disagreement that does not exist.
    expect(provenanceOf('perRackSet').state).toBe('confirmed');
    expect(provenanceOf('perRackSet').note).toMatch(/setting the rack in place/i);
    expect(provenanceOf('perRackSet').note).toMatch(/never in conflict/i);
  });

  it('says where the crane goes, rather than leaving a silent hole', () => {
    // Offloading the rack and getting it into the building is real work and is
    // NOT in the 2 hours. It is bought in, so it belongs in subs or rentals —
    // and inventing a man-hour unit for it would put a number in a bid that
    // nobody has quoted.
    const note = provenanceOf('perRackSet').note;
    expect(note).toMatch(/offloading/i);
    expect(note).toMatch(/Subcontractors or Rentals/);
  });

  it('marks commissioning as varying, because both sources gave a RANGE', () => {
    // Two people agreeing on 24-48 is agreement about a spread, not about a
    // number. Reporting 36 as if it were measured would overclaim.
    expect(provenanceOf('perRackCommission').state).toBe('varies');
    expect(provenanceOf('perRackCommission').note).toMatch(/24-48/);
    expect(provenanceOf('perRackCommission').note).toMatch(/not a measurement/i);
  });

  it('keeps the rack TIE and the rack SET apart', () => {
    // perRackTie is a circuit landing on the rack, once per circuit, already
    // in the takeoff. perRackSet is standing the rack, once per rack. Folding
    // one into the other is the double-count this pair invites.
    expect(provenanceOf('perRackTie').note).toMatch(/not setting the rack itself/i);
    expect(DEFAULT_LABOR_UNITS.perRackTie).not.toBe(undefined);
    expect(DEFAULT_LABOR_UNITS.perRackSet).not.toBe(undefined);
  });
});
