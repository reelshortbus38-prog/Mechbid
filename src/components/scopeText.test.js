import { describe, it, expect } from 'vitest';
import { extractRackWorkSections, extractPartsList, normalizeDesc, isCO2Content } from './scopeText.js';

// The CO₂ addendum filter: HFC stores never do transcritical CO₂ work, but
// the scope docs carry the addendum as boilerplate. isCO2Content flags the
// unmistakable CO₂ lines so they can be dropped on an HFC bid — without
// catching ordinary refrigeration text.
describe('isCO2Content', () => {
  it('catches unmistakable CO₂/transcritical addendum lines', () => {
    expect(isCO2Content('CO2 (R744) refrigerant charge per manufacturer')).toBe(true);
    expect(isCO2Content('K65 copper for transcritical high-pressure side')).toBe(true);
    expect(isCO2Content('Gas cooler piping and flash gas bypass')).toBe(true);
    expect(isCO2Content('Booster rack compressor connections')).toBe(true);
    expect(isCO2Content('fittings rated to 1300 psi')).toBe(true);
    expect(isCO2Content('carbon dioxide leak detection')).toBe(true);
  });

  it('leaves ordinary HFC refrigeration scope alone', () => {
    expect(isCO2Content('Remove 40\' DX6XN Lunch Meat #16, 17, 18, 19 (A6)')).toBe(false);
    expect(isCO2Content('Pipe new header for Rack A, R-448A charge')).toBe(false);
    expect(isCO2Content('Terminate both ends of case sensor cable')).toBe(false);
    expect(isCO2Content('Replace oil separator float on Rack D')).toBe(false);
    expect(isCO2Content('')).toBe(false);
  });
});

// Mirrors the real store-47 flat scope of work: per-rack store-specific work
// followed by PARTS LIST, followed by a numbered field-item clause list. The
// AI path was dropping 12 of the 13 parts and misfiling the rack work — these
// sections are rigid enough to read deterministically.
const STORE_47 = [
  'Revision Date:\t3/25/14\t',
  '',
  'Store #:\t47\t',
  '',
  'RACK A',
  'NOTE CASE CHANGES',
  'CHANGE OIL SEPARATOR FLOAT',
  '',
  'RACK B',
  'NOTE CASE CHANGES',
  'CHANGE EPR ON CIRCUIT 4 TO SORIT 15',
  'CHANGE OIL SEPARATOR FLOAT',
  '',
  'RACK C',
  'NOTE CASE CHANGES',
  'ADD SORIT 12 & HOT GAS SOLENOID TO CIRCUIT 6',
  'ADD DUMP VALVES TO CASES 40, 45, 50',
  'CHANGE OIL SEPARATOR FLOAT',
  '',
  '',
  'PARTS LIST:',
  '',
  '8 - CPC SENSORS',
  '1 - SORIT 15',
  '1 - SORIT 12',
  '1 - 1 3/8 BALL VALVE',
  '1 - 1 1/8 BALL VALVE',
  '2 - 5/8 BALL VALVES',
  '1 - ¼" ANGLE VALVE',
  '1 - REFLEX HOSE',
  '2 - MKC-1 208V COILS',
  '1 - E14S250',
  '1 - MKC-2 208V COIL',
  '3 - OIL SEPARATOR FLOAT KITS',
  '3 - DUMP VALVE KITS',
  '',
  '',
  '1.- REPAIR/ REPLACE DRIP PAN ISSUES AT SEVERAL AREAS IN FROZEN FOOD DEPT.',
  '2. C7= REPLACE 7/8 SUCTION LINE WITH 1 3/8 AT REDUCTION IN MOTOR ROOM. 15FT.',
].join('\n');

describe('extractRackWorkSections', () => {
  it('reads all three rack sections from the store-47 scope', () => {
    const s = extractRackWorkSections(STORE_47);
    expect(s.map(x => x.rack)).toEqual(['A', 'B', 'C']);
    expect(s[0].tasks).toEqual(['NOTE CASE CHANGES', 'CHANGE OIL SEPARATOR FLOAT']);
    expect(s[1].tasks).toContain('CHANGE EPR ON CIRCUIT 4 TO SORIT 15');
    expect(s[2].tasks).toContain('ADD DUMP VALVES TO CASES 40, 45, 50');
  });

  it('stops the last rack section at PARTS LIST (parts are not rack tasks)', () => {
    const s = extractRackWorkSections(STORE_47);
    const allTasks = s.flatMap(x => x.tasks).join(' | ');
    expect(allTasks).not.toMatch(/CPC SENSORS|BALL VALVE/);
  });

  it('stops at numbered clauses and big blank gaps', () => {
    const text = 'RACK A\nCHANGE FLOAT\n1.- REPAIR DRIP PANS\nNOT A TASK';
    const s = extractRackWorkSections(text);
    expect(s[0].tasks).toEqual(['CHANGE FLOAT']);
  });

  it('returns [] when there are no rack headings', () => {
    expect(extractRackWorkSections('Refrigeration contractor will do things.')).toEqual([]);
    expect(extractRackWorkSections('')).toEqual([]);
  });
});

describe('extractPartsList', () => {
  it('reads all 13 parts from the store-47 list', () => {
    const p = extractPartsList(STORE_47);
    expect(p.length).toBe(13);
    expect(p[0]).toEqual({ qty: 8, desc: 'CPC SENSORS' });
    expect(p.find(x => x.desc === 'OIL SEPARATOR FLOAT KITS')?.qty).toBe(3);
    expect(p.find(x => x.desc === '¼" ANGLE VALVE')?.qty).toBe(1);
  });

  it('does not swallow the numbered clause list after the parts', () => {
    const p = extractPartsList(STORE_47);
    expect(p.map(x => x.desc).join(' ')).not.toMatch(/REPAIR|SUCTION LINE/);
  });

  it('handles a doc with no parts list', () => {
    expect(extractPartsList('RACK A\nCHANGE FLOAT')).toEqual([]);
  });
});

describe('normalizeDesc', () => {
  it('is case and punctuation insensitive', () => {
    expect(normalizeDesc('Change Oil-Separator  Float!')).toBe(normalizeDesc('CHANGE OIL SEPARATOR FLOAT'));
  });
});
