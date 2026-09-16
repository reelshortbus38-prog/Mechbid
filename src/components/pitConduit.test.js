import { describe, it, expect } from 'vitest';
import {
  isPitConduitPlan, classifyRouting, classifyPit, inFloorFor, routingOf,
  ROUTING, ROUTING_KEYS, PITS, PIT_KEYS,
  pitScopeLines, pitsNotPriced, applyRouting, routingSummary, DIAGRAMMATIC_NOTE,
  applyPitConduitRead, pitConduitFlags, sheetPromptFor,
} from './pitConduit.js';
import { estimateCircuitLabor, DEFAULT_LABOR_UNITS, jointSpacingFt } from '../state/store.js';

// The legend as it reads on Food Lion #0047, Asheboro.
const LEGEND = [
  'EXISTING ACCESS PIT TO BE FILLED WITH 2500 PSI CONCRETE',
  'EXISTING ACCESS PIT TO REMAIN',
  'NEW ACCESS PIT',
  'EXISTING ACCESS PIT',
  'NEW EVAPORATOR COILS',
  'EXISTING EVAPORATOR COILS - REFRIGERANT PIPING TO REMAIN',
  'REFRIGERATION CIRCUIT',
  'EXISTING BELOW SLAB REFRIGERANT CONDUIT TO BE REUSED',
  'EXISTING BELOW SLAB REFRIGERANT CONDUIT TO BE ABANDONED',
  'NEW BELOW SLAB REFRIGERANT CONDUIT',
  'NEW OVERHEAD REFRIGERANT PIPING',
  'NEW ABOVE SLAB AND BELOW CASE REFRIGERATION PIPING',
];

describe('recognising the sheet', () => {
  it('knows its own title', () => {
    expect(isPitConduitPlan('REFRIGERATION PIT AND CONDUIT PLAN')).toBe(true);
    expect(isPitConduitPlan('Refrigeration Conduit and Pit Plan')).toBe(true);
  });

  it('knows it from the legend when the title is not in the text layer', () => {
    expect(isPitConduitPlan(LEGEND.join('\n'))).toBe(true);
  });

  // Two independent signals, because reading a sheet with the wrong prompt
  // loses scope — the same asymmetry pageSkip.js is built around.
  it('takes more than one stray phrase', () => {
    expect(isPitConduitPlan('NEW ACCESS PIT')).toBe(false);
    expect(isPitConduitPlan('EXISTING BELOW SLAB CONDUIT TO BE ABANDONED')).toBe(false);
  });

  it('does not fire on a redline or a schedule', () => {
    expect(isPitConduitPlan('DROP NEW B11 IN EXISTING CHASE. GC TO DEMO')).toBe(false);
    expect(isPitConduitPlan('Circuit | Rack | Application | Run | Suction')).toBe(false);
    expect(isPitConduitPlan('')).toBe(false);
    expect(isPitConduitPlan(null)).toBe(false);
  });
});

