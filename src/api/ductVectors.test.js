import { describe, it, expect } from 'vitest';
import { matMul, matApply, isColored, isDuctColor, tallyStrokeLengthByColor, ductFootageFromTally } from './ductVectors.js';

// Minimal synthetic OPS map — the reducer takes OPS as a param precisely so the
// geometry math can be tested without pdf.js. Codes are arbitrary but internally
// consistent with the operator lists we build below.
const OPS = {
  save: 1, restore: 2, transform: 3, setStrokeRGBColor: 4, constructPath: 5,
  moveTo: 10, lineTo: 11, curveTo: 12, rectangle: 13, closePath: 14,
};

// Build one constructPath entry: a polyline through the given [x,y] points.
function polyline(points) {
  const subops = [OPS.moveTo];
  const coords = [points[0][0], points[0][1]];
  for (let i = 1; i < points.length; i++) { subops.push(OPS.lineTo); coords.push(points[i][0], points[i][1]); }
  return { fn: OPS.constructPath, args: [subops, coords] };
}
function ops(list) {
  return { fnArray: list.map(o => o.fn), argsArray: list.map(o => o.args) };
}

describe('matrix helpers', () => {
  it('composes and applies affine transforms', () => {
    const scale2 = [2, 0, 0, 2, 0, 0];
    const move = [1, 0, 0, 1, 10, 5];
    expect(matApply(scale2, 3, 4)).toEqual([6, 8]);
    expect(matApply(matMul(move, scale2), 3, 4)).toEqual([16, 13]); // scale then translate
  });
});

describe('color classification', () => {
  it('separates saturated duct colors from black/gray background', () => {
    expect(isColored([0, 255, 255])).toBe(true);   // cyan
    expect(isColored([127, 191, 255])).toBe(true);  // light blue
    expect(isColored([0, 0, 0])).toBe(false);       // black
    expect(isColored([128, 128, 128])).toBe(false); // gray
    expect(isDuctColor([0, 255, 255])).toBe(true);
    expect(isDuctColor([255, 0, 0])).toBe(false);   // red is not a duct color
  });
});

describe('tallyStrokeLengthByColor', () => {
  it('measures true segment length through the CTM, grouped by color', () => {
    // A 3-4-5 triangle leg pair: (0,0)->(30,0)->(30,40) = 30 + 40 = 70 units.
    const t = tallyStrokeLengthByColor(ops([
      { fn: OPS.setStrokeRGBColor, args: [0, 255, 255] },
      polyline([[0, 0], [30, 0], [30, 40]]),
    ]), OPS);
    expect(t.byColor['0,255,255']).toBeCloseTo(70, 5);
    expect(t.ductPts).toBeCloseTo(70, 5);
    expect(t.totalPts).toBeCloseTo(70, 5);
  });

  it('applies an active scale transform to the measured length', () => {
    const t = tallyStrokeLengthByColor(ops([
      { fn: OPS.transform, args: [3, 0, 0, 3, 0, 0] }, // 3× scale
      { fn: OPS.setStrokeRGBColor, args: [0, 255, 255] },
      polyline([[0, 0], [10, 0]]), // 10 units × 3 = 30
    ]), OPS);
    expect(t.ductPts).toBeCloseTo(30, 5);
  });

  it('restores the transform and color on save/restore', () => {
    const t = tallyStrokeLengthByColor(ops([
      { fn: OPS.setStrokeRGBColor, args: [0, 0, 0] },
      { fn: OPS.save, args: [] },
      { fn: OPS.transform, args: [2, 0, 0, 2, 0, 0] },
      { fn: OPS.setStrokeRGBColor, args: [0, 255, 255] },
      polyline([[0, 0], [10, 0]]), // 20 units, cyan
      { fn: OPS.restore, args: [] },
      polyline([[0, 0], [5, 0]]),  // 5 units, back to black at 1×
    ]), OPS);
    expect(t.byColor['0,255,255']).toBeCloseTo(20, 5);
    expect(t.byColor['0,0,0']).toBeCloseTo(5, 5);
    expect(t.ductPts).toBeCloseTo(20, 5); // black excluded from duct
  });

  it('separates duct-colored linework from the black architectural background', () => {
    const t = tallyStrokeLengthByColor(ops([
      { fn: OPS.setStrokeRGBColor, args: [0, 0, 0] },
      polyline([[0, 0], [100, 0]]),                 // 100 units black (walls)
      { fn: OPS.setStrokeRGBColor, args: [0, 255, 255] },
      polyline([[0, 0], [40, 0]]),                  // 40 units cyan (duct)
    ]), OPS);
    expect(t.totalPts).toBeCloseTo(140, 5);
    expect(t.ductPts).toBeCloseTo(40, 5);
    expect(t.coloredPts).toBeCloseTo(40, 5);
  });
});

describe('ductFootageFromTally', () => {
  it('converts duct points to feet and halves outline for centerline', () => {
    // 2880 pts of duct outline at 1/4" scale (4 ft/in): 2880/72*4 = 160 ft outline.
    const r = ductFootageFromTally({ ductPts: 2880, coloredPts: 2880 }, 4);
    expect(r.outlineFt).toBe(160);
    expect(r.centerlineFt).toBe(80);
    expect(r.usedDuctColor).toBe(true);
  });

  it('falls back to all colored linework when no conventional duct color present', () => {
    const r = ductFootageFromTally({ ductPts: 0, coloredPts: 1440 }, 4);
    expect(r.outlineFt).toBe(80);
    expect(r.usedDuctColor).toBe(false);
  });

  it('returns null when there is no meaningful colored linework', () => {
    expect(ductFootageFromTally({ ductPts: 0, coloredPts: 0 }, 4)).toBeNull();
    expect(ductFootageFromTally(null, 4)).toBeNull();
    expect(ductFootageFromTally({ ductPts: 2880 }, 0)).toBeNull();
  });
});
