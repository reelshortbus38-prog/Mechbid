import { describe, it, expect } from 'vitest';
import { hpPipeRate, hpPipeNote, isHighPressureSystem, DEFAULT_HP_PIPE_MULTIPLIER } from './co2Pipe.js';

// The app already switched the LABEL to K65 when a job is set to CO₂, and added
// the high-pressure fittings line. It kept pricing the pipe at the ACR copper
// rate — so a transcritical job was a standard job wearing a different name.

describe('hpPipeRate', () => {
  it('leaves an HFC job exactly as it was', () => {
    expect(hpPipeRate(10.5, 'HFC')).toBe(10.5);
    expect(hpPipeRate(10.5, undefined)).toBe(10.5);
    expect(hpPipeRate(10.5, '')).toBe(10.5);
  });

  it('applies the premium on a transcritical job', () => {
    expect(hpPipeRate(10.5, 'CO2')).toBe(10.5 * DEFAULT_HP_PIPE_MULTIPLIER);
    expect(hpPipeRate(4.7, 'CO2', 2.4)).toBeCloseTo(11.28, 2);
  });

  it('rides on the estimator s tuned rate rather than a second absolute price', () => {
    // Tune ACR up and K65 follows, which is the point of a multiplier: the
    // alloy tracks the copper market plus a distribution premium.
    expect(hpPipeRate(20, 'CO2', 2)).toBe(2 * hpPipeRate(10, 'CO2', 2));
  });

  it('never zeroes the pipe on a bad multiplier', () => {
    // The failure this file exists to fix, in the other direction: a blank or
    // nonsense premium must fall back to the real rate, not to nothing.
    for (const m of [0, -1, NaN, null, '']) {
      expect(hpPipeRate(10.5, 'CO2', m), String(m)).toBe(10.5);
    }
  });

  it('treats an omitted multiplier as "use the default", not as a bad one', () => {
    expect(hpPipeRate(10.5, 'CO2', undefined)).toBe(10.5 * DEFAULT_HP_PIPE_MULTIPLIER);
  });

  it('handles a rate that was never set', () => {
    expect(hpPipeRate(0, 'CO2')).toBe(0);
    expect(hpPipeRate(undefined, 'CO2')).toBe(0);
  });
});

describe('hpPipeNote', () => {
  it('says nothing on a job that is not high pressure', () => {
    expect(hpPipeNote('HFC')).toBe('');
  });

  it('explains the doubled rate, so it is never a mystery', () => {
    const n = hpPipeNote('CO2', 2);
    expect(n).toMatch(/2× the ACR copper rate/);
    expect(n).toMatch(/PLACEHOLDER/);
  });

  it('states the two things that get mis-estimated', () => {
    const n = hpPipeNote('CO2');
    // Standing pressure is why suction lines get K65 too — rating only the
    // transcritical side under-buys most of the footage.
    expect(n).toMatch(/standing pressure across the whole system/i);
    // K65 is brazed. Pricing the job as high-pressure welding prices brazing
    // labor as pipefitting and lands nowhere near the real number.
    expect(n).toMatch(/BRAZED/);
    expect(n).toMatch(/not welding/);
  });
});

describe('isHighPressureSystem', () => {
  it('is true only for transcritical CO₂', () => {
    expect(isHighPressureSystem('CO2')).toBe(true);
    expect(isHighPressureSystem('HFC')).toBe(false);
    expect(isHighPressureSystem(null)).toBe(false);
  });
});
