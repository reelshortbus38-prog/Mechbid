import { describe, it, expect } from 'vitest';
import {
  numToken, pumpFactsFromLine, dpSetpointFacts, fluidPctFacts, equipHeadFacts, extractFacts,
} from './factExtract.js';

// ── REAL LINES ───────────────────────────────────────────────────────────────
// Verbatim from the Edmonds SD College Place set, reconstructed by exactly the
// y-banding in pdfRender.js. The trailing junk is real: the hose kit sizing
// schedule shares a y-band with the pump rows, and CWP-02 has a whole sentence
// of a note welded onto its tail. Anything that parses these has to survive it.
const HWP01 = 'HWP-01 MECHANICAL K100 HYDRONIC WATER - LOAD-SIDE B&G / E-1510 2.5AC BASE MOUNTED 276 83 78 1800 10.0 460/3 38x17 x18 580 Y FLOOR 3/M10.06 1/M10.06 1, 2 HWP-01 1/2 0 - 0.9 1 1/2 10.2 - 16.1 4 9';
const CWP01 = 'CWP-01 MECHANICAL K100 CONDENSER WATER - SOURCE-SIDE B &G / E-1510 3GB BASE MOUNTED 455 125 75 1800 25.0 460/3 52x 20x24 320 Y FLOOR 3/M10.06 1/M10.05 1, 2 CWP-01 1 1/4 5.8 - 10.1 3 60.9 - 97.9 -';
const CWP02 = 'CWP-02 MECHANICAL K100 CONDENSER WATER - SOURCE-SIDE B &G / E-1510 3GB BASE MOUNTED 455 125 75 1800 25.0 460/3 52x 20x24 320 Y FLOOR 3/M10.06 1/M10.05 1, 2 CWP-02 1. 230900 SHALL PROVIDE A 2-WAY CONTROL VALVE FOR A LL EQUIPMENT UNLESS NOTED O';
const CWP04 = 'CWP-04 MECHANICAL K100 KITCHEN WATER-COOLED CONDENSING UNIT B&G / PL-36 INLINE 10 30 - 3300 1/6 120/1 7x5x9 15 N SUSPENDED - - 1, 2, 3 CWP-04';
const GMU = 'CAS-01 MECHANICAL K100 CONDENSER WATER - SOURCE SIDE SPIROTHERM/VDN 800FA AIR/DIRT 890 40.0 8" 3.0 16x52 760 FLO OR 1/M10.05 NOTE 1 CAS-01 GMU-01 MECHANICAL K100 CONDENSER WATER B&G / GMU560P/S 20% PG 1 30 55 1 120 / 1';

const DP_SYSTEM = 'The DDC controller shall sta ge heat pumps as follows: The HW Differential Pressure STPT shall be reset ov er a range, initially set from 8-12 PSI. The DDC';
const DP_HEADER = 'nt up to 200% of the normal operat ing set point and wait 30 seconds before The differential pressure set point for the heat pu mp header shall initially be set as 4 PSI.';
const DP_MIN = 'The reverse shall occur as the plant requests increase over The minimum differential pressure set point for the hydronic plant shall initially be set as 3 PSI (ba sed.';
const GAUGE = 'pressure, the PRESSURE GAUGE. 0-160 PSIG.';

const byKind = (facts, kind) => facts.filter(f => f.kind === kind);
const val = (facts, kind) => (byKind(facts, kind)[0] || {}).value;

describe('numToken', () => {
  it('reads plain and decimal numbers', () => {
    expect(numToken('276')).toBe(276);
    expect(numToken('10.0')).toBe(10);
  });

  it('reads a fractional horsepower', () => {
    expect(numToken('1/6')).toBeCloseTo(0.1667, 3);
  });

  it('reads a mixed fraction', () => {
    expect(numToken('1-1/4')).toBe(1.25);
  });

  it('treats a dash as absent, not as zero', () => {
    expect(numToken('-')).toBeNull();
    expect(numToken('')).toBeNull();
    expect(numToken('FLOOR')).toBeNull();
  });
});

describe('pump rows off the real schedule', () => {
  it('reads HWP-01 despite the hose kit schedule glued to its tail', () => {
    const f = pumpFactsFromLine(HWP01, 'M8.01');
    expect(val(f, 'pumpFlow')).toBe(276);
    expect(val(f, 'pumpHead')).toBe(83);
    expect(val(f, 'pumpEff')).toBe(78);
    expect(val(f, 'pumpRpm')).toBe(1800);
    expect(val(f, 'pumpMotorHp')).toBe(10);
  });

  it('reads CWP-01 despite the manufacturer splitting as "B &G"', () => {
    const f = pumpFactsFromLine(CWP01, 'M8.01');
    expect(val(f, 'pumpFlow')).toBe(455);
    expect(val(f, 'pumpHead')).toBe(125);
    expect(val(f, 'pumpMotorHp')).toBe(25);
  });

  it('reads CWP-02 despite a sentence of a note welded to the end', () => {
    const f = pumpFactsFromLine(CWP02, 'M8.01');
    expect(val(f, 'pumpFlow')).toBe(455);
    expect(val(f, 'pumpMotorHp')).toBe(25);
  });

  it('reads CWP-04, whose efficiency is a dash and whose motor is 1/6', () => {
    const f = pumpFactsFromLine(CWP04, 'M8.01');
    expect(val(f, 'pumpFlow')).toBe(10);
    expect(val(f, 'pumpHead')).toBe(30);
    expect(val(f, 'pumpMotorHp')).toBe(0.167);
    // A dash is not an efficiency, so no efficiency fact is invented for it.
    expect(byKind(f, 'pumpEff').length).toBe(0);
  });

  it('tags each pump with the loop its row names', () => {
    expect(pumpFactsFromLine(HWP01)[0].system).toBe('hydronic');
    expect(pumpFactsFromLine(CWP01)[0].system).toBe('condenser');
    // The kitchen circulator names no loop, and gets none rather than a guess.
    expect(pumpFactsFromLine(CWP04)[0].system).toBe('');
  });

  it('returns nothing for a line that is not a pump row', () => {
    expect(pumpFactsFromLine('NOTES: 1. PROVIDE WITH 100 PSI PRESSURE RELIEF VALVE.')).toEqual([]);
    expect(pumpFactsFromLine('P3 SEE PLANS VULCAN / PRV 03 8" AFF VERTICAL')).toEqual([]);
    expect(pumpFactsFromLine('')).toEqual([]);
  });

  it('refuses a row with no mounting type — the anchor the columns hang off', () => {
    expect(pumpFactsFromLine('HWP-01 MECHANICAL K100 276 83 78 1800 10.0')).toEqual([]);
  });
});

