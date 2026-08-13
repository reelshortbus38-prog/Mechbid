import { describe, it, expect } from 'vitest';
import { sizeInches, sizeSignature, classifyRun, reclassifyRuns } from './runKind.js';

// Both of these are verbatim from one live run, and they are the same mistake
// in opposite directions:
//   Pipe — 6" EA                    an exhaust-AIR duct filed as pipe
//   Ductwork — 3/4" dia round duct  a refrigerant line filed as duct
// Sheet metal is bought by the pound and copper by the foot, so a run in the
// wrong bucket is wrong money — and neither looks wrong on screen, because
// each reads plausibly inside the group it landed in.

describe('sizeInches', () => {
  it('reads whole, decimal and fractional sizes', () => {
    expect(sizeInches('6"')).toBe(6);
    expect(sizeInches('3/4"')).toBe(0.75);
    expect(sizeInches('1 1/4"')).toBe(1.25);
    expect(sizeInches('12.5')).toBe(12.5);
    expect(sizeInches('')).toBe(0);
  });
});

describe('classifyRun', () => {
  it('moves an air service out of the pipe bucket', () => {
    expect(classifyRun({ size: '6"', service: 'EA' }, 'pipe')).toMatchObject({ kind: 'duct', moved: true });
    expect(classifyRun({ size: '24x16', service: 'exhaust air' }, 'pipe').kind).toBe('duct');
  });

  it('moves a piped service out of the duct bucket', () => {
    expect(classifyRun({ size: '3/4"', service: 'refrigerant liquid' }, 'duct')).toMatchObject({ kind: 'pipe', moved: true });
    expect(classifyRun({ size: '1 1/4"', service: 'RS' }, 'duct').kind).toBe('pipe');
    expect(classifyRun({ size: '2"', service: 'condensate drain' }, 'duct').kind).toBe('pipe');
  });

  it('leaves correct calls alone', () => {
    expect(classifyRun({ size: '24x12', service: 'supply air' }, 'duct')).toMatchObject({ kind: 'duct', moved: false });
    expect(classifyRun({ size: '4"', service: 'CHWS' }, 'pipe')).toMatchObject({ kind: 'pipe', moved: false });
  });

  it('catches a sub-4" round "duct" on size alone, with no service to go on', () => {
    // 3/4" round duct does not exist; that is copper in the wrong bucket.
    expect(classifyRun({ size: '3/4"', shape: 'round' }, 'duct')).toMatchObject({ kind: 'pipe', moved: true });
    expect(classifyRun({ size: '6"', shape: 'round' }, 'duct').moved).toBe(false);
  });

  it('will not reclassify on an ambiguous or silent label', () => {
    // Says both — "exhaust air" and "drain" — so the original call stands
    // rather than trading one error for another.
    expect(classifyRun({ size: '8"', service: 'exhaust air drain' }, 'duct').moved).toBe(false);
    expect(classifyRun({ size: '20x10' }, 'duct').moved).toBe(false);
    expect(classifyRun({}, 'pipe').moved).toBe(false);
  });
});

describe('reclassifyRuns', () => {
  it('re-sorts both live errors and says so', () => {
    const { ductRuns, pipeRuns, flags } = reclassifyRuns(
      [{ size: '3/4"', shape: 'round', service: 'refrigerant liquid' }, { size: '16x12', service: 'exhaust air' }],
      [{ size: '6"', service: 'EA' }, { size: '1 1/4"', service: 'refrigerant suction' }],
      'Page 4');
    expect(ductRuns.map(r => r.size)).toEqual(['16x12', '6"']);
    expect(pipeRuns.map(r => r.size)).toEqual(['3/4"', '1 1/4"']);
    expect(flags).toHaveLength(2);
    expect(flags[0].text).toMatch(/bought by the pound and pipe by the foot/);
  });

  it('says nothing when the analyzer sorted them right', () => {
    const { flags } = reclassifyRuns(
      [{ size: '24x12', service: 'supply air' }], [{ size: '2"', service: 'refrigerant suction' }]);
    expect(flags).toEqual([]);
  });

  it('handles empty input', () => {
    expect(reclassifyRuns()).toEqual({ ductRuns: [], pipeRuns: [], flags: [] });
  });
});