describe('reading the legend', () => {
  it('places every routing line on the #0047 legend', () => {
    expect(classifyRouting('NEW BELOW SLAB REFRIGERANT CONDUIT')).toBe('belowSlabNew');
    expect(classifyRouting('EXISTING BELOW SLAB REFRIGERANT CONDUIT TO BE REUSED')).toBe('belowSlabReuse');
    expect(classifyRouting('EXISTING BELOW SLAB REFRIGERANT CONDUIT TO BE ABANDONED')).toBe('belowSlabAbandon');
    expect(classifyRouting('NEW OVERHEAD REFRIGERANT PIPING')).toBe('overhead');
    expect(classifyRouting('NEW ABOVE SLAB AND BELOW CASE REFRIGERATION PIPING')).toBe('aboveSlab');
    expect(classifyRouting('EXISTING EVAPORATOR COILS - REFRIGERANT PIPING TO REMAIN')).toBe('pipingRemains');
  });

  // "EXISTING BELOW SLAB REFRIGERANT CONDUIT TO BE REUSED" carries both
  // "existing" and "conduit"; the specific tests have to win.
  it('does not let the general words beat the specific ones', () => {
    expect(classifyRouting('EXISTING BELOW SLAB REFRIGERANT CONDUIT TO BE REUSED')).not.toBe('belowSlabNew');
    expect(classifyRouting('EXISTING BELOW SLAB REFRIGERANT CONDUIT TO BE ABANDONED')).not.toBe('belowSlabReuse');
  });

  it('leaves a line it does not recognise unplaced rather than guessing', () => {
    expect(classifyRouting('NEW REFRIGERATION RACK')).toBe(null);
    expect(classifyRouting('')).toBe(null);
    expect(classifyRouting(null)).toBe(null);
  });

  it('places every pit line', () => {
    expect(classifyPit('EXISTING ACCESS PIT TO BE FILLED WITH 2500 PSI CONCRETE')).toBe('fill');
    expect(classifyPit('NEW ACCESS PIT')).toBe('new');
    expect(classifyPit('EXISTING ACCESS PIT TO REMAIN')).toBe('remain');
    expect(classifyPit('EXISTING ACCESS PIT')).toBe('existing');
    expect(classifyPit('NEW OVERHEAD REFRIGERANT PIPING')).toBe(null);
  });

  it('every routing and pit key carries a label and a note an estimator can act on', () => {
    for (const r of ROUTING) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.note.length).toBeGreaterThan(20);
      expect(typeof r.inFloor).toBe('boolean');
      expect(typeof r.newCopper).toBe('boolean');
    }
    for (const p of PITS) expect(p.note.length).toBeGreaterThan(10);
    expect(ROUTING_KEYS).toHaveLength(6);
    expect(PIT_KEYS).toHaveLength(4);
  });
});

describe('inFloorFor tells no from no idea', () => {
  it('says yes for every below-slab category', () => {
    expect(inFloorFor('belowSlabNew')).toBe(true);
    expect(inFloorFor('belowSlabReuse')).toBe(true);
    expect(inFloorFor('belowSlabAbandon')).toBe(true);
  });

  it('says no for everything above it', () => {
    expect(inFloorFor('overhead')).toBe(false);
    expect(inFloorFor('aboveSlab')).toBe(false);
    expect(inFloorFor('pipingRemains')).toBe(false);
  });

  // The box changes the joint count, so it must never be ticked on a guess.
  it('says NULL, not false, for a category it does not know', () => {
    expect(inFloorFor('somethingElse')).toBe(null);
    expect(inFloorFor(undefined)).toBe(null);
    expect(routingOf('somethingElse')).toBe(null);
  });
});

// ── THE MONEY THIS SHEET IS WORTH ────────────────────────────────────────────
// inFloor has been a checkbox nobody ever ticked. It changes joint spacing from
// a 20 ft stick to a 50 ft coil, and on a long run that is most of the joints.
describe('what ticking the box is worth', () => {
  const circuit = { circuitId: 'B11', runLength: 400, riserLength: 20, sucHoriz: '7/8', cases: 3 };

  it('changes the joint spacing, which changes the hours', () => {
    expect(jointSpacingFt({ ...circuit, inFloor: false }, DEFAULT_LABOR_UNITS)).toBe(20);
    expect(jointSpacingFt({ ...circuit, inFloor: true }, DEFAULT_LABOR_UNITS)).toBe(50);

    const overhead = estimateCircuitLabor([{ ...circuit, inFloor: false }], DEFAULT_LABOR_UNITS).totalHours;
    const inFloor = estimateCircuitLabor([{ ...circuit, inFloor: true }], DEFAULT_LABOR_UNITS).totalHours;
    expect(inFloor).toBeLessThan(overhead);
    expect(overhead - inFloor).toBeGreaterThan(4);
  });

  it('applies through the routing, not by hand', () => {
    const { circuits } = applyRouting([circuit], { B11: 'belowSlabNew' });
    expect(circuits[0].inFloor).toBe(true);
    expect(estimateCircuitLabor(circuits, DEFAULT_LABOR_UNITS).totalHours)
      .toBeLessThan(estimateCircuitLabor([circuit], DEFAULT_LABOR_UNITS).totalHours);
  });
});

