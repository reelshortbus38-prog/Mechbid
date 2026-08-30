import { describe, it, expect } from 'vitest';
import {
  C_FACTOR, DEFAULT_FRICTION_TARGET, TYPE_L_ID, NOMINAL_SIZES, MIN_SIZE,
  frictionPer100, flowAtFriction, sizeForFlow, sizingTable, sizeMix, mixVsSingle,
  sizeLabel, sizingNote,
} from './hydronicSizing.js';
import { HOSE_KIT } from './hydronicValves.js';

// The HYDRONIC HOSE KIT PIPE SIZING SCHEDULE off the Edmonds SD College Place
// drawing. Band tops as printed.
const SCHEDULE = [
  { dia: 0.5, maxGpm: 0.9 },
  { dia: 0.75, maxGpm: 3.6 },
  { dia: 1, maxGpm: 5.7 },
  { dia: 1.25, maxGpm: 10.1 },
  { dia: 1.5, maxGpm: 16.1 },
  { dia: 2, maxGpm: 33.8 },
  { dia: 2.5, maxGpm: 60.8 },
  { dia: 3, maxGpm: 97.9 },
];

describe('Hazen-Williams', () => {
  it('rises steeply with flow — the square-ish law that makes sizing matter', () => {
    const a = frictionPer100(10, 1.025);
    const b = frictionPer100(20, 1.025);
    expect(b / a).toBeGreaterThan(3.4);
    expect(b / a).toBeLessThan(3.7);
  });

  it('falls hard with diameter — one size up is most of the problem solved', () => {
    expect(frictionPer100(10, 1.265)).toBeLessThan(frictionPer100(10, 1.025) / 2.5);
  });

  it('penalises steel against copper at the same size', () => {
    expect(frictionPer100(10, 1.025, 'steel')).toBeGreaterThan(frictionPer100(10, 1.025, 'copper'));
  });

  it('inverts cleanly', () => {
    const q = flowAtFriction(2.4, 1.985);
    expect(frictionPer100(q, 1.985)).toBeCloseTo(2.4, 6);
  });

  it('returns null rather than a number it cannot compute', () => {
    expect(frictionPer100(0, 1)).toBeNull();
    expect(frictionPer100(10, 0)).toBeNull();
    expect(flowAtFriction(0, 1)).toBeNull();
  });
});

// ── THE VALIDATION THAT DECIDED THIS WAS WORTH BUILDING ──────────────────────
describe('against the Edmonds SD College Place hose kit sizing schedule', () => {
  it('the schedule is constant-FRICTION from 1" up — 2.2 to 2.5 ft per 100', () => {
    const rates = SCHEDULE.filter(r => r.dia >= 1)
      .map(r => frictionPer100(r.maxGpm, TYPE_L_ID[r.dia]));
    for (const h of rates) {
      expect(h).toBeGreaterThan(2.1);
      expect(h).toBeLessThan(2.6);
    }
  });

  it('and is NOT constant-velocity — which is what makes it a friction rule', () => {
    const vel = r => (r.maxGpm * 0.133681 / 60) / (Math.PI * Math.pow(TYPE_L_ID[r.dia] / 24, 2));
    const small = vel(SCHEDULE.find(r => r.dia === 1));
    const large = vel(SCHEDULE.find(r => r.dia === 3));
    expect(large / small).toBeGreaterThan(1.9);
  });

  it('reproduces every band from 1" up within 6%', () => {
    for (const r of SCHEDULE.filter(x => x.dia >= 1)) {
      const ours = flowAtFriction(DEFAULT_FRICTION_TARGET, TYPE_L_ID[r.dia]);
      expect(Math.abs(ours - r.maxGpm) / r.maxGpm).toBeLessThan(0.06);
    }
  });

  it('picks the schedule\'s own size for a flow in the middle of each band', () => {
    // Mid-band flows, where neither rounding nor the boundary is in play.
    expect(sizeForFlow(8)).toBe(1.25);
    expect(sizeForFlow(13)).toBe(1.5);
    expect(sizeForFlow(25)).toBe(2);
    expect(sizeForFlow(45)).toBe(2.5);
    expect(sizeForFlow(80)).toBe(3);
  });

  it('DIVERGES at the two smallest sizes, and that is recorded rather than fudged', () => {
    // 1/2": the schedule stops at 0.9 GPM where friction alone allows ~1.1.
    // 3/4": the schedule allows 3.6 where friction alone gives ~3.0.
    // Practical minimums govern down here, in both directions.
    const half = flowAtFriction(DEFAULT_FRICTION_TARGET, TYPE_L_ID[0.5]);
    const threeQ = flowAtFriction(DEFAULT_FRICTION_TARGET, TYPE_L_ID[0.75]);
    expect(half).toBeGreaterThan(0.9);
    expect(threeQ).toBeLessThan(3.6);
  });
});

