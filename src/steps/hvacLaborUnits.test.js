import { describe, it, expect } from 'vitest';
import {
  rtuSetHours, isSetUnit, hvacLaborLines, hvacManHours,
  HVAC_UNIT_KEYS, HVAC_UNIT_FIELDS, LINEAR_TONS_LIMIT,
} from './hvacLaborUnits.js';
import { provenanceOf } from './laborUnits.js';
import { DEFAULT_LABOR_UNITS } from '../state/store.js';

const U = DEFAULT_LABOR_UNITS;
const rtu = (tag, tons, qty = 1) => ({ id: tag, tag, type: 'RTU', tons, qty });

describe('rtuSetHours', () => {
  it('is a fixed part plus a part that scales', () => {
    // A 3-ton swap is not three-fifths of a 5-ton. There is a cost to getting
    // there, opening the roof and making the connections every unit needs.
    expect(rtuSetHours(5, U)).toBeCloseTo(4 + 1.2 * 5, 6);
    expect(rtuSetHours(10, U)).toBeCloseTo(4 + 1.2 * 10, 6);
  });

  it('lands inside the range the sources describe', () => {
    // "8 to 16 hours for a two-person crew" for a 5-10 ton rooftop, crane
    // excluded. Both ends have to fall in that window or the fit is wrong.
    expect(rtuSetHours(5, U)).toBeGreaterThanOrEqual(8);
    expect(rtuSetHours(10, U)).toBeLessThanOrEqual(16);
  });

  it('still charges the base on a unit with no tonnage on the schedule', () => {
    // An ERV or a make-up air unit often carries CFM rather than tons. It
    // still has to be set.
    expect(rtuSetHours(0, U)).toBe(4);
    expect(rtuSetHours(undefined, U)).toBe(4);
  });

  it('is zero when both halves are zeroed, rather than a stray base', () => {
    expect(rtuSetHours(10, { rtuSetHrsBase: 0, rtuSetHrsPerTon: 0 })).toBe(0);
  });
});

describe('isSetUnit', () => {
  it('catches the things somebody sets', () => {
    for (const t of ['RTU', 'Rooftop Unit', 'Packaged AC', 'Split System', 'AHU',
      'Air Handler', 'Condensing Unit', 'Heat Pump', 'Make-Up Air', 'ERV', 'Furnace']) {
      expect(isSetUnit(t), t).toBe(true);
    }
  });

  it('leaves pumps and terminal units alone, because they are counted elsewhere', () => {
    // hydronicValves.countHydronicEquipment already counts these for the valve
    // and hose-kit lines. Setting them here too would double the job.
    for (const t of ['Inline Pump', 'Base-Mounted Pump', 'Fan Coil Unit', 'VAV Box', 'Fin Tube']) {
      expect(isSetUnit(t), t).toBe(false);
    }
  });

  it('is false rather than broken on junk', () => {
    expect(isSetUnit('')).toBe(false);
    expect(isSetUnit(null)).toBe(false);
  });
});

