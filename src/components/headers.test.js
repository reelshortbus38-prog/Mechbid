import { describe, it, expect } from 'vitest';
import { foldHeaders, headerInsulCategory, headerSanityNote, mergeBySize, newHeader, HOME_RUN, SHARED_HEADER } from './headers.js';
import { normalizePipeSize, DEFAULT_CU_RATES } from '../state/store.js';

const fold = h => foldHeaders(h, normalizePipeSize);

// ── ONE PIPE, NOT ONE PER CIRCUIT ────────────────────────────────────────────
// On a loop layout the suction header leaves the rack, circles the sales floor,
// and every lineup taps it. Rolled into each circuit's run length, a
// thirty-circuit job buys thirty headers.

describe('the header is counted once', () => {
  const header = [{ id: 'h', size: '4-1/8"', lengthFt: 400, lineType: 'suction', tempType: 'medium' }];

  it('contributes its own footage and no more', () => {
    expect(fold(header).copperBySize['4-1/8']).toBe(400);
  });

  it('is the same number no matter how many circuits tap it', () => {
    // The whole point: the fold does not see circuits at all.
    expect(fold(header).copperBySize).toEqual(fold(header).copperBySize);
    expect(fold([...header, ...header]).copperBySize['4-1/8']).toBe(800); // two headers IS two headers
  });

  it('is real money at loop-system sizes', () => {
    const ft = fold(header).copperBySize['4-1/8'];
    expect(ft * DEFAULT_CU_RATES['4-1/8']).toBeGreaterThan(15000);
  });

  it('hangs like any horizontal main', () => {
    expect(fold(header).horizFt).toBe(400);
  });
});

describe('insulation follows the same rule the circuits use', () => {
  it('insulates suction at its temperature', () => {
    expect(headerInsulCategory({ lineType: 'suction', tempType: 'medium' })).toBe('medSuction');
    expect(headerInsulCategory({ lineType: 'suction', tempType: 'low' })).toBe('lowSuction');
  });

  it('insulates low-temp liquid and leaves medium-temp liquid bare', () => {
    expect(headerInsulCategory({ lineType: 'liquid', tempType: 'low' })).toBe('lowLiquid');
    expect(headerInsulCategory({ lineType: 'liquid', tempType: 'medium' })).toBeNull();
  });

  it('routes the footage into the matching bucket', () => {
    const f = fold([
      { size: '4-1/8"', lengthFt: 400, lineType: 'suction', tempType: 'medium' },
      { size: '2-1/8"', lengthFt: 300, lineType: 'suction', tempType: 'low' },
      { size: '7/8"', lengthFt: 200, lineType: 'liquid', tempType: 'low' },
      { size: '1-1/8"', lengthFt: 250, lineType: 'liquid', tempType: 'medium' },
    ]);
    expect(f.medSucBySize['4-1/8']).toBe(400);
    expect(f.lowSucBySize['2-1/8']).toBe(300);
    expect(f.lowLiqBySize['7/8']).toBe(200);
    // Medium-temp liquid gets copper but no insulation.
    expect(f.copperBySize['1-1/8']).toBe(250);
    expect(f.medSucBySize['1-1/8']).toBeUndefined();
  });
});

describe('foldHeaders ignores what it cannot use', () => {
  it('skips a header with no size or no length', () => {
    expect(fold([{ size: '', lengthFt: 400 }, { size: '4-1/8"', lengthFt: 0 }]).copperBySize).toEqual({});
  });

  it('produces empty buckets from nothing', () => {
    expect(fold([]).copperBySize).toEqual({});
    expect(fold([]).horizFt).toBe(0);
  });

  it('gives a fresh header sane defaults', () => {
    expect(newHeader('x')).toMatchObject({ id: 'x', lineType: 'suction', tempType: 'medium', lengthFt: 0 });
  });
});

describe('mergeBySize', () => {
  it('adds header footage on top of circuit footage without mutating', () => {
    const circuits = { '7/8': 100, '2-1/8': 50 };
    const merged = mergeBySize(circuits, { '2-1/8': 300, '4-1/8': 400 });
    expect(merged).toEqual({ '7/8': 100, '2-1/8': 350, '4-1/8': 400 });
    expect(circuits['2-1/8']).toBe(50);
  });
});

