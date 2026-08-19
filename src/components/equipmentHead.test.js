import { describe, it, expect } from 'vitest';
import {
  SERIES, BRANCH, COMPONENT_TYPES, componentType, positionOf, seedComponents, newComponent,
  feetOfHead, flowCorrect, fluidCorrect, resolveComponent, equipmentHead, naiveTotalFt,
  equipmentHeadSanity, equipmentHeadNote, FT_PER_PSI_WATER,
} from './equipmentHead.js';
import { specificGravity, viscosityFactor, pumpHorsepower } from './glycolHydraulics.js';

const sub = (key, value, extra = {}) => ({ ...newComponent(key), value, fromSubmittal: true, ...extra });

describe('unit conversion', () => {
  it('leaves feet alone', () => {
    expect(feetOfHead(8, 'ft', 35)).toBe(8);
  });

  it('converts psi using the density of the actual fluid, not water', () => {
    const glycol = feetOfHead(10, 'psi', 35);
    const water = feetOfHead(10, 'psi', 0);
    expect(water).toBeCloseTo(10 * FT_PER_PSI_WATER, 4);
    // Denser fluid, same pressure, SHORTER column.
    expect(glycol).toBeLessThan(water);
    expect(glycol).toBeCloseTo((10 * FT_PER_PSI_WATER) / specificGravity(35), 4);
  });

  it('converts kPa', () => {
    expect(feetOfHead(100, 'kpa', 0)).toBeCloseTo(33.4552, 3);
  });

  it('returns null for a unit it does not know rather than guessing', () => {
    expect(feetOfHead(10, 'bar')).toBeNull();
    expect(feetOfHead(10, 'inWC')).toBeNull();
  });

  it('treats a blank value as 0 ft, so the row stays visible instead of vanishing', () => {
    expect(feetOfHead('', 'ft')).toBe(0);
    expect(feetOfHead(null, 'psi')).toBe(0);
  });

  it('flags a zero row rather than letting it pass silently', () => {
    const parts = [sub('chillerBarrel', 15), sub('caseCoil', '')];
    const hit = equipmentHeadSanity(parts, equipmentHead(parts, {}), {}).find(x => /sitting at zero/.test(x.label));
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe('verify');
  });
});

describe('flow correction', () => {
  it('scales with the square of flow', () => {
    // 8 ft at 20 GPM, run at 25 GPM → 8 × 1.25² = 12.5
    expect(flowCorrect(8, 20, 25)).toBeCloseTo(12.5, 4);
  });

  it('is a reduction when running under the rated flow', () => {
    expect(flowCorrect(8, 20, 10)).toBeCloseTo(2, 4);
  });

  it('leaves the figure alone when the rated flow was never noted', () => {
    // Correcting against an unknown baseline is worse than not correcting.
    expect(flowCorrect(8, 0, 25)).toBe(8);
    expect(flowCorrect(8, 20, 0)).toBe(8);
  });
});

describe('fluid correction', () => {
  it('raises a water-published drop for a glycol loop', () => {
    expect(fluidCorrect(10, 'water', 35)).toBeCloseTo(10 * viscosityFactor(35), 4);
    expect(fluidCorrect(10, 'water', 35)).toBeGreaterThan(10);
  });

  it('leaves a drop already measured on glycol alone', () => {
    expect(fluidCorrect(10, 'glycol', 35)).toBe(10);
  });

  it('is a no-op on plain water', () => {
    expect(fluidCorrect(10, 'water', 0)).toBeCloseTo(10, 6);
  });
});

describe('series vs branch — the whole point of the module', () => {
  it('classifies the catalogue consistently', () => {
    expect(positionOf('chillerBarrel')).toBe(SERIES);
    expect(positionOf('caseCoil')).toBe(BRANCH);
    for (const t of COMPONENT_TYPES) expect([SERIES, BRANCH]).toContain(t.position);
  });

  it('does NOT multiply the branch by the fixture count', () => {
    const parts = [sub('chillerBarrel', 15), sub('caseCoil', 8), sub('circuitSetter', 5)];
    const r = equipmentHead(parts, { gpm: 200, fixtures: 30, pct: 0 });
    expect(r.seriesFt).toBeCloseTo(15, 1);
    expect(r.branchFt).toBeCloseTo(13, 1);
    expect(r.totalFt).toBeCloseTo(28, 1);
  });

  it('shows what the naive addition would have cost', () => {
    const parts = [sub('chillerBarrel', 15), sub('caseCoil', 8), sub('circuitSetter', 5)];
    const r = equipmentHead(parts, { gpm: 200, fixtures: 30, pct: 0 });
    // 15 + 13×30 = 405 ft, against the real 28.
    expect(naiveTotalFt(r, 30)).toBeCloseTo(405, 1);
    expect(naiveTotalFt(r, 1)).toBeNull();
  });

  it('the naive total sizes a wildly bigger motor — this is the bug being prevented', () => {
    const parts = [sub('chillerBarrel', 15), sub('caseCoil', 8), sub('circuitSetter', 5)];
    const r = equipmentHead(parts, { gpm: 200, fixtures: 30, pct: 0 });
    const right = pumpHorsepower(200, r.totalFt + 30, { pct: 35 });
    const wrong = pumpHorsepower(200, naiveTotalFt(r, 30) + 30, { pct: 35 });
    expect(wrong.motorHp).toBeGreaterThan(right.motorHp * 4);
  });

  it('a branch component is corrected on ITS share of the flow, not the loop total', () => {
    // Rated 6 GPM; loop is 180 GPM over 30 cases → 6 GPM per branch. No change.
    const parts = [sub('caseCoil', 8, { ratedGpm: 6 })];
    const r = equipmentHead(parts, { gpm: 180, fixtures: 30, pct: 0 });
    expect(r.branchFt).toBeCloseTo(8, 1);
    // Had it used the loop's 180 GPM it would be 8 × 30² = 7200 ft.
    expect(r.branchFt).toBeLessThan(20);
  });
});

