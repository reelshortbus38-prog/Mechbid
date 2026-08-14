import { describe, it, expect } from 'vitest';
import { textDuctSizes, textRoundSizes, coverageGap } from './sheetCoverage.js';

// Verbatim from the text layer of sheet M3.12b — the same live sheet the
// device-face rule was built against.
const SHEET = `M10 M10 20x18 UP/DN 16x14 UP/DN 14x14 UP 14x12 UP 20x20 UP
  J 720 24x12 (TYP 2) M2 204x4 O 150 24x24 J 580 24x12 O 120 24x24
  F 50 10x10 (TYP 5) O 250 24x48 (TYP 2) M1 60x3 (TYP 4) F 700 22x22
  30x16 24x12 14x10 12x12 20x16 16x16 18x36 22x16 10x10 8x8 12x10 26x22
  8"ø 10"ø 10"ø 12"ø 6"ø 14x14 DN 18x12 26x26`;

describe('what the sheet says it has', () => {
  it('counts duct sizes and leaves device faces out of the expectation', () => {
    const d = textDuctSizes(SHEET);
    expect(d.has('20x18')).toBe(true);
    expect(d.has('12x12')).toBe(true);
    // Faces, by context and by aspect — demanding these as duct would be
    // exactly backwards.
    expect(d.has('24x48')).toBe(false);
    expect(d.has('24x24')).toBe(false);
    expect(d.has('204x4')).toBe(false);
    expect(d.has('60x3')).toBe(false);
  });

  it('counts each size as many times as the drawing labels it', () => {
    expect(textDuctSizes(SHEET).get('14x14')).toBe(2);
  });

  it('counts round diameters', () => {
    const r = textRoundSizes(SHEET);
    expect(r.get(10)).toBe(2);
    expect([...r.keys()].sort((a, b) => a - b)).toEqual([6, 8, 10, 12]);
  });
});

describe('coverageGap', () => {
  const complete = pageText => [
    ...textDuctSizes(pageText).keys()].map(s => ({ shape: 'rect', size: s })).concat(
    [...textRoundSizes(pageText).keys()].map(d => ({ shape: 'round', size: `${d}"ø` })));

  it('says nothing when the read covered the sheet', () => {
    expect(coverageGap(complete(SHEET), SHEET, 'Page 11').flags).toEqual([]);
  });

  it('names the sizes a thin read missed', () => {
    const { flags, missingRect } = coverageGap(
      [{ shape: 'rect', size: '12x12' }, { shape: 'rect', size: '10x10' }], SHEET, 'Page 11');
    expect(missingRect.length).toBeGreaterThan(5);
    expect(flags).toHaveLength(1);
    expect(flags[0].text).toMatch(/^Page 11: the sheet's own text shows \d+ duct size\(s\) the read did not return/);
    expect(flags[0].text).toMatch(/20x18|16x14|14x12/);
    expect(flags[0].type).toBe('warn');
  });

  it('holds its tongue on a gap of one or two, which is noise', () => {
    const runs = complete(SHEET);
    expect(coverageGap(runs.slice(0, -2), SHEET, 'Page 11').flags).toEqual([]);
  });

  it('does not report a shape mix-up as a hole', () => {
    // A round run filed as rect (or the reverse) is a different defect, already
    // reported elsewhere. It must not also read as missing coverage.
    const runs = complete(SHEET).map(r => ({ ...r, shape: 'rect' }));
    expect(coverageGap(runs, SHEET, 'Page 11').flags).toEqual([]);
  });

  it('stays quiet on a scanned sheet, which has no text to compare against', () => {
    expect(coverageGap([], '', 'Page 3').flags).toEqual([]);
    expect(coverageGap([], '   ', 'Page 3').flags).toEqual([]);
  });

  it('caps the named list but still gives the true total', () => {
    const { flags } = coverageGap([], SHEET, 'Page 11');
    const named = (flags[0].text.match(/×\d+\)/g) || []).length;
    expect(named).toBeLessThanOrEqual(10);
    expect(flags[0].text).toMatch(/and \d+ more/);
  });
});