describe('sizeForFlow', () => {
  it('never exceeds the friction target WHERE FRICTION GOVERNS, 1" and up', () => {
    for (const q of [5, 7, 15, 30, 55, 90]) {
      const d = sizeForFlow(q);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(frictionPer100(q, TYPE_L_ID[d])).toBeLessThanOrEqual(DEFAULT_FRICTION_TARGET + 1e-9);
    }
  });

  it('DOES exceed it at 3/4", on purpose — convention governs there, not friction', () => {
    // 3.2 GPM in 3/4" is 2.75 ft/100 against a 2.4 target, and it is what the
    // plans draw. Short runs; friction is not what is being sized for.
    const d = sizeForFlow(3.2);
    expect(d).toBe(0.75);
    expect(frictionPer100(3.2, TYPE_L_ID[d])).toBeGreaterThan(DEFAULT_FRICTION_TARGET);
  });

  it('is monotonic — more flow never picks a smaller pipe', () => {
    let last = 0;
    for (let q = 1; q < 90; q += 1) {
      const d = sizeForFlow(q);
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
    }
  });

  it('honours a tighter friction target by sizing up', () => {
    expect(sizeForFlow(25, { target: 1.0 })).toBeGreaterThan(sizeForFlow(25, { target: 4.0 }));
  });

  it('sizes steel larger than copper where the roughness crosses a size boundary', () => {
    // Steel is rougher (C 120 against copper's 150) so it carries less at the
    // same bore and often needs the next size up. It does NOT always, and the
    // reason is worth knowing: schedule 40 has a bigger bore than Type L at the
    // same nominal size — 1/2" is 0.622" against 0.545" — so at the small end
    // the extra bore outweighs the roughness and steel carries MORE. These
    // three flows sit in the band where roughness wins.
    for (const q of [32, 90, 180]) {
      expect(sizeForFlow(q, { material: 'steel' }))
        .toBeGreaterThan(sizeForFlow(q, { material: 'copper' }));
    }
  });

  it('sizes the plant mains a real job actually runs', () => {
    // Edmonds College Place: HWP-01 at 276 GPM, CWP-01 at 455 GPM. The table
    // used to stop at 4" — about 195 GPM — so every main on that job got no
    // size at all.
    expect(sizeForFlow(276, { material: 'steel' })).toBe(5);
    expect(sizeForFlow(455, { material: 'steel' })).toBe(6);
  });

  it('never goes below the minimum practical connection', () => {
    expect(sizeForFlow(0.01)).toBe(MIN_SIZE);
  });

  it('returns null past the table rather than pretending the largest is enough', () => {
    // Extending the table to 8" did not change this: silence beyond the end is
    // the honest answer, and returning the biggest size would be a lie.
    expect(sizeForFlow(100000)).toBeNull();
  });

  it('returns null for no flow', () => {
    expect(sizeForFlow(0)).toBeNull();
    expect(sizeForFlow('')).toBeNull();
  });
});