describe('differential pressure setpoints', () => {
  it('takes the TOP of a range — the pump has to make head at the worst case', () => {
    const f = dpSetpointFacts(DP_SYSTEM, 'M10.06');
    expect(f.length).toBe(1);
    expect(f[0].value).toBe(12);
  });

  it('names the system setpoint from the words before the phrase', () => {
    expect(dpSetpointFacts(DP_SYSTEM)[0].subject).toBe('HW');
  });

  it('names a subject that appears AFTER the phrase instead', () => {
    expect(dpSetpointFacts(DP_HEADER)[0].subject).toMatch(/header/);
  });

  it('keeps a minimum qualifier, because a plant min and max are two setpoints', () => {
    const f = dpSetpointFacts(DP_MIN)[0];
    expect(f.subject).toMatch(/minimum/);
    expect(f.subject).toMatch(/hydronic plant/);
    expect(f.value).toBe(3);
  });

  it('does NOT read a pressure gauge range as a setpoint', () => {
    expect(dpSetpointFacts(GAUGE)).toEqual([]);
    expect(dpSetpointFacts('PRESSURE RELIEF VALVE, SET TO 100 PSI')).toEqual([]);
  });

  it('finds all three real setpoints in one pass', () => {
    const f = dpSetpointFacts([DP_SYSTEM, DP_HEADER, DP_MIN, GAUGE].join('\n'));
    expect(f.map(x => x.value).sort((a, b) => a - b)).toEqual([3, 4, 12]);
  });
});

describe('fluid concentration', () => {
  it('reads "20% PG" off the make-up unit row and tags its loop', () => {
    const f = fluidPctFacts(GMU, 'M8.01');
    expect(f.length).toBe(1);
    expect(f[0].value).toBe(20);
    expect(f[0].system).toBe('condenser');
  });

  it('reads a spelled-out concentration', () => {
    expect(fluidPctFacts('CHARGE SYSTEM WITH 30% PROPYLENE GLYCOL')[0].value).toBe(30);
  });

  it('does not invent one from a bare number under a GLYCOL % column', () => {
    // The heat pump row carries 25 in a GLYCOL % column. Nothing in flat text
    // ties the header to the number, so it is deliberately not read.
    const row = 'WWHP-01 MECHANICAL K100 HYDRONIC WATER SYSTEM TRUCLIMATE500 R-454B 16 2.7 150.8 6 3-WAY 1.41 110.3 6 3-WAY 25 703.7';
    expect(fluidPctFacts(row)).toEqual([]);
  });
});

describe('equipment pressure drop', () => {
  it('reads a drop only where the units are on the same line', () => {
    const f = equipHeadFacts('HX-01 PLATE HEAT EXCHANGER MAX WPD 14.5 FT', 'M8.01');
    expect(f[0].value).toBe(14.5);
    expect(f[0].subject).toBe('HX-01');
  });

  it('converts a psi drop to feet', () => {
    expect(equipHeadFacts('B-01 BOILER PRESSURE DROP 2 PSI')[0].value).toBeCloseTo(4.62, 2);
  });

  it('refuses a bare column number whose units are on the header line', () => {
    // The real air separator row: its "3.0" is FT HD, but the header saying so
    // is a different line. Guessing here would put an invented fact in the
    // ledger looking exactly like a read one.
    expect(equipHeadFacts(GMU)).toEqual([]);
  });
});

describe('extractFacts over a whole sheet', () => {
  it('pulls pumps, setpoints and fluid together', () => {
    const text = [HWP01, CWP01, CWP04, GMU, DP_SYSTEM, GAUGE].join('\n');
    const f = extractFacts(text, 'M8.01');
    expect(byKind(f, 'pumpFlow').map(x => x.subject).sort()).toEqual(['CWP-01', 'CWP-04', 'HWP-01']);
    expect(byKind(f, 'dpSetpoint').length).toBe(1);
    expect(byKind(f, 'fluidPct').length).toBe(1);
  });

  it('stamps the sheet on everything it found', () => {
    for (const x of extractFacts([HWP01, DP_SYSTEM].join('\n'), 'M8.01')) {
      expect(x.sheet).toBe('M8.01');
    }
  });

  it('finds nothing on a sheet with no schedule or sequence, and says so quietly', () => {
    const plan = '3/4"HWS UP 2.2 GPM FT-M201 1 1/4"CWS DN CLASSROOM - MS M235';
    expect(extractFacts(plan, 'M4.12b')).toEqual([]);
  });
});
