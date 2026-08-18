import { describe, it, expect } from 'vitest';
import {
  hydronicValveLines, countHydronicEquipment,
  BALL_VALVE, BUTTERFLY_VALVE, HOSE_KIT, CONTROL_VALVE, PT_PORT,
} from './hydronicValves.js';

const find = (lines, key) => lines.find(l => l.key === key);

describe('countHydronicEquipment', () => {
  it('counts what the plans already gave us', () => {
    // The live job: 26 fin-tube, 10 circulators, plus a unit heater and a CUH.
    const eq = [
      ...Array(26).fill({ type: 'Baseboard / Fin-Tube Heater' }),
      ...Array(10).fill({ type: 'Pump — Circulator / Inline' }),
      { type: 'Unit Heater' }, { type: 'Cabinet Unit Heater (CUH)' },
    ];
    expect(countHydronicEquipment(eq)).toEqual({ terminals: 28, pumps: 10 });
  });

  it('does not count a rooftop unit or a grille as a terminal', () => {
    expect(countHydronicEquipment([{ type: 'Rooftop Unit (RTU)' }, { type: 'Exhaust Fan' }]))
      .toEqual({ terminals: 0, pumps: 0 });
  });

  it('counts a pump as a pump even though it is not a terminal', () => {
    expect(countHydronicEquipment([{ type: 'Chilled Water Pump' }])).toEqual({ terminals: 0, pumps: 1 });
  });
});

describe('the terminal connection package', () => {
  it('is one hose kit per unit, not a pile of loose valves', () => {
    const lines = hydronicValveLines({ terminals: 28, terminalSize: 0.75, terminalMode: 'hosekit' });
    expect(find(lines, 'hosekit')).toMatchObject({ qty: 28, defaultPrice: HOSE_KIT[0.75] });
    // The kit CONTAINS the ball and balancing valves — buying both would be a
    // double count, which is the whole reason this is a mode and not an add-on.
    expect(find(lines, 'termball')).toBeUndefined();
    expect(find(lines, 'termbal')).toBeUndefined();
  });

  it('breaks out into loose valves when a shop buys them that way', () => {
    const lines = hydronicValveLines({ terminals: 28, terminalSize: 0.75, terminalMode: 'valves' });
    expect(find(lines, 'hosekit')).toBeUndefined();
    expect(find(lines, 'termball').qty).toBe(56);   // supply and return
    expect(find(lines, 'termbal').qty).toBe(28);
    expect(find(lines, 'termpt')).toMatchObject({ qty: 56, defaultPrice: PT_PORT });
  });
});

describe('control valves are a scope question, not a quantity question', () => {
  const lines = m => hydronicValveLines({ terminals: 28, terminalSize: 0.75, controlValves: m });

  it('carries the material when we furnish them', () => {
    expect(find(lines('ours'), 'controlvalve')).toMatchObject({ qty: 28, defaultPrice: CONTROL_VALVE[0.75] });
  });

  it('keeps the line at zero material when controls furnishes them', () => {
    // The sheet says "THERMOSTATS/SENSORS PROVIDED BY DIV 230900". The install
    // is still ours, so the line stays — priced at nothing, visible to labor.
    const cv = find(lines('byOthers'), 'controlvalve');
    expect(cv.qty).toBe(28);
    expect(cv.defaultPrice).toBe(0);
    expect(cv.desc).toMatch(/FURNISHED BY CONTROLS/);
  });

  it('drops the line entirely when it is not our scope at all', () => {
    expect(find(lines('none'), 'controlvalve')).toBeUndefined();
  });
});

describe('pumps', () => {
  it('gets a strainer, a check and two isolation valves each', () => {
    const lines = hydronicValveLines({ pumps: 10, pumpSize: 1.5 });
    expect(find(lines, 'pumpstrainer').qty).toBe(10);
    expect(find(lines, 'pumpcheck').qty).toBe(10);
    expect(find(lines, 'pumpiso').qty).toBe(20);
  });
});

describe('branch isolation follows the pipe, including where copper stops', () => {
  it('uses ball valves in copper sizes and butterfly above', () => {
    const lines = hydronicValveLines({ branches: [{ dia: 2, count: 8 }, { dia: 6, count: 2 }] });
    expect(find(lines, 'branch-2')).toMatchObject({ qty: 8, defaultPrice: BALL_VALVE[2] });
    expect(find(lines, 'branch-6')).toMatchObject({ qty: 2, defaultPrice: BUTTERFLY_VALVE[6] });
    expect(find(lines, 'branch-6').desc).toMatch(/Butterfly/);
  });

  it('ignores a size with no count against it', () => {
    expect(hydronicValveLines({ branches: [{ dia: 2, count: 0 }] })).toEqual([]);
  });
});

describe('the whole takeoff', () => {
  it('produces nothing at all from nothing', () => {
    expect(hydronicValveLines({})).toEqual([]);
  });

  it('adds up to a real number for the live job', () => {
    const lines = hydronicValveLines({
      terminals: 28, pumps: 10, terminalSize: 0.75, pumpSize: 1.5,
      terminalMode: 'hosekit', controlValves: 'byOthers',
      branches: [{ dia: 2, count: 8 }, { dia: 4, count: 2 }, { dia: 6, count: 2 }],
      airVents: 12, drains: 8,
    });
    const total = lines.reduce((s, l) => s + l.qty * l.defaultPrice, 0);
    expect(total).toBeGreaterThan(10000);
    expect(total).toBeLessThan(15000);
    // And every one of those is a line the estimator can see and change.
    expect(lines.every(l => l.qty > 0 && l.desc && l.unit)).toBe(true);
  });
});
