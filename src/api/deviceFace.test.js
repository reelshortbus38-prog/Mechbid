import { describe, it, expect } from 'vitest';
import { sizeContexts, deviceFaceSizes, dropDeviceFaces } from './deviceFace.js';

// Every string below is lifted verbatim from the text layer of a live sheet —
// "HVAC PLAN - LEVEL 2 - AREA B", a school job. That sheet carries 126 device
// callouts and writes every face size in duct notation.
const SHEET = `M10 M10 20x18 UP/DN 16x14 UP/DN 14x14 UP 14x12 UP 20x20 UP
  J 720 24x12 (TYP 2) M2 204x4 O 150 24x24 J 580 24x12 O 120 24x24
  F 50 10x10 (TYP 5) F 100 10x10 (TYP 2) O 250 24x48 (TYP 2) F 10x10 (TYP 2)
  J 3500 32x72 F 700 22x22 O 690 36x48 F 22x10 (TYP 2) A 290 8ø
  30x16 24x12 14x10 12x12 20x16 16x16 18x36 18x36 22x16 10x10 8x8 12x10
  O 315 24x48 (TYP 2) F 120 22x10 F 70 22x10 14x14 DN 12x12 DN 18x12 26x22`;

describe('sizeContexts', () => {
  it('separates a size on a device tag from the same size on a run', () => {
    const c = sizeContexts(SHEET);
    // 24x12 is a grille face in "J 580 24x12" AND a duct size bare on a run.
    expect(c.get('24x12').tagged).toBeGreaterThan(0);
    expect(c.get('24x12').alone).toBeGreaterThan(0);
    // 24x48 is only ever a face.
    expect(c.get('24x48').alone).toBe(0);
    // 20x18 is only ever a run.
    expect(c.get('20x18').tagged).toBe(0);
  });

  it('does not read a column bubble as a device type', () => {
    // "M10 M10 20x18 UP/DN" — the grid line sits right in front of the size.
    expect(sizeContexts('M10 M10 20x18 UP/DN').get('20x18').tagged).toBe(0);
    expect(sizeContexts('M33 M33 26x22').get('26x22').tagged).toBe(0);
  });

  it('treats a riser callout as duct no matter what precedes it', () => {
    expect(sizeContexts('O 150 24x24 UP/DN').get('24x24').alone).toBe(1);
  });

  it('counts TYP multipliers into the device quantity', () => {
    expect(sizeContexts('O 250 24x48 (TYP 2) O 315 24x48 (TYP 2)').get('24x48').typ).toBe(4);
  });

  it('reads a tag whose CFM is omitted', () => {
    expect(sizeContexts('F 22x10 (TYP 2)').get('22x10').tagged).toBe(1);
  });
});

describe('deviceFaceSizes', () => {
  it('names only the sizes that never once stand alone', () => {
    const f = deviceFaceSizes(SHEET);
    expect([...f.keys()].sort()).toEqual(['22x10', '22x22', '24x24', '24x48', '32x72', '36x48']);
    expect(f.get('24x48').types.has('O')).toBe(true);
  });

  it('refuses the ambiguous ones, which is the point', () => {
    // 24x12 and 10x10 are BOTH a face and a duct size on this sheet. Nothing
    // that looks at the number can separate them, so neither moves.
    const f = deviceFaceSizes(SHEET);
    expect(f.has('24x12')).toBe(false);
    expect(f.has('10x10')).toBe(false);
  });

  it('finds nothing on a sheet with no text layer, rather than guessing', () => {
    expect(deviceFaceSizes('').size).toBe(0);
  });
});

describe('dropDeviceFaces', () => {
  const runs = [
    { shape: 'rect', size: '24x48', estLengthFt: 60 },
    { shape: 'rect', size: '24x12', estLengthFt: 80 },
    { shape: 'rect', size: '20x18', estLengthFt: 45 },
    { shape: 'round', size: '8"ø', estLengthFt: 30 },
  ];

  it('lifts the face out of ductwork and leaves every real run alone', () => {
    const { runs: kept, devices } = dropDeviceFaces(runs, SHEET, 'Page 1');
    expect(kept.map(r => r.size)).toEqual(['24x12', '20x18', '8"ø']);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ tag: 'O', faceSize: '24x48' });
    expect(devices[0].qty).toBeGreaterThan(0);
  });

  it('says so, every time, with the count and the type', () => {
    const { flags } = dropDeviceFaces(runs, SHEET, 'Page 1');
    expect(flags).toHaveLength(1);
    expect(flags[0].text).toMatch(/^Page 1: "24x48" was read as a duct size/);
    expect(flags[0].text).toMatch(/of type O/);
    expect(flags[0].text).toMatch(/not priced as fabricated sheet metal/);
  });

  it('never touches a round run', () => {
    const { runs: kept } = dropDeviceFaces([{ shape: 'round', size: '24x48' }], SHEET, '');
    expect(kept).toHaveLength(1);
  });

  it('passes everything through when the page has no text', () => {
    const { runs: kept, devices, flags } = dropDeviceFaces(runs, '', 'Page 1');
    expect(kept).toEqual(runs);
    expect(devices).toEqual([]);
    expect(flags).toEqual([]);
  });
});
