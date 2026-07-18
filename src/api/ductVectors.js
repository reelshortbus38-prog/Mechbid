// ── VECTOR GEOMETRY DUCT MEASUREMENT ────────────────────────────────────────────
// A CAD-exported (vector) PDF isn't pixels — every duct line is a real geometric
// object with exact coordinates. The funded takeoff tools read that vector layer
// directly instead of guessing off an image; this does the same, as an
// INDEPENDENT CROSS-CHECK against the vision takeoff.
//
// The honest scope of v1: mechanical drawings follow color conventions (cyan/blue
// is near-universally ductwork; black is the architectural background — walls,
// dimensions, title block). We measure total stroked length per color exactly,
// so the estimator gets a geometry-based footage number to sanity-check the
// vision read against. Two caveats baked into how the result is labeled:
//   • a plan-view duct is drawn as TWO parallel lines, so colored-outline length
//     is ~2× the centerline run — we report both the outline and the ÷2 estimate.
//   • which color is duct varies by office; we report the colored (saturated)
//     linework and name cyan/blue as the usual duct color, never hard-assume it.
//
// Pure geometry — pdf.js OPS constants are PASSED IN (not imported), so the math
// is unit-testable with synthetic operator lists.

// 2×3 affine matrix helpers (PDF transform convention [a,b,c,d,e,f]).
export function matMul(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}
export function matApply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// A stroke color counts as "duct-candidate" (colored) when it's saturated —
// clearly not the black/gray/white architectural background. RGB 0–255.
export function isColored([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return (mx - mn) > 40 && mx > 25;
}

// Cyan / blue are the conventional duct colors on a mechanical plan.
export function isDuctColor([r, g, b]) {
  return b > 150 && g > 120 && r < 180 && b >= r; // cyan (0,255,255) & light blues
}

// Walk a pdf.js operator list ({ fnArray, argsArray }) and sum stroked segment
// length (in PDF points, at viewport scale 1) grouped by stroke color. Tracks
// the CTM through save/restore/transform so every segment is measured in page
// space. Returns { byColor: { 'r,g,b': pts }, coloredPts, ductPts, totalPts }.
export function tallyStrokeLengthByColor(operatorList, OPS) {
  const { fnArray, argsArray } = operatorList;
  let ctm = [1, 0, 0, 1, 0, 0];
  let color = [0, 0, 0];
  const stack = [];
  const byColor = {};
  let coloredPts = 0, ductPts = 0, totalPts = 0;

  const add = (len) => {
    if (!(len > 0)) return;
    const key = color.join(',');
    byColor[key] = (byColor[key] || 0) + len;
    totalPts += len;
    if (isColored(color)) coloredPts += len;
    if (isDuctColor(color)) ductPts += len;
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], a = argsArray[i];
    if (fn === OPS.save) stack.push([ctm.slice(), color.slice()]);
    else if (fn === OPS.restore) { const p = stack.pop(); if (p) { ctm = p[0]; color = p[1]; } }
    else if (fn === OPS.transform) ctm = matMul(ctm, a);
    else if (fn === OPS.setStrokeRGBColor) color = [a[0], a[1], a[2]];
    else if (fn === OPS.constructPath) {
      const subops = a[0], co = a[1];
      let ci = 0, cx = 0, cy = 0, sx = 0, sy = 0;
      for (const op of subops) {
        if (op === OPS.moveTo) { cx = co[ci++]; cy = co[ci++]; sx = cx; sy = cy; }
        else if (op === OPS.lineTo) {
          const nx = co[ci++], ny = co[ci++];
          const [px, py] = matApply(ctm, cx, cy), [qx, qy] = matApply(ctm, nx, ny);
          add(Math.hypot(qx - px, qy - py));
          cx = nx; cy = ny;
        } else if (op === OPS.curveTo) { ci += 6; cx = co[ci - 2]; cy = co[ci - 1]; }
        else if (op === OPS.rectangle) { ci += 4; }
        else if (op === OPS.closePath) {
          const [px, py] = matApply(ctm, cx, cy), [qx, qy] = matApply(ctm, sx, sy);
          add(Math.hypot(qx - px, qy - py));
          cx = sx; cy = sy;
        }
      }
    }
  }
  return { byColor, coloredPts, ductPts, totalPts };
}

// Turn a color tally into a real-world duct-footage cross-check. feetPerInch is
// the drawing scale (feet per paper inch); 72 points per paper inch.
// Returns null when there's no meaningful colored linework to report.
export function ductFootageFromTally(tally, feetPerInch) {
  if (!tally || !feetPerInch) return null;
  const toFt = (pts) => pts / 72 * feetPerInch;
  // Prefer the conventional duct color; fall back to all saturated linework.
  const outlineFt = toFt(tally.ductPts > 0 ? tally.ductPts : tally.coloredPts);
  if (outlineFt < 5) return null; // nothing worth reporting
  return {
    outlineFt: Math.round(outlineFt),
    // Two parallel lines per duct → centerline run ≈ half the outline length.
    centerlineFt: Math.round(outlineFt / 2),
    usedDuctColor: tally.ductPts > 0,
  };
}
