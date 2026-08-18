import { describe, it, expect } from 'vitest';
import {
  PG_FREEZE_F, PIPE_GAL_FT, pgFreezePoint, checkMix,
  systemVolumeGal, glycolCharge, glycolMaterialLines,
} from './glycolSystem.js';

const find = (lines, key) => lines.find(l => l.key === key);

describe('freeze protection', () => {
  it('reads the published points straight off the table', () => {
    expect(pgFreezePoint(30)).toBe(PG_FREEZE_F[30]);
    expect(pgFreezePoint(35)).toBe(PG_FREEZE_F[35]);
  });

  it('interpolates between them', () => {
    // 32% sits between the 30% and 35% rows.
    const f = pgFreezePoint(32);
    expect(f).toBeLessThan(PG_FREEZE_F[30]);
    expect(f).toBeGreaterThan(PG_FREEZE_F[35]);
  });

  it('does not extrapolate past the ends of the table', () => {
    expect(pgFreezePoint(10)).toBe(PG_FREEZE_F[20]);
    expect(pgFreezePoint(80)).toBe(PG_FREEZE_F[50]);
    expect(pgFreezePoint(0)).toBeNull();
  });
});

describe('checkMix — concentration is a spec, not a preference', () => {
  it('confirms the project spec clears its own stated target', () => {
    // The scope: "30% to 35% ... to prevent freezing down to roughly 15°F".
    for (const p of [30, 32, 35]) {
      const c = checkMix(p, 15);
      expect(c.ok, `${p}%`).toBe(true);
      expect(c.margin, `${p}%`).toBeGreaterThan(0);
    }
  });

  it('catches a mix that is short of the target', () => {
    const c = checkMix(20, 0);
    expect(c.ok).toBe(false);
    expect(c.margin).toBeLessThan(0);
  });

  it('says nothing useful without both numbers', () => {
    expect(checkMix(30, null)).toBeNull();
    expect(checkMix(0, 15)).toBeNull();
  });
});

describe('system volume', () => {
  it('is geometry, so it matches the published gallons per 100 ft', () => {
    // Type L copper: 3/4" holds 2.51 gal per 100 ft.
    expect(systemVolumeGal([{ dia: 0.75, ft: 100 }]).pipeGal).toBeCloseTo(2.5, 1);
    expect(systemVolumeGal([{ dia: 2, ft: 100 }]).pipeGal).toBeCloseTo(16.1, 1);
  });

  it('adds what the coils and the tank hold, since the pipe is not the system', () => {
    const v = systemVolumeGal([{ dia: 2, ft: 100 }], { coilGal: 120, tankGal: 40 });
    expect(v.totalGal).toBeCloseTo(16.1 + 160, 1);
  });

  it('knows PVC holds a little less than copper at the same nominal size', () => {
    expect(PIPE_GAL_FT.pvc80[2]).toBeLessThan(PIPE_GAL_FT.copper[2]);
  });

  it('is zero for a size it has no entry for, rather than guessing', () => {
    expect(systemVolumeGal([{ dia: 10, ft: 500 }]).pipeGal).toBe(0);
  });
});

describe('the charge is two buys, not one', () => {
  it('splits concentrate from the water it gets blended with', () => {
    // The spec blends pure PG with demineralized water on site.
    const c = glycolCharge(1000, 35, { overfillPct: 0 });
    expect(c.concentrateGal).toBe(350);
    expect(c.waterGal).toBe(650);
  });

  it('carries an overfill allowance for flush and fill losses', () => {
    const c = glycolCharge(1000, 35);
    expect(c.fillGal).toBeCloseTo(1100, 0);
    expect(c.concentrateGal).toBeGreaterThan(350);
  });
});