describe('applyRouting', () => {
  const circuits = [
    { circuitId: 'B11', runLength: 400, sucHoriz: '7/8' },
    { circuitId: 'C6', runLength: 200, sucHoriz: '7/8', inFloor: true },
    { circuitId: 'A5', runLength: 150, sucHoriz: '7/8' },
  ];

  it('sets the box from the sheet and says which it moved', () => {
    const out = applyRouting(circuits, { B11: 'belowSlabNew', A5: 'overhead' });
    expect(out.circuits[0].inFloor).toBe(true);
    expect(out.changed).toEqual([{ circuitId: 'B11', routing: 'belowSlabNew', inFloor: true, was: false }]);
  });

  it('reports a circuit that already agreed rather than claiming it changed', () => {
    const out = applyRouting(circuits, { C6: 'belowSlabReuse' });
    expect(out.changed).toEqual([]);
    expect(out.unchanged).toEqual([{ circuitId: 'C6', routing: 'belowSlabReuse' }]);
  });

  it('turns the box back OFF when the sheet says overhead', () => {
    const out = applyRouting(circuits, { C6: 'overhead' });
    expect(out.circuits[1].inFloor).toBe(false);
    expect(out.changed[0]).toEqual({ circuitId: 'C6', routing: 'overhead', inFloor: false, was: true });
  });

  it('names the circuits the sheet routed that are not in the takeoff', () => {
    const out = applyRouting(circuits, { B11: 'overhead', Z99: 'belowSlabNew' });
    expect(out.notInTakeoff).toEqual(['Z99']);
  });

  it('ignores a routing key it does not know rather than touching the circuit', () => {
    const out = applyRouting(circuits, { B11: 'teleported' });
    expect(out.circuits[0].inFloor).toBeUndefined();
    expect(out.changed).toEqual([]);
    expect(out.notInTakeoff).toEqual([]);
  });

  it('matches on the id however it is spelled', () => {
    expect(applyRouting(circuits, { ' b11 ': 'belowSlabNew' }).changed).toHaveLength(1);
  });

  it('leaves everything alone when the sheet said nothing', () => {
    const out = applyRouting(circuits, {});
    expect(out.circuits).toEqual(circuits);
    expect(out.changed).toEqual([]);
  });

  it('survives junk', () => {
    expect(applyRouting(null, null).circuits).toEqual([]);
    expect(applyRouting([{}], { '': 'overhead' }).changed).toEqual([]);
  });
});

describe('access pits', () => {
  it('produces a row for the categories that are work', () => {
    const lines = pitScopeLines({ fill: 3, new: 1, remain: 4, existing: 2 });
    expect(lines.map(l => l.key)).toEqual(['fill', 'new']);
    expect(lines[0].desc).toContain('3 pits');
    expect(lines[1].desc).toContain('1 pit');
  });

  // Nobody has quoted this app a figure for filling a pit, and a number nobody
  // has given is not a number.
  it('carries no hours, and says the estimator has to price it', () => {
    for (const line of pitScopeLines({ fill: 3, new: 1 })) {
      expect(line.hrs).toBe(0);
      expect(line.needsPrice).toBe(true);
      expect(line.note).toMatch(/scope|GC|notes/i);
    }
  });

  it('counts the ones that are not work so the sheet reconciles', () => {
    expect(pitsNotPriced({ fill: 3, remain: 4, existing: 2 }))
      .toEqual([
        { key: 'remain', count: 4, label: 'Existing access pit — to remain' },
        { key: 'existing', count: 2, label: 'Existing access pit' },
      ]);
  });

  it('is empty when there are none', () => {
    expect(pitScopeLines({})).toEqual([]);
    expect(pitScopeLines({ fill: 0 })).toEqual([]);
    expect(pitsNotPriced({})).toEqual([]);
  });
});

describe('what the sheet is not', () => {
  it('says the routing is evidence and the lengths are not', () => {
    expect(DIAGRAMMATIC_NOTE).toMatch(/diagrammatic/i);
    expect(DIAGRAMMATIC_NOTE).toMatch(/field verify/i);
    expect(DIAGRAMMATIC_NOTE).toMatch(/has changed any run length|not changed/i);
  });
});

describe('routingSummary', () => {
  it('tallies for the extraction log', () => {
    const s = routingSummary({ B11: 'belowSlabNew', C6: 'belowSlabNew', A5: 'overhead' });
    expect(s).toContain('2 new below-slab refrigerant conduit');
    expect(s).toContain('1 new overhead refrigerant piping');
  });

  it('is empty when nothing was routed', () => {
    expect(routingSummary({})).toBe('');
    expect(routingSummary({ B11: 'nonsense' })).toBe('');
  });
});

