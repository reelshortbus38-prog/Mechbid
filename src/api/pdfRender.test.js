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

  it('parses engineering scales', () => {
    expect(detectDrawingScale('SCALE: 1" = 20\'')).toBe(20);
  });

  it('rejects DETAIL scales — measuring duct runs against one is garbage', () => {
    // A detail's title ("3" = 1'-0"", "1" = 1'-0"", "1 1/2" = 1'-0"") is a
    // real scale but not a plan-measurement scale: on a real set a misparsed
    // 0.323 ft/in page measured duct runs at ~1/30 of their true length.
    // Below 2 ft/in (or above 60) return null — no ruler beats a wrong ruler.
    expect(detectDrawingScale('SCALE: 1 1/2" = 1\'-0"')).toBeNull();
    expect(detectDrawingScale('1" = 1\'-0"')).toBeNull();
    expect(detectDrawingScale('SCALE: 3" = 1\'-0"')).toBeNull();
    expect(detectDrawingScale('SCALE: 1" = 100\'')).toBeNull(); // beyond site-plan range
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