describe('the material list a secondary loop actually needs', () => {
  const runs = [{ dia: 3, ft: 400 }, { dia: 2, ft: 600 }, { dia: 0.75, ft: 900 }];
  const lines = glycolMaterialLines({ runs, material: 'copper', pct: 32, coilGal: 120, tankGal: 40, fixtures: 34 });

  it('carries the fluid — the line a copper takeoff has nowhere to put', () => {
    expect(find(lines, 'pg').unit).toBe('gal');
    expect(find(lines, 'pg').qty).toBeGreaterThan(100);
    expect(find(lines, 'diwater').qty).toBeGreaterThan(find(lines, 'pg').qty);
  });

  it('insulates every foot of pipe, supply and return', () => {
    // The spec is explicit, and a sweating line over open merchandise fails the
    // job however well the loop performs.
    const insulated = lines.filter(l => l.key.startsWith('insul-'))
      .reduce((s, l) => s + l.qty, 0);
    expect(insulated).toBe(400 + 600 + 900);
  });

  it('puts a full valve set on every case', () => {
    for (const k of ['balvalve', 'setter', 'solenoid']) expect(find(lines, k).qty, k).toBe(34);
  });

  it('leaves copper unpriced here so the shared table owns that number', () => {
    // One price for copper across the whole app — the one scaled off the
    // estimator's own quote — rather than a second that could drift from it.
    const pipe = lines.find(l => l.key.startsWith('pipe-copper-'));
    expect(pipe.defaultPrice).toBe(0);
    expect(pipe.priceFromCopperTable).toBeGreaterThan(0);
  });

  it('prices PVC itself, since the copper table does not cover it', () => {
    const pvc = glycolMaterialLines({ runs, material: 'pvc80' }).find(l => l.key.startsWith('pipe-pvc80-'));
    expect(pvc.defaultPrice).toBeGreaterThan(0);
    expect(pvc.priceFromCopperTable).toBeNull();
  });

  it('adds the loop specialties once, not once per size', () => {
    for (const k of ['airsep', 'exptank', 'feed']) expect(find(lines, k).qty, k).toBe(1);
  });

  it('produces nothing from nothing', () => {
    expect(glycolMaterialLines({})).toEqual([]);
    expect(glycolMaterialLines({ runs: [{ dia: 2, ft: 0 }] })).toEqual([]);
  });
});

// ── AMBIENT WATER LOOP ───────────────────────────────────────────────────────
// Self-contained cases with their own condensing units, on a loop that rejects
// heat to a fluid cooler. It LOOKS like a glycol loop — central plant, header
// out, header back, drops to cases — and it is priced very differently.

describe('a water loop is not a chilled loop', () => {
  const runs = [{ dia: 3, ft: 400 }, { dia: 2, ft: 600 }, { dia: 0.75, ft: 900 }];
  const water = glycolMaterialLines({ runs, loopType: 'water', freezeExposedFt: 120, fixtures: 34, pct: 32 });
  const chilled = glycolMaterialLines({ runs, loopType: 'chilled', fixtures: 34, pct: 32, coilGal: 120 });

  it('does not insulate a loop that runs at ambient', () => {
    // The single largest difference between the two: 1,900 ft of closed-cell a
    // water loop does not owe.
    expect(water.filter(l => l.key.startsWith('insul-'))).toEqual([]);
    expect(chilled.filter(l => l.key.startsWith('insul-')).length).toBeGreaterThan(0);
  });

  it('charges glycol only for the freeze-exposed run, not the whole system', () => {
    const w = water.find(l => l.key === 'pg');
    const c = chilled.find(l => l.key === 'pg');
    expect(w.qty).toBeGreaterThan(0);
    expect(w.qty).toBeLessThan(c.qty / 3);
  });

  it('swaps the chiller side for a fluid cooler, and leaves it to a quote', () => {
    const fc = water.find(l => l.key === 'fluidcooler');
    expect(fc).toBeTruthy();
    expect(fc.defaultPrice).toBe(0);
    expect(fc.desc).toMatch(/VENDOR QUOTE/);
    expect(chilled.find(l => l.key === 'fluidcooler')).toBeUndefined();
  });

  it('carries no glycol at all when nothing is freeze-exposed', () => {
    const dry = glycolMaterialLines({ runs, loopType: 'water', freezeExposedFt: 0 });
    expect(dry.find(l => l.key === 'pg')).toBeUndefined();
  });
});