// ── THE SAME LINE READ TWICE ─────────────────────────────────────────────────
// The live set carried BOTH "Ductwork — 3/4" dia round duct" and a perfectly
// good "Pipe — 3/4" RL (refrigerant liquid)". Moving the first without
// checking turns one misclassification into two pipe lines, and if either
// later gets footage the refrigerant run is counted twice.

describe('a moved run that duplicates a good one is dropped', () => {
  const ductSide = [{ size: '3/4"', shape: 'round' }];
  const pipeSide = [{ size: '3/4"', service: 'RL (refrigerant liquid)' }, { size: '1 1/4"', service: 'RS' }];

  it('keeps the properly-read line and drops the misfiled twin', () => {
    const { ductRuns, pipeRuns, flags } = reclassifyRuns(ductSide, pipeSide, 'Page 4');
    expect(ductRuns).toEqual([]);
    expect(pipeRuns.map(r => r.size)).toEqual(['3/4"', '1 1/4"']);
    expect(pipeRuns[0].service).toMatch(/refrigerant/);   // the one WITH a service survived
    expect(flags[0].type).toBe('info');                    // resolved, not a warning
    expect(flags[0].text).toMatch(/same line read twice/);
  });

  it('still moves it when the target list has no twin', () => {
    const { pipeRuns, flags } = reclassifyRuns(ductSide, [{ size: '1 1/4"', service: 'RS' }], 'Page 4');
    // Duct is placed first, so a moved run leads the list. Order does not
    // affect pricing; what matters is that both runs are present.
    expect(pipeRuns.map(r => r.size).sort()).toEqual(['1 1/4"', '3/4"']);
    expect(flags[0].type).toBe('warn');                    // needs a look
  });

  it('matches sizes numerically, not as strings', () => {
    // 0.75 written two ways is one size.
    const { pipeRuns } = reclassifyRuns([{ size: '3/4"', shape: 'round' }], [{ size: '0.75"', service: 'RL' }]);
    expect(pipeRuns).toHaveLength(1);
  });

  it('does not drop a moved run against another moved run', () => {
    // Two misfiled runs of the same size are still two runs — neither is the
    // trustworthy twin.
    const { pipeRuns } = reclassifyRuns(
      [{ size: '2"', shape: 'round' }, { size: '2"', shape: 'round', notes: 'second riser' }], []);
    expect(pipeRuns).toHaveLength(2);
  });
});

// ── THE FALSE TWIN THAT ATE A REAL DUCT ──────────────────────────────────────
// Live: a 6" round exhaust run was correctly moved out of the pipe list, then
// dropped as a "duplicate" of "6x6 outside air/return" already on the duct
// list — because the twin test compared only the leading number, and both
// lead with 6. Different shape, different service, different run.

describe('sizeSignature', () => {
  it('keeps a round size and a rectangular size apart', () => {
    expect(sizeSignature('6"')).not.toBe(sizeSignature('6x6'));
  });

  it('still treats one diameter written two ways as one size', () => {
    expect(sizeSignature('3/4"')).toBe(sizeSignature('0.75"'));
    expect(sizeSignature('12"ø')).toBe(sizeSignature('12 dia'));
  });

  it('matches rectangles on both dimensions', () => {
    expect(sizeSignature('6x6')).not.toBe(sizeSignature('6x12'));
  });
});

describe('a 6" round run is not a duplicate of a 6x6 rectangular one', () => {
  it('keeps both runs', () => {
    const { ductRuns, pipeRuns } = reclassifyRuns(
      [{ size: '6x6', service: 'outside air/return' }],
      [{ size: '6"', service: 'EA (exhaust air)' }], 'Page 7');
    expect(ductRuns.map(r => r.size)).toEqual(['6x6', '6"']);
    expect(pipeRuns).toEqual([]);
  });
});