describe('headerSanityNote — catching the header hidden inside the circuits', () => {
  const longCircuits = Array.from({ length: 12 }, () => ({ runLength: 180 }));

  it('speaks up when long circuit runs meet no header at all', () => {
    const note = headerSanityNote(longCircuits, []);
    expect(note).toMatch(/buy it once per circuit/);
  });

  it('stays quiet once a header is entered', () => {
    expect(headerSanityNote(longCircuits, [{ size: '4-1/8"', lengthFt: 400 }])).toBe('');
  });

  it('stays quiet on short branch runs, which are what it is asking for', () => {
    expect(headerSanityNote(Array.from({ length: 12 }, () => ({ runLength: 30 })), [])).toBe('');
  });

  it('stays quiet on a job too small to judge', () => {
    expect(headerSanityNote([{ runLength: 300 }, { runLength: 300 }], [])).toBe('');
  });

  it('does not fire on a header entered with no length yet', () => {
    expect(headerSanityNote(longCircuits, [{ size: '4-1/8"', lengthFt: 0 }])).toMatch(/buy it once per circuit/);
  });
});

// ── THE WARNING THAT TOLD A CORRECT JOB IT WAS WRONG ─────────────────────────
// A working estimator, on a home-run store: "It is not a loop system. Also
// there's a toggle for the loop system on the setup page so I would've tapped
// that before uploading if it was."
//
// He was right twice. The check was handed circuits and headers and nothing
// else, so it could not tell "no header because home run" from "no header
// yet" — and the card printed "No shared header — correct for a home-run
// layout" directly beneath the warning. It also called this a "loop layout",
// colliding with Setup's SECONDARY LOOP setting, which is a different question
// entirely.

describe('the header check reads the job, not just the circuits', () => {
  const longRuns = Array.from({ length: 10 }, (_, i) => ({ circuitId: `C${i + 1}`, runLength: 161 }));

  it('still speaks up when nobody has said how the store is piped', () => {
    // Unset is not an answer. Eleven circuits at 161 ft with no header really
    // might be buying the header eleven times, and that is worth a look.
    expect(headerSanityNote(longRuns, [])).toMatch(/no shared header is entered/);
  });

  it('goes quiet the moment the estimator says home run', () => {
    expect(headerSanityNote(longRuns, [], { pipingLayout: HOME_RUN })).toBe('');
  });

  it('keeps warning on a store said to have a shared header', () => {
    // Saying "shared header" and then entering none is exactly the mistake.
    expect(headerSanityNote(longRuns, [], { pipingLayout: SHARED_HEADER }))
      .toMatch(/no shared header is entered/);
  });

  it('never fires on a secondary system, which has no suction header at all', () => {
    // Glycol and water loops have no suction or liquid line per case. There is
    // nothing here to share or to double-count; that piping is the glycol
    // card's business.
    for (const loop of ['glycol', 'water']) {
      expect(headerSanityNote(longRuns, [], { secondaryLoop: loop }), loop).toBe('');
    }
    expect(headerSanityNote(longRuns, [], { secondaryLoop: 'none' })).toMatch(/no shared header/);
  });

  it('stops calling it a loop, which is a different setting', () => {
    // Two things called "loop" in one app is how a correct warning came to
    // read as the app ignoring an answer somebody had already given.
    const note = headerSanityNote(longRuns, []);
    expect(note).not.toMatch(/loop/i);
    expect(note).toMatch(/shared suction header/i);
  });

  it('tells the estimator how to make it stop', () => {
    expect(headerSanityNote(longRuns, [])).toMatch(/home run, say so/i);
  });

  it('is unchanged by the new options when they are absent', () => {
    // Every existing caller passes two arguments. They must behave as before.
    expect(headerSanityNote(longRuns, [])).toBe(headerSanityNote(longRuns, [], {}));
    expect(headerSanityNote([{ runLength: 40 }, { runLength: 45 }], [])).toBe('');
  });
});