// ── FROM A PARSED SHEET TO CHANGES IN THE BID ────────────────────────────────
// The model is asked only to TRANSCRIBE. Every decision that moves money is
// made here, in code that can be tested without it.
describe('applyPitConduitRead', () => {
  const circuits = [
    { circuitId: 'B11', runLength: 400, sucHoriz: '7/8' },
    { circuitId: 'C6', runLength: 200, sucHoriz: '7/8' },
    { circuitId: 'A5', runLength: 150, sucHoriz: '7/8', inFloor: true },
  ];
  const parsed = {
    legend: LEGEND,
    routing: [
      { circuitId: 'B11', legendText: 'NEW BELOW SLAB REFRIGERANT CONDUIT' },
      { circuitId: 'C6', legendText: 'EXISTING BELOW SLAB REFRIGERANT CONDUIT TO BE REUSED' },
      { circuitId: 'A5', legendText: 'NEW OVERHEAD REFRIGERANT PIPING' },
    ],
    pitCounts: [
      { legendText: 'EXISTING ACCESS PIT TO BE FILLED WITH 2500 PSI CONCRETE', count: 3 },
      { legendText: 'NEW ACCESS PIT', count: 2 },
      { legendText: 'EXISTING ACCESS PIT TO REMAIN', count: 5 },
    ],
    generalNotes: ['GENERAL CONTRACTOR TO SAW CUT AND PATCH SLAB AS REQUIRED'],
  };

  it('ticks the box on the circuits the sheet says run under the floor', () => {
    const out = applyPitConduitRead(circuits, parsed);
    expect(out.circuits.find(c => c.circuitId === 'B11').inFloor).toBe(true);
    expect(out.circuits.find(c => c.circuitId === 'C6').inFloor).toBe(true);
  });

  it('unticks it on a circuit the sheet says is overhead', () => {
    const out = applyPitConduitRead(circuits, parsed);
    expect(out.circuits.find(c => c.circuitId === 'A5').inFloor).toBe(false);
    expect(out.changed.map(c => c.circuitId).sort()).toEqual(['A5', 'B11', 'C6']);
  });

  it('counts the pits and turns the work ones into rows at zero hours', () => {
    const out = applyPitConduitRead(circuits, parsed);
    expect(out.pitCounts).toEqual({ fill: 3, new: 2, remain: 5 });
    expect(out.pitLines.map(l => l.key)).toEqual(['fill', 'new']);
    expect(out.pitLines.every(l => l.hrs === 0)).toBe(true);
    expect(out.pitsNotPriced).toEqual([{ key: 'remain', count: 5, label: 'Existing access pit — to remain' }]);
  });

  it('keeps the trade-split notes verbatim rather than deciding whose scope it is', () => {
    const out = applyPitConduitRead(circuits, parsed);
    expect(out.generalNotes).toEqual(['GENERAL CONTRACTOR TO SAW CUT AND PATCH SLAB AS REQUIRED']);
  });

  it('names a circuit whose legend line it could not place, and changes nothing for it', () => {
    const out = applyPitConduitRead(circuits, {
      ...parsed,
      routing: [{ circuitId: 'B11', legendText: 'SOME CATEGORY NOBODY HAS SEEN' }],
    });
    expect(out.unplaced).toEqual([{ circuitId: 'B11', legendText: 'SOME CATEGORY NOBODY HAS SEEN' }]);
    expect(out.circuits[0].inFloor).toBeUndefined();
  });

  it('reports a legend entry it does not understand as a legend problem', () => {
    const out = applyPitConduitRead(circuits, { ...parsed, legend: [...LEGEND, 'NEW CHILLED WATER MAIN'] });
    expect(out.unreadableLegend).toEqual(['NEW CHILLED WATER MAIN']);
  });

  it('does not count the pit legend lines as unreadable', () => {
    const out = applyPitConduitRead(circuits, parsed);
    expect(out.unreadableLegend).toEqual([]);
  });

  it('survives an empty read without touching the circuits', () => {
    const out = applyPitConduitRead(circuits, {});
    expect(out.circuits).toEqual(circuits);
    expect(out.changed).toEqual([]);
    expect(out.pitLines).toEqual([]);
    expect(applyPitConduitRead(null, null).circuits).toEqual([]);
  });

  it('never carries a length off this sheet, however the read phrases it', () => {
    const out = applyPitConduitRead(circuits, {
      ...parsed,
      routing: [{ circuitId: 'B11', legendText: 'NEW BELOW SLAB REFRIGERANT CONDUIT', notes: 'scales about 380 ft' }],
    });
    // The run length is whatever the BPR said. Nothing on this sheet moves it.
    expect(out.circuits.find(c => c.circuitId === 'B11').runLength).toBe(400);
  });
});