describe('hvacLaborLines', () => {
  it('sets every unit on the schedule, at its own size', () => {
    const r = hvacLaborLines({ equipment: [rtu('RTU-1', 5), rtu('RTU-2', 10)] }, U);
    const sets = r.lines.filter(l => l.kind === 'set');
    expect(sets).toHaveLength(2);
    // hours x crew, not hours
    expect(sets[0].manHours).toBeCloseTo(rtuSetHours(5, U) * 2, 6);
    expect(sets[1].manHours).toBeGreaterThan(sets[0].manHours);
  });

  it('multiplies by the crew, because the source figure is a DURATION', () => {
    // The rack-set mistake, which cost a factor of four. Every equipment
    // figure found in the wild was "N hours for a two-person crew".
    // Only the SET line scales with this crew — startup carries its own, which
    // is the point of them being separate fields.
    const setLine = crew => hvacLaborLines({ equipment: [rtu('RTU-1', 5)] }, { ...U, rtuSetCrew: crew })
      .lines.find(l => l.kind === 'set').manHours;
    expect(setLine(3)).toBeCloseTo(setLine(1) * 3, 6);
    expect(setLine(1)).toBeCloseTo(rtuSetHours(5, U), 6);
  });

  it('counts a quantity of identical units', () => {
    const r = hvacLaborLines({ equipment: [rtu('RTU-1', 5, 4)] }, U);
    expect(r.lines.find(l => l.kind === 'set').manHours).toBeCloseTo(rtuSetHours(5, U) * 2 * 4, 6);
  });

  it('flags a unit past the size the model is linear over', () => {
    // Above about 25 tons the sources say labor climbs faster than tonnage —
    // bigger curbs, heavier rigging. The model UNDER-reads there and says so
    // rather than quietly being short.
    const r = hvacLaborLines({ equipment: [rtu('RTU-1', 40)] }, U);
    expect(r.overLimit).toEqual(['RTU-1']);
    expect(LINEAR_TONS_LIMIT).toBe(25);
  });

  it('does not flag a unit inside the range', () => {
    expect(hvacLaborLines({ equipment: [rtu('RTU-1', 20)] }, U).overLimit).toEqual([]);
  });

  it('hangs ductwork by the POUND, with no crew multiplier', () => {
    // The one genuine man-hour rate here: sheet metal productivity is quoted
    // per man per pound. Multiplying it by a crew would be the mirror image of
    // the rack-set mistake.
    const a = hvacLaborLines({ ductLbs: 1000 }, U);
    const b = hvacLaborLines({ ductLbs: 1000 }, { ...U, rtuSetCrew: 6, startupCrew: 6 });
    expect(a.manHours).toBeCloseTo(1000 * U.ductHrsPerLb, 6);
    expect(b.manHours).toBeCloseTo(a.manHours, 6);
  });

  it('gives startup its own line, never inside the set', () => {
    // The one thing every source agreed on: "installation, commissioning and
    // startup are not interchangeable line items."
    const r = hvacLaborLines({ equipment: [rtu('RTU-1', 5), rtu('RTU-2', 10)] }, U);
    const startup = r.lines.find(l => l.kind === 'startup');
    expect(startup).toBeTruthy();
    expect(startup.desc).toMatch(/2 units/);
    expect(startup.manHours).toBeCloseTo(2 * U.startupHrsPerUnit * U.startupCrew, 6);
  });

  it('adds curb adapters only when there are some', () => {
    expect(hvacLaborLines({ equipment: [rtu('RTU-1', 5)] }, U).lines.some(l => l.kind === 'curb')).toBe(false);
    const r = hvacLaborLines({ equipment: [rtu('RTU-1', 5)], curbAdapters: 3 }, U);
    expect(r.lines.find(l => l.kind === 'curb').manHours).toBeCloseTo(3 * U.curbAdapterHrs * U.rtuSetCrew, 6);
  });

  it('drops any line whose unit has been zeroed', () => {
    // Zeroing is how an estimator says "not my scope" or "already covered".
    const r = hvacLaborLines(
      { equipment: [rtu('RTU-1', 5)], ductLbs: 1000 },
      { ...U, ductHrsPerLb: 0, startupHrsPerUnit: 0 },
    );
    expect(r.lines.map(l => l.kind)).toEqual(['set']);
  });

  it('is empty on a job with nothing in it rather than a stray row', () => {
    expect(hvacLaborLines({}, U).lines).toEqual([]);
    expect(hvacLaborLines(undefined, U).manHours).toBe(0);
    expect(hvacManHours({ equipment: [] }, U)).toBe(0);
  });

  it('comes to something an estimator would recognise on a real job', () => {
    // Four rooftops and a ton of duct. Not a proof of the figures — a check
    // that the arithmetic is not out by an order of magnitude, which is the
    // failure mode that matters before anyone has reviewed the units.
    const hrs = hvacManHours({
      equipment: [rtu('RTU-1', 5), rtu('RTU-2', 7.5), rtu('RTU-3', 10), rtu('RTU-4', 10)],
      ductLbs: 2000,
    }, U);
    expect(hrs).toBeGreaterThan(100);
    expect(hrs).toBeLessThan(400);
  });
});

// ── AND HOW HONEST THE APP IS ABOUT WHERE THESE CAME FROM ───────────────────
describe('the HVAC units’ provenance', () => {
  it('covers every unit that ships', () => {
    for (const k of HVAC_UNIT_KEYS) {
      expect(provenanceOf(k).note, k).toBeTruthy();
    }
    expect(HVAC_UNIT_FIELDS.map(f => f.key).sort()).toEqual([...HVAC_UNIT_KEYS].sort());
  });

  it('marks EVERY one unconfirmed, because nobody in the trade has read them', () => {
    // A harder line than the refrigeration side needs. Those figures came from
    // a working mechanic and an estimator; these came off the open web.
    for (const k of HVAC_UNIT_KEYS) {
      expect(provenanceOf(k).state, k).toBe('unconfirmed');
    }
  });

  it('says out loud that these came off the web, not from anybody', () => {
    // The difference between "nobody has checked this" and "this is what a man
    // who does it says" is the whole point of the provenance system.
    const note = provenanceOf('rtuSetHrsBase').note;
    expect(note).toMatch(/published industry sources/i);
    expect(note).toMatch(/not from anyone who bids or installs/i);
  });

  it('names the startup figure as the weakest thing in the app', () => {
    // No source gave hours for it at all. It exists so the LINE exists to be
    // corrected, rather than being silently absent the way rack commissioning
    // was.
    expect(provenanceOf('startupHrsPerUnit').note).toMatch(/weakest number in this app/i);
    expect(provenanceOf('startupHrsPerUnit').note).toMatch(/placeholder/i);
  });

  it('explains why the duct rate carries no crew and the set does', () => {
    expect(provenanceOf('ductHrsPerLb').note).toMatch(/per man, per pound/i);
    expect(provenanceOf('rtuSetHrsBase').note).toMatch(/DURATION/);
  });

  it('admits the duct rate counts rectangular only', () => {
    // Spiral is bought by the foot and flex by the box; neither is in the
    // pound count the takeoff produces.
    expect(provenanceOf('ductHrsPerLb').note).toMatch(/RECTANGULAR duct only/);
    expect(provenanceOf('ductHrsPerLb').note).toMatch(/not in the pound count/i);
  });
});