describe('sizingTable', () => {
  it('produces contiguous bands — no flow falls between two sizes', () => {
    const rows = sizingTable();
    for (let i = 1; i < rows.length; i++) expect(rows[i].minGpm).toBe(rows[i - 1].maxGpm);
  });

  it('starts at zero and climbs', () => {
    const rows = sizingTable();
    expect(rows[0].minGpm).toBe(0);
    for (let i = 1; i < rows.length; i++) expect(rows[i].maxGpm).toBeGreaterThan(rows[i - 1].maxGpm);
  });

  it('labels sizes the way a drawing does', () => {
    expect(sizeLabel(0.75)).toBe('3/4"');
    expect(sizeLabel(1.25)).toBe('1-1/4"');
    expect(sizeLabel(2.5)).toBe('2-1/2"');
    expect(sizeLabel(3)).toBe('3"');
  });
});

describe('sizeMix — the takeoff shape', () => {
  const MIX = [{ gpm: 2, count: 8 }, { gpm: 4, count: 12 }, { gpm: 9, count: 6 }];

  it('folds a mix of flows into a count per size', () => {
    const m = sizeMix(MIX);
    expect(m.total).toBe(26);
    expect(m.sizes.map(s => s.dia)).toEqual([0.75, 1, 1.25]);
    expect(m.sizes.find(s => s.dia === 1).count).toBe(12);
  });

  it('accepts a bare list of flows too', () => {
    expect(sizeMix([2, 2, 9]).total).toBe(3);
  });

  it('names the size a hand-pick would most likely have landed on', () => {
    expect(sizeMix(MIX).dominant).toBe(1);
  });

  it('sets aside flows it cannot size instead of dropping them silently', () => {
    const m = sizeMix([{ gpm: 100000, count: 3 }, { gpm: 4, count: 1 }]);
    expect(m.unsized).toEqual([{ gpm: 100000, count: 3 }]);
    expect(m.total).toBe(1);
  });

  it('ignores zero-count rows', () => {
    expect(sizeMix([{ gpm: 4, count: 0 }]).total).toBe(0);
  });
});

describe('mixVsSingle — what hand-picking one size costs', () => {
  it('shows the gap against a real price table', () => {
    const m = sizeMix([{ gpm: 2, count: 8 }, { gpm: 4, count: 12 }, { gpm: 9, count: 6 }]);
    const cmp = mixVsSingle(m, HOSE_KIT, 0.75);
    // Sizing properly costs more than calling everything 3/4", because a third
    // of the job is genuinely larger than that.
    expect(cmp.sizedTotal).toBeGreaterThan(cmp.singleTotal);
    expect(cmp.deltaPct).toBeGreaterThan(0);
  });

  it('agrees exactly when every terminal really is one size', () => {
    const m = sizeMix([{ gpm: 4, count: 10 }]);
    const cmp = mixVsSingle(m, HOSE_KIT, 1);
    expect(cmp.sizedTotal).toBe(cmp.singleTotal);
    expect(cmp.deltaPct).toBe(0);
  });

  it('falls back to the dominant size when none is given', () => {
    const m = sizeMix([{ gpm: 4, count: 10 }, { gpm: 2, count: 1 }]);
    expect(mixVsSingle(m, HOSE_KIT).singleSize).toBe(1);
  });

  it('returns null with nothing to compare', () => {
    expect(mixVsSingle(sizeMix([]), HOSE_KIT, 1)).toBeNull();
    expect(mixVsSingle(null, HOSE_KIT, 1)).toBeNull();
  });
});

describe('note', () => {
  it('says what rule was applied and where it stops holding', () => {
    const n = sizingNote();
    expect(n).toMatch(/constant-friction/);
    expect(n).toMatch(/smallest sizes/);
  });
});

describe('hose kits cover the sizes the rule can produce', () => {
  it('every band up to 3" has a price', () => {
    for (const row of sizingTable()) {
      if (row.dia > 3) continue;
      expect(HOSE_KIT[row.dia]).toBeGreaterThan(0);
    }
  });

  it('prices climb with size', () => {
    const keys = Object.keys(HOSE_KIT).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < keys.length; i++) {
      expect(HOSE_KIT[keys[i]]).toBeGreaterThan(HOSE_KIT[keys[i - 1]]);
    }
  });
});

// ── THE POINT OF ALL THIS: DIFFERENT SIZES, DIFFERENT LINES ─────────────────
import { hydronicValveLines } from './hydronicValves.js';