describe('pitConduitFlags', () => {
  const circuits = [{ circuitId: 'B11', runLength: 400, sucHoriz: '7/8' }];
  const flagsFor = parsed => pitConduitFlags(applyPitConduitRead(circuits, parsed), 'PL.02 pit plan.pdf');

  it('says which circuits moved and what it costs, because the box is invisible', () => {
    const [f] = flagsFor({
      legend: LEGEND,
      routing: [{ circuitId: 'B11', legendText: 'NEW BELOW SLAB REFRIGERANT CONDUIT' }],
    });
    expect(f.type).toBe('warn');
    expect(f.text).toMatch(/B11/);
    expect(f.text).toMatch(/BELOW SLAB/);
    expect(f.text).toMatch(/50 ft/);
    expect(f.text).toMatch(/hangers/i);
  });

  // The schedule button from PR #253 reads this field.
  it('carries the circuit ids so the flag can open its row', () => {
    const [f] = flagsFor({
      legend: LEGEND,
      routing: [{ circuitId: 'B11', legendText: 'NEW BELOW SLAB REFRIGERANT CONDUIT' }],
    });
    expect(f.circuits).toEqual(['B11']);
  });

  it('says the pit rows are unpriced and why', () => {
    const f = flagsFor({
      legend: LEGEND,
      pitCounts: [{ legendText: 'NEW ACCESS PIT', count: 2 }],
    }).find(x => /pit/i.test(x.text));
    expect(f.text).toMatch(/no hours for pit work/i);
    expect(f.text).toMatch(/nobody has quoted/i);
  });

  it('always says the sheet is diagrammatic, even on a read that changed nothing', () => {
    for (const parsed of [{}, { legend: LEGEND }]) {
      const flags = pitConduitFlags(applyPitConduitRead(circuits, parsed), 'x.pdf');
      expect(flags.some(f => /diagrammatic/i.test(f.text))).toBe(true);
    }
  });

  it('every flag names the sheet it came from', () => {
    const flags = flagsFor({ legend: LEGEND, routing: [{ circuitId: 'B11', legendText: 'NEW OVERHEAD REFRIGERANT PIPING' }] });
    for (const f of flags) expect(f.source).toBe('PL.02 pit plan.pdf');
  });
});

// ── WHICH PROMPT A SHEET GETS ────────────────────────────────────────────────
// Lifted out of the vision loop in api/ai.js so the decision can be tested even
// though the fetch around it cannot. Sending a pit plan to the redline prompt
// returns nothing from a sheet dense with routing — which is the bug this whole
// module exists to fix, and it would come back silently.
describe('sheetPromptFor', () => {
  it('sends a pit and conduit plan to its own prompt', () => {
    expect(sheetPromptFor('REFRIGERATION PIT AND CONDUIT PLAN')).toBe('pitConduit');
    expect(sheetPromptFor(LEGEND.join('\n'))).toBe('pitConduit');
  });

  it('sends everything else to the redline prompt', () => {
    expect(sheetPromptFor('DROP NEW B11 IN EXISTING CHASE')).toBe('redline');
    expect(sheetPromptFor('')).toBe('redline');
    expect(sheetPromptFor(null)).toBe('redline');
  });

  // A scanned sheet has no text layer, so the decision has nothing to go on.
  // Redline is the right default: it is what the app has always done, and a
  // pit plan read as a redline loses scope where a redline read as a pit plan
  // would lose the callouts that are the whole point of a redline.
  it('defaults to redline when there is no text to judge by', () => {
    expect(sheetPromptFor(undefined)).toBe('redline');
  });
});