describe('resolveComponent explains itself', () => {
  it('records every correction it applied', () => {
    const c = sub('caseCoil', 4, { unit: 'psi', ratedGpm: 5, ratedOn: 'water' });
    const r = resolveComponent(c, { gpm: 180, branchGpm: 6, pct: 35 });
    expect(r.corrections.length).toBe(3);
    expect(r.corrections.join(' ')).toMatch(/psi/);
    expect(r.corrections.join(' ')).toMatch(/GPM/);
    expect(r.corrections.join(' ')).toMatch(/water/);
  });

  it('records nothing when nothing was corrected', () => {
    const c = sub('chillerBarrel', 15, { ratedOn: 'glycol' });
    const r = resolveComponent(c, { gpm: 180, branchGpm: 6, pct: 35 });
    expect(r.corrections).toEqual([]);
    expect(r.ft).toBe(15);
  });

  it('tags basis so a placeholder never passes for a read number', () => {
    expect(resolveComponent(newComponent('chillerBarrel'), {}).basis).toBe('typical');
    expect(resolveComponent(sub('chillerBarrel', 15), {}).basis).toBe('submittal');
  });
});

describe('seeds', () => {
  it('seeds a glycol loop with a barrel and a water loop with a fluid cooler', () => {
    expect(seedComponents('chilled').map(c => c.key)).toContain('chillerBarrel');
    expect(seedComponents('water').map(c => c.key)).toContain('fluidCooler');
    expect(seedComponents('water').map(c => c.key)).not.toContain('chillerBarrel');
  });

  it('seeds no branch items — which case is worst is a judgement, not a default', () => {
    for (const c of seedComponents('chilled')) expect(positionOf(c.key)).toBe(SERIES);
  });

  it('gives every seeded component a distinct id', () => {
    const ids = [...seedComponents('chilled'), ...seedComponents('water')].map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('starts every component as not-from-submittal', () => {
    for (const c of seedComponents('chilled')) expect(c.fromSubmittal).toBe(false);
  });

  it('seeds each component at its catalogue typical', () => {
    for (const c of seedComponents('chilled')) expect(c.value).toBe(componentType(c.key).typicalFt);
  });
});

describe('sanity', () => {
  it('blocks on an empty list', () => {
    const s = equipmentHeadSanity([]);
    expect(s[0].severity).toBe('blocker');
  });

  it('blocks when more than one coil is entered', () => {
    const parts = [sub('chillerBarrel', 15), sub('caseCoil', 8), sub('walkinCoil', 10)];
    const hit = equipmentHeadSanity(parts, equipmentHead(parts, {}), { fixtures: 30 })
      .find(x => /coils entered/.test(x.label));
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe('blocker');
  });

  it('does not complain about a single coil', () => {
    const parts = [sub('chillerBarrel', 15), sub('caseCoil', 8)];
    const hit = equipmentHeadSanity(parts, equipmentHead(parts, {}), { fixtures: 30 })
      .find(x => /coils entered/.test(x.label));
    expect(hit).toBeUndefined();
  });

  it('flags components still on typical numbers', () => {
    const parts = [newComponent('chillerBarrel'), sub('mainStrainer', 5)];
    const hit = equipmentHeadSanity(parts, equipmentHead(parts, {}), {}).find(x => /trade-typical/.test(x.label));
    expect(hit.severity).toBe('verify');
    expect(hit.label).toMatch(/1 of 2/);
  });

  it('goes quiet on typicals once every figure is off a submittal', () => {
    const parts = [sub('chillerBarrel', 15), sub('mainStrainer', 5)];
    const hit = equipmentHeadSanity(parts, equipmentHead(parts, {}), {}).find(x => /trade-typical/.test(x.label));
    expect(hit).toBeUndefined();
  });

  it('notes a branch that outweighs the machine room', () => {
    const parts = [sub('chillerBarrel', 5), sub('caseCoil', 20)];
    const hit = equipmentHeadSanity(parts, equipmentHead(parts, { pct: 0 }), {})
      .find(x => /outweighs/.test(x.label));
    expect(hit).toBeTruthy();
  });
});

describe('note', () => {
  it('reports the split and the provenance count', () => {
    const parts = [sub('chillerBarrel', 15), newComponent('caseCoil')];
    const n = equipmentHeadNote(equipmentHead(parts, { pct: 0 }));
    expect(n).toMatch(/series/);
    expect(n).toMatch(/worst branch/);
    expect(n).toMatch(/1 of 2 from submittals/);
  });

  it('is empty with nothing entered', () => {
    expect(equipmentHeadNote(equipmentHead([], {}))).toBe('');
  });
});
