import { describe, it, expect } from 'vitest';
import { ftPerPixel, measureFeet, formatFeet } from './sheetScale.js';

// The app told the estimator to "verify by scaling the plan". Plenty of them
// only ever have the PDF — no print, no architect's scale — so that asked for
// work it was not providing. The drawing states its own scale, so the sheet
// can measure itself.

describe('ftPerPixel', () => {
  it('derives feet-per-pixel from the scale printed on the sheet', () => {
    // 1/4" = 1'-0" is 4 ft per paper inch. Rendered at 3x: 216 px per inch.
    expect(ftPerPixel('SCALE: 1/4" = 1\'-0"', 3)).toBeCloseTo(4 / 216, 8);
  });

  it('handles an engineering scale too', () => {
    // 1" = 20' on a 2x render: 20 ft over 144 px.
    expect(ftPerPixel('SCALE: 1" = 20\'', 2)).toBeCloseTo(20 / 144, 8);
  });

  it('returns null when the sheet states no scale — nothing to measure with', () => {
    expect(ftPerPixel('MECHANICAL SHEET INDEX', 3)).toBeNull();
    expect(ftPerPixel('SCALE: 1/4" = 1\'-0"', 0)).toBeNull();
  });
});

describe('measureFeet', () => {
  it('measures a straight run', () => {
    // 216 px at 4 ft per paper inch, 3x render → exactly 4 ft.
    expect(measureFeet({ x: 0, y: 0 }, { x: 216, y: 0 }, 4 / 216)).toBeCloseTo(4, 6);
  });

  it('measures a diagonal, not just the axes', () => {
    expect(measureFeet({ x: 0, y: 0 }, { x: 3, y: 4 }, 1)).toBe(5);
  });

  it('refuses to answer without a scale', () => {
    expect(measureFeet({ x: 0, y: 0 }, { x: 10, y: 0 }, null)).toBeNull();
    expect(measureFeet(null, { x: 1, y: 1 }, 1)).toBeNull();
  });
});

describe('formatFeet', () => {
  it('reads the way an estimator writes it', () => {
    expect(formatFeet(12.5)).toBe("12'-6\"");
    expect(formatFeet(31.833)).toBe("31'-10\"");
    expect(formatFeet(8)).toBe("8'-0\"");
  });

  it('rolls 12 inches up into the next foot', () => {
    expect(formatFeet(9.999)).toBe("10'-0\"");
  });

  it('says nothing when there is nothing to say', () => {
    expect(formatFeet(null)).toBe('');
  });
});
