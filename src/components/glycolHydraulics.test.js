import { describe, it, expect } from 'vitest';
import {
  FLOW_CONSTANT, NEMA_HP, VELOCITY_MIN, VELOCITY_MAX,
  flowConstant, glycolGpm, waterGpm, velocityFtSec, velocityVerdict,
  pumpHead, pumpHorsepower, glycolHydraulics,
} from './glycolHydraulics.js';

// The familiar rule is GPM = BTU/hr ÷ (500 × ΔT), and that 500 is a WATER
// constant: 60 min × 8.34 lb/gal × 1.00 Btu/lb·°F. Glycol is denser but holds
// less heat per pound, and the second effect wins — so the same load needs MORE
// flow, which compounds into pipe size and pump horsepower.

describe('glycol needs more flow than water for the same load', () => {
  it('reproduces the water rule at zero percent', () => {
    expect(flowConstant(0)).toBe(500);
    expect(glycolGpm(500000, 10, 0)).toBe(waterGpm(500000, 10));
  });

  it('needs more gallons a minute as the mix gets richer', () => {
    const at = p => glycolGpm(900000, 8, p);
    expect(at(35)).toBeGreaterThan(at(0));
    expect(at(50)).toBeGreaterThan(at(35));
  });

  it('puts the penalty at roughly 7% for the 35% the spec calls for', () => {
    const r = glycolHydraulics({ btuh: 900000, deltaT: 8, pct: 35 });
    expect(r.extraFlowPct).toBeGreaterThan(5);
    expect(r.extraFlowPct).toBeLessThan(10);
  });

  it('refuses to invent a flow without a ΔT', () => {
    // The skeleton this came from had no ΔT field at all. A GPM computed off an
    // assumed ΔT is worse than none, because it looks like an answer.
    expect(glycolGpm(900000, 0, 35)).toBeNull();
    expect(glycolGpm(900000, undefined, 35)).toBeNull();
    expect(glycolGpm(0, 8, 35)).toBeNull();
  });
});

describe('velocity is the check worth having', () => {
  it('flags a main the flow will erode', () => {
    // 241 gpm through a 3" line.
    const v = velocityFtSec(241.4, 3.062);
    expect(v).toBeGreaterThan(VELOCITY_MAX);
    expect(velocityVerdict(v).ok).toBe(false);
    expect(velocityVerdict(v).why).toMatch(/size up/);
  });

  it('passes the same flow once the main is sized up', () => {
    const v = velocityFtSec(241.4, 3.935);
    expect(velocityVerdict(v).ok).toBe(true);
  });

  it('flags a line too slow to sweep its own air', () => {
    const v = velocityFtSec(2, 3.062);
    expect(v).toBeLessThan(VELOCITY_MIN);
    expect(velocityVerdict(v).why).toMatch(/air will not sweep/);
  });

  it('says nothing without a size to check against', () => {
    expect(velocityFtSec(241, 0)).toBeNull();
    expect(velocityVerdict(null)).toBeNull();
  });
});

describe('head comes off the CRITICAL CIRCUIT, not the whole building', () => {
  it('grows with the longest path, not with total pipe', () => {
    const short = pumpHead(600, { componentHeadFt: 25 });
    const long = pumpHead(2800, { componentHeadFt: 25 });
    expect(long.totalFt).toBeGreaterThan(short.totalFt * 2);
  });

  it('carries fittings as developed length', () => {
    expect(pumpHead(600, { fittingsPct: 50 }).developedFt).toBe(900);
    expect(pumpHead(600, { fittingsPct: 0 }).developedFt).toBe(600);
  });

  it('costs more head on cold glycol than on water', () => {
    expect(pumpHead(600, { pct: 35 }).frictionFt).toBeGreaterThan(pumpHead(600, { pct: 0 }).frictionFt);
  });

  it('keeps component head separate, since no amount of pipe predicts it', () => {
    const h = pumpHead(600, { componentHeadFt: 25 });
    expect(h.componentFt).toBe(25);
    expect(h.totalFt).toBeCloseTo(h.frictionFt + 25, 1);
  });

  it('still returns a head when there is only equipment and no run', () => {
    expect(pumpHead(0, { componentHeadFt: 25 }).totalFt).toBe(25);
  });

  it('returns nothing when there is nothing to compute', () => {
    expect(pumpHead(0)).toBeNull();
  });
});

describe('horsepower lands on a motor you can actually buy', () => {
  it('rounds up to a NEMA size', () => {
    const hp = pumpHorsepower(241.4, 57.9, { pct: 35 });
    expect(NEMA_HP).toContain(hp.motorHp);
    expect(hp.motorHp).toBeGreaterThanOrEqual(hp.bhp);
  });

  it('sizes a store loop somewhere sane', () => {
    const hp = pumpHorsepower(241.4, 57.9, { pct: 35 });
    expect(hp.motorHp).toBeGreaterThanOrEqual(5);
    expect(hp.motorHp).toBeLessThanOrEqual(10);
  });

  it('needs more power on glycol than on water at the same duty', () => {
    expect(pumpHorsepower(240, 60, { pct: 35 }).bhp)
      .toBeGreaterThan(pumpHorsepower(240, 60, { pct: 0 }).bhp);
  });

  it('returns nothing rather than zero when it cannot compute', () => {
    expect(pumpHorsepower(0, 60)).toBeNull();
    expect(pumpHorsepower(240, 0)).toBeNull();
  });
});

describe('glycolHydraulics — the whole call', () => {
  const r = glycolHydraulics({
    btuh: 900000, deltaT: 8, pct: 35, longestPathFt: 600,
    idInches: 3.062, componentHeadFt: 25,
  });

  it('answers the two questions an estimator has to price', () => {
    expect(r.gpm).toBeGreaterThan(0);
    expect(r.hp.motorHp).toBeGreaterThan(0);
  });

  it('buys two pumps for a spec that calls for dual redundancy', () => {
    expect(r.pumpCount).toBe(2);
    expect(glycolHydraulics({ btuh: 900000, deltaT: 8, redundant: false }).pumpCount).toBe(1);
  });

  it('nulls what it cannot compute instead of zeroing it', () => {
    const empty = glycolHydraulics({});
    expect(empty.gpm).toBeNull();
    expect(empty.hp).toBeNull();
    expect(empty.velocity).toBeNull();
  });
});