describe('terminal mix drives the valve takeoff', () => {
  const MIX = [{ gpm: 2, count: 8 }, { gpm: 4, count: 12 }, { gpm: 9, count: 6 }];
  const mixed = sizeMix(MIX).sizes;

  it('emits a hose kit line per size instead of one for the job', () => {
    const lines = hydronicValveLines({ terminalMix: mixed, terminalMode: 'hosekit', controlValves: 'none' });
    expect(lines.filter(l => l.key.startsWith('hosekit')).length).toBe(3);
    expect(lines.reduce((s, l) => s + l.qty, 0)).toBe(26);
  });

  it('costs more than calling the whole job the smallest size', () => {
    const opts = { terminalMode: 'hosekit', controlValves: 'none' };
    const tot = ls => ls.reduce((s, l) => s + l.qty * l.defaultPrice, 0);
    const sized = tot(hydronicValveLines({ ...opts, terminalMix: mixed }));
    const flat = tot(hydronicValveLines({ ...opts, terminals: 26, terminalSize: 0.75 }));
    expect(sized).toBeGreaterThan(flat);
  });

  it('sizes the control valves the same way, not just the kits', () => {
    const lines = hydronicValveLines({ terminalMix: mixed, terminalMode: 'hosekit', controlValves: 'ours' });
    const cv = lines.filter(l => l.key.startsWith('controlvalve'));
    expect(cv.length).toBe(3);
    expect(new Set(cv.map(l => l.defaultPrice)).size).toBeGreaterThan(1);
  });

  it('keeps the old keys when the job really is one size', () => {
    const lines = hydronicValveLines({ terminalMix: [{ dia: 0.75, count: 10 }], terminalMode: 'hosekit', controlValves: 'ours' });
    expect(lines.map(l => l.key)).toContain('hosekit');
    expect(lines.map(l => l.key)).toContain('controlvalve');
  });

  it('falls back to the hand-picked size when no mix is given', () => {
    const lines = hydronicValveLines({ terminals: 10, terminalSize: 1, terminalMode: 'hosekit', controlValves: 'none' });
    expect(lines.length).toBe(1);
    expect(lines[0].qty).toBe(10);
  });

  it('works in loose-valve mode too', () => {
    const lines = hydronicValveLines({ terminalMix: mixed, terminalMode: 'valves', controlValves: 'none' });
    // 'termbal' also prefix-matches 'termball', so match the balancing valve
    // by its description rather than by a prefix of another key.
    expect(lines.filter(l => /^Balancing valve/.test(l.desc)).length).toBe(3);
    expect(lines.filter(l => /^Ball valve/.test(l.desc)).length).toBe(3);
  });
});

// ── VALIDATED AGAINST THE PROJECT'S OWN PIPING PLANS ─────────────────────────
// Sheet M4.12b, HVAC PIPING PLAN - LEVEL 2 - AREA B, same Edmonds SD College
// Place model as the schedule. Every pair below is a GPM tag read off the
// drawing next to the runout size actually drawn for it. This is the
// independent check: the schedule said what the rule should be, the plans say
// what the engineer did with it.
import { terminalMinSize, TERMINAL_MIN_SIZE, CONVENTION_MAX_GPM, sizeCapacity } from './hydronicSizing.js';

