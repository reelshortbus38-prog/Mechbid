import { describe, it, expect } from 'vitest';
import { reviewGlycolInputs, reviewSummary, DEFAULT_COMPONENT_HEAD_FT } from './glycolAssumptions.js';
import { checkMix } from './glycolSystem.js';

const has = (items, frag) => items.some(i => i.label.includes(frag));
const sev = (items, frag) => items.find(i => i.label.includes(frag))?.severity;
const src = (items, frag) => items.find(i => i.label.includes(frag))?.source;

// A placeholder wearing the same font as a computed number is the dangerous
// kind — it does not look like a guess. So every figure says where it came
// from, and the ones only the paperwork knows say so even when nothing is
// visibly wrong.

describe('the numbers only the submittals know', () => {
  it('blocks on a coil volume of zero, because the pipe is not the system', () => {
    const r = reviewGlycolInputs({ coilGal: 0, fixtures: 5, btuh: 900000, deltaT: 8 });
    expect(sev(r, 'Coil + barrel fluid volume')).toBe('blocker');
    expect(src(r, 'Coil + barrel fluid volume')).toBe('submittal');
  });

  it('stops mentioning it once a real volume is entered', () => {
    const r = reviewGlycolInputs({ coilGal: 120, fixtures: 5, btuh: 900000, deltaT: 8 });
    expect(has(r, 'Coil + barrel fluid volume')).toBe(false);
  });

  it('names the equipment head while it is still the default', () => {
    const r = reviewGlycolInputs({ componentHeadFt: DEFAULT_COMPONENT_HEAD_FT, coilGal: 1, fixtures: 1, btuh: 1, deltaT: 1 });
    expect(sev(r, 'Equipment head')).toBe('verify');
  });

  it('drops it once a submittal figure replaces the default', () => {
    const r = reviewGlycolInputs({ componentHeadFt: 41, coilGal: 1, fixtures: 1, btuh: 1, deltaT: 1 });
    expect(has(r, 'Equipment head')).toBe(false);
  });

  it('does not ask a water loop for a chiller-side head at all', () => {
    const r = reviewGlycolInputs({ loopType: 'water', componentHeadFt: DEFAULT_COMPONENT_HEAD_FT, coilGal: 1, fixtures: 1, btuh: 1, deltaT: 1 });
    expect(has(r, 'Equipment head')).toBe(false);
  });
});

describe('what the spec states and the app must not invent', () => {
  it('blocks without a load, and without a ΔT once a load exists', () => {
    expect(sev(reviewGlycolInputs({ coilGal: 1, fixtures: 1 }), 'No load entered')).toBe('blocker');
    expect(sev(reviewGlycolInputs({ coilGal: 1, fixtures: 1, btuh: 900000 }), 'No ΔT entered')).toBe('blocker');
  });

  it('does not nag for a ΔT before there is a load to apply it to', () => {
    expect(has(reviewGlycolInputs({ coilGal: 1, fixtures: 1 }), 'No ΔT')).toBe(false);
  });

  it('blocks a mix that will not reach the temperature it has to', () => {
    const r = reviewGlycolInputs({ pct: 20, protectTo: 0, mix: checkMix(20, 0) });
    expect(sev(r, 'does not reach')).toBe('blocker');
  });

  it('flags over-mixing too, since it costs twice', () => {
    const r = reviewGlycolInputs({ pct: 50, protectTo: 15, mix: checkMix(50, 15) });
    expect(sev(r, 'richer than the target needs')).toBe('verify');
  });

  it('says nothing about a mix that lands sensibly', () => {
    const r = reviewGlycolInputs({ pct: 32, protectTo: 15, mix: checkMix(32, 15) });
    expect(has(r, 'does not reach')).toBe(false);
    expect(has(r, 'richer than')).toBe(false);
  });
});

describe('the hydraulic traps', () => {
  it('blocks on a main outside the velocity band, before the bid rather than after', () => {
    const r = reviewGlycolInputs({ velocityVerdict: { ok: false, why: 'above 8 ft/s — erosion and noise; size up' } });
    expect(sev(r, 'velocity is outside')).toBe('blocker');
    expect(r.find(i => i.label.includes('velocity')).detail).toMatch(/BEFORE the bid/);
  });

  it('catches total pipe fed in where the critical circuit belongs', () => {
    // The mistake that sizes a 20 HP motor for a 7.5 HP job.
    const r = reviewGlycolInputs({ longestPathFt: 2800, runFt: 2800 });
    expect(sev(r, 'Longest path')).toBe('verify');
  });

  it('leaves a sane critical circuit alone', () => {
    expect(has(reviewGlycolInputs({ longestPathFt: 600, runFt: 2800 }), 'Longest path')).toBe(false);
  });
});

describe('honesty about the prices', () => {
  it('says the fluid, insulation and valve numbers are not quotes', () => {
    expect(src(reviewGlycolInputs({}), 'placeholders')).toBe('placeholder');
  });

  it('credits the one number that IS the estimator s', () => {
    expect(src(reviewGlycolInputs({}), 'scaled off your own quote')).toBe('yours');
  });

  it('says once that volume, freeze point and flow are computed', () => {
    expect(src(reviewGlycolInputs({}), 'computed, not guessed')).toBe('physics');
  });
});

describe('reviewSummary', () => {
  const full = { coilGal: 120, fixtures: 34, btuh: 900000, deltaT: 8, componentHeadFt: 41, pct: 32, protectTo: 15, mix: checkMix(32, 15) };

  it('leads with blockers when the bid is missing numbers', () => {
    expect(reviewSummary(reviewGlycolInputs({})).tone).toBe('blocker');
  });

  it('falls back to verify once nothing is missing', () => {
    expect(reviewSummary(reviewGlycolInputs(full)).tone).toBe('verify');
  });

  it('never claims all-clear while a placeholder price is in the bid', () => {
    // Prices are always a placeholder on a chilled loop, so 'ok' should not
    // appear and pretend the number is quoted.
    expect(reviewSummary(reviewGlycolInputs(full)).tone).not.toBe('ok');
  });
});
