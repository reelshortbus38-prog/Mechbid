import { describe, it, expect } from 'vitest';
import { detectDrawingScale } from './pdfRender.js';

// Guards the stated-scale parser that calibrates the stamped scale bar.
// Feet-per-paper-inch: 1/4"=1'-0" → 4, 1/8" → 8, 3/16" → 5.333, 1"=20' → 20.
// Ambiguity (two different scales on one sheet) must return null — stamping
// a wrong ruler is worse than stamping none.

describe('detectDrawingScale', () => {
  it('parses common architectural scales', () => {
    expect(detectDrawingScale('SCALE: 1/4" = 1\'-0"')).toBe(4);
    expect(detectDrawingScale('SCALE: 1/8" = 1\'-0"')).toBe(8);
    expect(detectDrawingScale('scale: 3/16" = 1\'')).toBeCloseTo(5.333, 2);
    expect(detectDrawingScale('1/2" = 1\'-0"')).toBe(2);
  });

  it('parses mixed-number and engineering scales', () => {
    expect(detectDrawingScale('SCALE: 1 1/2" = 1\'-0"')).toBeCloseTo(0.667, 2);
    expect(detectDrawingScale('SCALE: 1" = 20\'')).toBe(20);
    expect(detectDrawingScale('1" = 1\'-0"')).toBe(1);
  });

  it('tolerates unicode quotes from PDF text layers', () => {
    expect(detectDrawingScale('SCALE: 1/4″ = 1′-0″')).toBe(4);
  });

  it('dedupes a repeated scale but refuses ambiguity', () => {
    expect(detectDrawingScale('SCALE: 1/4" = 1\'-0"  ...  PLAN 1/4" = 1\'-0"')).toBe(4);
    // Plan at 1/8 plus a detail at 1/2 — no single ruler is safe.
    expect(detectDrawingScale('PLAN: 1/8" = 1\'-0"   DETAIL: 1/2" = 1\'-0"')).toBeNull();
  });

  it('returns null when no scale is stated', () => {
    expect(detectDrawingScale('GENERAL NOTES: PROVIDE FLEX CONNECTIONS AT ALL DIFFUSERS')).toBeNull();
    expect(detectDrawingScale('')).toBeNull();
    expect(detectDrawingScale('SCALE: AS NOTED')).toBeNull();
  });
});