describe('against the M4.12b piping plans', () => {
  // [gpm, size drawn, device kind]
  const TAGGED = [
    [0.3, 0.5, 'radiantPanel'], [0.4, 0.5, 'radiantPanel'], [0.5, 0.5, 'radiantPanel'],
    [0.5, 0.75, 'finTube'], [0.8, 0.75, 'finTube'], [0.9, 0.75, 'finTube'],
    [1.6, 0.75, 'finTube'], [1.7, 0.75, 'finTube'], [1.9, 0.75, 'finTube'],
    [2.2, 0.75, 'finTube'], [2.9, 0.75, 'finTube'], [3.2, 0.75, 'finTube'],
  ];

  for (const [gpm, drawn, terminal] of TAGGED) {
    it(`${gpm} GPM at a ${terminal} is drawn ${sizeLabel(drawn)}`, () => {
      expect(sizeForFlow(gpm, { terminal })).toBe(drawn);
    });
  }

  it('gets the same flow right at two different devices — the case no flow rule can pass', () => {
    // 0.5 GPM, ten tags, three points from their device tags: FT-* run 3/4",
    // PR-* run 1/2".
    expect(sizeForFlow(0.5, { terminal: 'finTube' })).toBe(0.75);
    expect(sizeForFlow(0.5, { terminal: 'radiantPanel' })).toBe(0.5);
  });

  it('friction alone gets three of these wrong, in both directions', () => {
    // This is what the plans caught, kept as the record of why convention and
    // device minimums are here at all.
    expect(sizeForFlow(0.9, { convention: false })).toBe(0.5);   // plan: 3/4", undersized
    expect(sizeForFlow(3.2, { convention: false })).toBe(1);     // plan: 3/4", oversized
    expect(sizeForFlow(0.8, { convention: false })).toBe(0.5);   // plan: 3/4", undersized
  });

  it('still reproduces the schedule bands above where convention governs', () => {
    expect(sizeForFlow(8)).toBe(1.25);
    expect(sizeForFlow(25)).toBe(2);
    expect(sizeForFlow(80)).toBe(3);
  });
});

describe('device minimum connection', () => {
  it('a fin tube never goes below 3/4" however little it draws', () => {
    expect(sizeForFlow(0.05, { terminal: 'finTube' })).toBe(0.75);
  });

  it('a panel may go to 1/2"', () => {
    expect(sizeForFlow(0.05, { terminal: 'radiantPanel' })).toBe(0.5);
  });

  it('flow still wins when it exceeds the minimum', () => {
    expect(sizeForFlow(25, { terminal: 'finTube' })).toBe(2);
  });

  it('an unknown kind falls back to the global minimum rather than throwing', () => {
    expect(terminalMinSize('somethingElse')).toBe(MIN_SIZE);
    expect(sizeForFlow(0.3, { terminal: 'somethingElse' })).toBe(0.5);
  });

  it('every catalogued kind is a real nominal size', () => {
    for (const d of Object.values(TERMINAL_MIN_SIZE)) expect(NOMINAL_SIZES).toContain(d);
  });

  it('an explicit minSize can raise the floor further but not lower it', () => {
    expect(sizeForFlow(0.3, { terminal: 'radiantPanel', minSize: 1 })).toBe(1);
    expect(sizeForFlow(0.3, { terminal: 'finTube', minSize: 0.5 })).toBe(0.75);
  });
});

describe('convention vs friction', () => {
  it('the table says which basis each band came from', () => {
    const rows = sizingTable();
    expect(rows.find(r => r.dia === 0.5).basis).toBe('convention');
    expect(rows.find(r => r.dia === 0.75).basis).toBe('convention');
    expect(rows.find(r => r.dia === 2).basis).toBe('friction');
  });

  it('convention bands match the printed schedule exactly', () => {
    expect(CONVENTION_MAX_GPM[0.5]).toBe(0.9);
    expect(CONVENTION_MAX_GPM[0.75]).toBe(3.6);
  });

  it('convention can be switched off for a deliberately retargeted job', () => {
    expect(sizeCapacity(0.75, { convention: true })).toBe(3.6);
    expect(sizeCapacity(0.75, { convention: false })).toBeCloseTo(2.97, 1);
  });

  it('bands stay contiguous and climbing with convention in play', () => {
    const rows = sizingTable();
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].minGpm).toBe(rows[i - 1].maxGpm);
      expect(rows[i].maxGpm).toBeGreaterThan(rows[i - 1].maxGpm);
    }
  });

  it('a mix can name the device kind per row', () => {
    const m = sizeMix([
      { gpm: 0.5, count: 5, terminal: 'radiantPanel' },
      { gpm: 0.5, count: 5, terminal: 'finTube' },
    ]);
    expect(m.sizes.map(s => s.dia)).toEqual([0.5, 0.75]);
    expect(m.total).toBe(10);
  });
});
