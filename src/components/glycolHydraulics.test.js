import { describe, it, expect } from 'vitest';
import {
  FLOW_CONSTANT, NEMA_HP, VELOCITY_MIN, VELOCITY_MAX,
  flowConstant, glycolGpm, waterGpm, velocityFtSec, velocityVerdict,
  pumpHead, pumpHorsepower, glycolHydraulics, psiToFt, checkDpAgainstBranch,
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

// ── VALIDATED AGAINST A REAL ENGINEERED SCHEDULE ─────────────────────────────
// Edmonds SD College Place, HYDRONIC PUMP SCHEDULE. Two selections made by the
// engineer of record, with the flow, head and pump efficiency they were made
// from. If Coldgauge cannot reproduce these, it is not ready to price a pump.
describe('against the Edmonds SD College Place pump schedule', () => {
  const SCHEDULE = [
    { mark: 'HWP-01', gpm: 276, ft: 83, eff: 0.78, pct: 0, hp: 10 },
    { mark: 'CWP-01', gpm: 455, ft: 125, eff: 0.75, pct: 20, hp: 25 },
  ];

  for (const r of SCHEDULE) {
    it(`${r.mark} — ${r.gpm} GPM @ ${r.ft} ft selects the scheduled ${r.hp} HP`, () => {
      const hp = pumpHorsepower(r.gpm, r.ft, { pct: r.pct, efficiency: r.eff });
      expect(hp.motorHp).toBe(r.hp);
    });

    it(`${r.mark} — the bare next-size answer is one frame light, which is the bug`, () => {
      const hp = pumpHorsepower(r.gpm, r.ft, { pct: r.pct, efficiency: r.eff });
      expect(hp.minMotorHp).toBeLessThan(r.hp);
      expect(NEMA_HP.indexOf(hp.motorHp) - NEMA_HP.indexOf(hp.minMotorHp)).toBe(1);
    });
  }

  it('the brake horsepower itself was already right — only the frame lookup was wrong', () => {
    expect(pumpHorsepower(276, 83, { pct: 0, efficiency: 0.78 }).bhp).toBeCloseTo(7.42, 2);
    expect(pumpHorsepower(455, 125, { pct: 20, efficiency: 0.75 }).bhp).toBeCloseTo(19.44, 2);
  });

  it('a zero margin reproduces the old bare-frame behaviour, for comparison', () => {
    const hp = pumpHorsepower(276, 83, { pct: 0, efficiency: 0.78, margin: 0 });
    expect(hp.motorHp).toBe(7.5);
    expect(hp.motorHp).toBe(hp.minMotorHp);
  });

  it('never selects below the design point, whatever the margin', () => {
    for (const m of [0, 0.15, 0.5]) {
      const hp = pumpHorsepower(455, 125, { pct: 20, efficiency: 0.75, margin: m });
      expect(hp.motorHp).toBeGreaterThanOrEqual(hp.bhp);
    }
  });

  it('reports the margin it used, so the number is not a black box', () => {
    expect(pumpHorsepower(276, 83, { pct: 0, efficiency: 0.78 }).marginPct).toBe(15);
  });
});

// ── THE REMOTE DP TERM, FOUND BY DECOMPOSING A REAL SELECTION ────────────────
// Edmonds SD College Place, sheet M10.06 — HYDRONIC WATER SYSTEM RISER DIAGRAM
// AND CONTROL SEQUENCE. HWP-01 is scheduled 276 GPM at 83 ft; the sequence sets
// "HW Differential Pressure STPT ... initially set from 8-12 PSI".
describe('maintained remote differential pressure', () => {
  it('converts a PSI setpoint to feet', () => {
    expect(psiToFt(8)).toBeCloseTo(18.5, 1);
    expect(psiToFt(12)).toBeCloseTo(27.7, 1);
    expect(psiToFt(0)).toBe(0);
    expect(psiToFt('')).toBe(0);
  });

  it('accounts for the gap between the old model and the scheduled 83 ft', () => {
    // Plant equipment off the schedules: air separator 3.0 + boiler 1.0 + say 1.
    const PLANT = 5;
    for (const psi of [8, 12]) {
      const withDp = pumpHead(0, { componentHeadFt: PLANT, remoteDpFt: psiToFt(psi) });
      const distribution = 83 - withDp.totalFt;
      // What is left over for distribution friction stays a sane number —
      // it does not go negative, and it does not swallow the whole 83 ft.
      expect(distribution).toBeGreaterThan(45);
      expect(distribution).toBeLessThan(65);
    }
  });

  it('omitting it selects one motor frame light — the actual consequence', () => {
    const PLANT = 5, FRICTION = 55;
    const withDp = PLANT + FRICTION + psiToFt(10);
    const withoutDp = PLANT + FRICTION;
    const right = pumpHorsepower(276, withDp, { pct: 0, efficiency: 0.78 });
    const wrong = pumpHorsepower(276, withoutDp, { pct: 0, efficiency: 0.78 });
    expect(right.motorHp).toBe(10);       // what the engineer scheduled
    expect(wrong.motorHp).toBe(7.5);      // what the app used to produce
  });

  it('adds into the head breakdown and is reported separately', () => {
    const h = pumpHead(600, { componentHeadFt: 5, remoteDpFt: 23 });
    expect(h.remoteDpFt).toBe(23);
    expect(h.componentFt).toBe(5);
    expect(h.totalFt).toBeCloseTo(h.frictionFt + 5 + 23, 1);
  });

  it('is enough on its own to produce a head — a short loop is still DP-controlled', () => {
    expect(pumpHead(0, { remoteDpFt: 23 }).totalFt).toBe(23);
  });

  it('still returns null when there is nothing at all', () => {
    expect(pumpHead(0, {})).toBeNull();
    expect(pumpHead(0, { remoteDpFt: 0, componentHeadFt: 0 })).toBeNull();
  });

  it('flows through glycolHydraulics', () => {
    const a = glycolHydraulics({ btuh: 900000, deltaT: 8, longestPathFt: 600, componentHeadFt: 5 });
    const b = glycolHydraulics({ btuh: 900000, deltaT: 8, longestPathFt: 600, componentHeadFt: 5, remoteDpFt: 23 });
    expect(b.head.totalFt).toBeCloseTo(a.head.totalFt + 23, 1);
    expect(b.hp.bhp).toBeGreaterThan(a.hp.bhp);
  });
});

describe('DP setpoint and itemised branch are the same quantity', () => {
  it('agrees when they describe the same worst branch', () => {
    // 10 PSI = 23.1 ft against an itemised coil 8 + CV 8 + setter 5 + strainer
    // 3 + isolation 1.5 = 25.5 ft.
    const c = checkDpAgainstBranch(psiToFt(10), 25.5);
    expect(c.agree).toBe(true);
  });

  it('disagrees when one of them is plainly wrong', () => {
    expect(checkDpAgainstBranch(psiToFt(10), 3).agree).toBe(false);
    expect(checkDpAgainstBranch(psiToFt(2), 25.5).agree).toBe(false);
  });

  it('names the amount that would be counted twice', () => {
    const c = checkDpAgainstBranch(23.1, 25.5);
    expect(c.doubleCountFt).toBe(23.1);
  });

  it('says nothing when only one of them was supplied — the normal case', () => {
    expect(checkDpAgainstBranch(23, 0)).toBeNull();
    expect(checkDpAgainstBranch(0, 25)).toBeNull();
    expect(checkDpAgainstBranch(0, 0)).toBeNull();
  });
});
