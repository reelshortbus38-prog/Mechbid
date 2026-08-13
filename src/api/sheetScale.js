// ── MEASURING OFF THE SHEET ──────────────────────────────────────────────────
// The app kept telling the estimator to "verify by scaling the plan", which
// assumes a printed-to-scale drawing and an architect's scale. Plenty of
// estimators only ever have the PDF — so that instruction asked for work the
// app was not providing, and could not be done at all.
//
// It never needed to. The drawing's stated scale is already parsed for the
// vision pass, and the render scale is known, so the sheet can measure itself:
//
//   1 PDF point = 1/72 paper inch
//   a viewport rendered at S puts S pixels on every point
//   so   feet per pixel = feetPerPaperInch / (72 * S)
//
// Same arithmetic the calibrated scale bar already uses. Exposed here so the
// viewer can turn two taps into a distance.
//
// Pure — no React, no pdf.js.

import { detectDrawingScale } from './pdfRender.js';

// pageText: the sheet's text layer (that is where "1/4\" = 1'-0\"" lives).
// renderScale: the pdf.js viewport scale the image was rendered at.
// Returns feet-per-pixel, or null when the sheet states no scale — in which
// case nothing is measurable and the UI must say so rather than guess.
export function ftPerPixel(pageText, renderScale) {
  const ftPerInch = detectDrawingScale(pageText);
  if (!ftPerInch || !renderScale) return null;
  return ftPerInch / (72 * renderScale);
}

// Straight-line distance between two points in rendered pixels.
export function measureFeet(a, b, ftPerPx) {
  if (!a || !b || !ftPerPx) return null;
  return Math.hypot(b.x - a.x, b.y - a.y) * ftPerPx;
}

// Feet as an estimator writes them: 12'-6", not 12.53 ft.
export function formatFeet(feet) {
  if (!Number.isFinite(feet)) return '';
  const whole = Math.floor(feet);
  const inches = Math.round((feet - whole) * 12);
  return inches === 12 ? `${whole + 1}'-0"` : `${whole}'-${inches}"`;
}
