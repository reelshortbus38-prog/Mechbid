import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { foldHeaders, headerInsulCategory } from './headers.js';
import { saddleCounts } from './hangers.js';
import {
  insulatesMedLiquid, MED_LIQUID_INSUL_CATEGORY, DEFAULT_INSULATE_MED_LIQUID,
  defaultHardwarePrice, DEFAULT_INSUL_RATES, INSUL_WALL,
} from '../state/store.js';

const norm = s => String(s || '').replace(/"/g, '').trim();

// ── "$1.40 each or $133.00 for a case of 100" ────────────────────────────────
// Beam clamps had no entry in the price table at all, so the line landed at $0
// on every bid — two per hanger, a hundred on a fifty-hanger store.
describe('beam clamps are priced', () => {
  it('uses the price the mechanic gave', () => {
    expect(defaultHardwarePrice('3/8" Beam clamps — bar joist attachment (2 per hanger)')).toBe(1.40);
  });

  it('takes the EACH price, not the case rate', () => {
    // $133 for 100 is $1.33. Pricing at the case rate under-bids a job that
    // buys them loose; pricing at the each rate over-bids a job that buys
    // cases by $7 a hundred. Only one of those loses money.
    expect(defaultHardwarePrice('Beam clamps')).toBeGreaterThan(133 / 100);
  });

  it('is not zero, which is what it was', () => {
    expect(defaultHardwarePrice('3/8" Beam clamps')).toBeGreaterThan(0);
  });
});

// ── MEDIUM-TEMP LIQUID IS A LOCATION QUESTION ────────────────────────────────
// "Medium temp doesn't need insulation on liquid line in conditioned areas but
//  does need it in unconditioned areas. I'm pretty sure we bid the job with all
//  lines insulated anyways."
//
// The app had it as settled: medium-temp liquid is never insulated. Which foot
// runs through the back room is a walk of the piping drawing, not something a
// takeoff splits — so it is all or nothing, and all is how the work gets bid.
describe('whether this job insulates medium-temp liquid', () => {
  it('does by default, because that is how the job gets bid', () => {
    expect(DEFAULT_INSULATE_MED_LIQUID).toBe(true);
    expect(insulatesMedLiquid({})).toBe(true);
    expect(insulatesMedLiquid(undefined)).toBe(true);
  });

  it('only an explicit false turns it off', () => {
    // A missing key is a job saved before this existed. Reading that as "no"
    // would be fine; reading a stray undefined as "no" on a NEW job would put
    // the material back off without anybody choosing.
    expect(insulatesMedLiquid({ insulateMedLiquid: false })).toBe(false);
    expect(insulatesMedLiquid({ insulateMedLiquid: true })).toBe(true);
  });

  it('is 1/2 inch wall, priced off the table that already holds 1/2 inch wall', () => {
    // Same product, same thickness, same money as low-temp liquid. Two tables
    // holding one price is two tables that drift.
    expect(MED_LIQUID_INSUL_CATEGORY).toBe('lowLiquid');
    expect(INSUL_WALL.lowLiquid).toBe('1/2"');
    expect(DEFAULT_INSUL_RATES[MED_LIQUID_INSUL_CATEGORY]['7/8']).toBeGreaterThan(0);
  });
});

describe('a medium-temp liquid header', () => {
  const header = { size: '7/8', lengthFt: 200, lineType: 'liquid', tempType: 'medium' };

  it('is insulated when the job says so', () => {
    expect(headerInsulCategory(header, true)).toBe('medLiquid');
    expect(foldHeaders([header], norm, true).medLiqBySize['7/8']).toBe(200);
  });

  it('is not when it does not', () => {
    expect(headerInsulCategory(header, false)).toBeNull();
    expect(foldHeaders([header], norm, false).medLiqBySize).toEqual({});
  });

  it('does not disturb the buckets that were already right', () => {
    const low = { size: '7/8', lengthFt: 100, lineType: 'liquid', tempType: 'low' };
    const suc = { size: '2-1/8', lengthFt: 300, lineType: 'suction', tempType: 'medium' };
    const f = foldHeaders([low, suc], norm, true);
    expect(f.lowLiqBySize['7/8']).toBe(100);
    expect(f.medSucBySize['2-1/8']).toBe(300);
    expect(f.medLiqBySize).toEqual({});
  });
});

// ── AND INSULATED PIPE NEEDS A CRADLE ────────────────────────────────────────
// A saddle exists to stop a hanger crushing insulation. Turning the insulation
// on and leaving the saddles off buys insulation with nothing to hold it.
describe('the saddles follow the insulation', () => {
  const circuits = [
    { id: 'a', runLength: 150, sucHoriz: '1-1/8', liqHoriz: '5/8', tempType: 'medium' },
  ];

  it('gives medium-temp liquid a saddle once it is insulated', () => {
    const on = saddleCounts(circuits, 6, norm, true);
    // 5/8 liquid at 1/2" wall finishes at 1.625" — a 2" saddle.
    const two = on.find(s => s.saddleSize === 2);
    expect(two, 'no 2" saddle for the insulated liquid line').toBeTruthy();
    expect(two.ft).toBe(150);
    expect(two.covers).toEqual(['5/8" MT liquid']);
  });

  it('gives it none when the job does not insulate it', () => {
    const off = saddleCounts(circuits, 6, norm, false);
    expect(off.find(s => s.saddleSize === 2)).toBeFalsy();
    expect(off.map(s => s.saddleSize)).toEqual([3]); // the 1-1/8 MT suction only
  });

  it('never changes what low temp does', () => {
    const low = [{ id: 'b', runLength: 100, sucHoriz: '7/8', liqHoriz: '1/2', tempType: 'low' }];
    expect(saddleCounts(low, 6, norm, false)).toEqual(saddleCounts(low, 6, norm, true));
  });
});

describe('the materials step wires it through', () => {
  const src = readFileSync(new URL('../steps/Step4_Materials.jsx', import.meta.url), 'utf8');

  it('reads the setting once and uses it everywhere it matters', () => {
    expect(src).toMatch(/const insulMedLiquid = insulatesMedLiquid\(rates\)/);
    // The three places it has to reach: the header fold, the circuit fold and
    // the saddles. Missing any one of them is a job that buys insulation with
    // no cradle, or a cradle for insulation it did not buy.
    expect(src).toMatch(/foldHeaders\(state\.headers \|\| \[\], normalizePipeSize, insulMedLiquid\)/);
    expect(src).toMatch(/else if \(insulMedLiquid\) medLiqBySize/);
    expect(src).toMatch(/saddleCounts\(state\.circuits, spacingFt, normalizePipeSize, insulMedLiquid\)/);
  });

  it('generates the line under its own name', () => {
    // "Liquid Insulation — Med Temp" must not merge with the low-temp line, or
    // one of them cannot be trimmed without the other.
    expect(src).toMatch(/Liquid Insulation — Med Temp/);
    expect(src).toMatch(/pushInsulLines\(medLiqBySize, MED_LIQUID_INSUL_CATEGORY/);
  });

  it('puts the choice on screen rather than deciding quietly', () => {
    expect(src).toMatch(/insulateMedLiquid/);
    expect(src).toMatch(/Insulate medium-temp liquid lines/);
  });
});
