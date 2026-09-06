import { describe, it, expect } from 'vitest';
import {
  hangerBasis, basisText, hangerLines, saddleCounts,
  DEFAULT_SPACING_FT, normalizeSpacing, ROD_SIZE,
} from './hangers.js';

const norm = s => String(s || '');

// Eleven circuits down the same back hall — the shape that broke the old math.
const ELEVEN = Array.from({ length: 11 }, (_, i) => ({
  id: `c${i}`, runLength: 150, riserLength: 12,
  sucHoriz: '2-1/8', liqHoriz: '7/8', tempType: i < 6 ? 'medium' : 'low',
}));

describe('hangerBasis — route length, not summed footage', () => {
  it('takes the LONGEST run, never the sum', () => {
    // The whole defect in one assertion. Eleven circuits at 150 ft is 1,650 ft
    // of pipe but 150 ft of route, because they travel together. Summing them
    // put a trapeze under every pipe.
    const b = hangerBasis(ELEVEN, 0, 6);
    expect(b.routeFt).toBe(150);
    expect(b.supportsPerRoute).toBe(25);
    expect(b.circuits).toBe(11);
  });

  it('does not grow when circuits are added to the same route', () => {
    const one = hangerBasis([ELEVEN[0]], 0, 6);
    const all = hangerBasis(ELEVEN, 0, 6);
    expect(all.supportsPerRoute).toBe(one.supportsPerRoute);
  });

  it('uses the header when it runs further than any circuit', () => {
    // On a shared-header store the header is the long pipe down the store and
    // the circuits are short branches off it.
    const branches = [{ runLength: 30, sucHoriz: '7/8' }, { runLength: 40, sucHoriz: '7/8' }];
    expect(hangerBasis(branches, 220, 6).routeFt).toBe(220);
  });

  it('ignores riser-only drops — they are strapped, not hung', () => {
    const withRiser = [...ELEVEN, { id: 'r', isRiserOnly: true, riserLength: 300, sucRiser: '1-3/8' }];
    expect(hangerBasis(withRiser, 0, 6).circuits).toBe(11);
    expect(hangerBasis(withRiser, 0, 6).routeFt).toBe(150);
  });

  it('is zero on a job with no horizontal pipe at all', () => {
    expect(hangerBasis([{ isRiserOnly: true, riserLength: 40 }], 0, 6).routeFt).toBe(0);
    expect(hangerBasis([], 0, 6).routeFt).toBe(0);
  });

  it('follows the spacing spec', () => {
    // Food Lion is 6. Another chain's spec is another number, and it moves the
    // support count with it.
    expect(hangerBasis(ELEVEN, 0, 6).supportsPerRoute).toBe(25);
    expect(hangerBasis(ELEVEN, 0, 8).supportsPerRoute).toBe(19);
    expect(hangerBasis(ELEVEN, 0, 4).supportsPerRoute).toBe(38);
  });
});

describe('normalizeSpacing', () => {
  it('falls back to the common spec rather than dividing by nothing', () => {
    expect(normalizeSpacing(0)).toBe(DEFAULT_SPACING_FT);
    expect(normalizeSpacing(undefined)).toBe(DEFAULT_SPACING_FT);
    expect(normalizeSpacing('')).toBe(DEFAULT_SPACING_FT);
    expect(normalizeSpacing(-3)).toBe(1);
    expect(normalizeSpacing(8)).toBe(8);
  });
});

describe('the trapeze lines', () => {
  const lines = hangerLines(ELEVEN, 0, 6);

  it('generates at zero — the app does not guess these', () => {
    for (const l of lines) expect(l.qty).toBe(0);
  });

  it('marks the four the estimator has to supply', () => {
    // The pre-flight check keys off this flag, not off the wording, so the
    // description can improve without breaking the warning.
    expect(lines.filter(l => l.hangerManual)).toHaveLength(4);
  });

  it('buys strut and rod by the stick, hangers by the each, hardware as a lot', () => {
    const unitOf = re => lines.find(l => re.test(l.desc))?.unit;
    expect(unitOf(/^Pipe Hangers/)).toBe('ea');
    expect(unitOf(/^Unistrut/)).toBe('stick');
    expect(unitOf(/All-Thread Rod/)).toBe('stick');
    expect(unitOf(/Beam clamps/)).toBe('ea');
    expect(unitOf(/Strut Nuts/)).toBe('lot');
  });

  it('runs one thread size across rod, clamps and loose hardware', () => {
    // A beam clamp and a rod coupling are sized to the thread they go on, so a
    // 3/8" rod line beside an unsized clamp line is not an orderable list. One
    // constant, three descriptions — they cannot drift apart.
    expect(ROD_SIZE).toBe('3/8"');
    const sized = lines.filter(l => l.desc.includes(ROD_SIZE));
    expect(sized).toHaveLength(3);
    expect(sized.map(l => l.desc.match(/All-Thread Rod|Beam clamps|Rod Couplings/)?.[0]).sort())
      .toEqual(['All-Thread Rod', 'Beam clamps', 'Rod Couplings']);
  });

  it('carries beam clamps, which the takeoff used to leave off entirely', () => {
    // Every rod drop needs one to get onto the bar joist. Fifty hangers is a
    // hundred clamps at real money each, and they were on no line at all —
    // not even folded into the loose-hardware lot.
    const clamps = lines.find(l => /Beam clamps/.test(l.desc));
    expect(clamps).toBeTruthy();
    expect(clamps.desc).toContain('2 per hanger');
    expect(clamps.hangerManual).toBe(true);
  });

  it('asks for rod the way it actually gets ordered, not by measuring', () => {
    // Verifying a drop means getting in the ceiling with a tape and most
    // contractors won't. "MEASURE ON SITE" on a line nobody measures just
    // produces a zero.
    const rod = lines.find(l => /All-Thread Rod/.test(l.desc));
    expect(rod.desc).toContain('ORDER FROM EXPERIENCE');
    expect(rod.desc).not.toContain('MEASURE ON SITE');
    expect(rod.desc).toMatch(/bundle/);
  });

  it("keeps unistrut in 10' sticks — a shop buying 20' adds its own line", () => {
    expect(lines.some(l => /Unistrut.*10' sticks/.test(l.desc))).toBe(true);
  });

  it('prints the arithmetic an estimator would do on site', () => {
    const hangers = lines[0].desc;
    expect(hangers).toContain('11 circuit(s)');
    expect(hangers).toContain('longest run 150 ft');
    expect(hangers).toContain('25 supports per route at 6 ft');
  });

  it('says what happens past a hanger-full of circuits', () => {
    expect(lines.some(l => /6-8 circuits each; double-stack or a second route/.test(l.desc))).toBe(true);
  });

  it('generates nothing at all when there is no horizontal pipe', () => {
    expect(hangerLines([{ isRiserOnly: true, riserLength: 40 }], 0, 6)).toEqual([]);
  });

  it('mentions the header when there is one', () => {
    const withHdr = hangerLines([{ runLength: 30, sucHoriz: '7/8' }], 220, 6);
    expect(withHdr[0].desc).toContain('header 220 ft');
  });

  it('omits the header clause when there is none', () => {
    expect(lines[0].desc).not.toContain('header');
  });
});

// ── SADDLES STILL CALCULATE ─────────────────────────────────────────────────
// The distinction this module exists to draw: a trapeze is shared between
// circuits, a saddle is not. Summing circuit footage is the mistake for one and
// the correct answer for the other.
describe('saddleCounts', () => {
  it('IS per-circuit — every pipe needs its own cradle at every support', () => {
    // Eleven circuits × 150 ft of 2-1/8" suction = 1,650 ft, 275 saddles. This
    // is the same summed footage that was wrong for trapezes, and it is right
    // here, because eleven pipes cross each support point.
    const suction = saddleCounts(ELEVEN, 6, norm).find(s => s.pipeSize === '2-1/8');
    expect(suction.ft).toBe(1650);
    expect(suction.qty).toBe(275);
  });

  it('grows when circuits are added — unlike the trapeze count', () => {
    const one = saddleCounts([ELEVEN[0]], 6, norm)[0].qty;
    const all = saddleCounts(ELEVEN, 6, norm).find(s => s.pipeSize === '2-1/8').qty;
    expect(all).toBe(one * 11);
  });

  it('saddles low-temp liquid but not medium-temp liquid', () => {
    // Medium-temp liquid is not insulated, so there is nothing to protect.
    const sizes = saddleCounts(ELEVEN, 6, norm).map(s => s.pipeSize);
    expect(sizes).toContain('7/8');
    const liquid = saddleCounts(ELEVEN, 6, norm).find(s => s.pipeSize === '7/8');
    expect(liquid.ft).toBe(5 * 150); // the five low-temp circuits only
  });

  it('skips riser-only drops', () => {
    const withRiser = [...ELEVEN, { isRiserOnly: true, riserLength: 300, sucRiser: '1-3/8' }];
    expect(saddleCounts(withRiser, 6, norm).map(s => s.pipeSize)).not.toContain('1-3/8');
  });

  it('follows the same spacing spec the hangers do', () => {
    const at6 = saddleCounts(ELEVEN, 6, norm).find(s => s.pipeSize === '2-1/8').qty;
    const at8 = saddleCounts(ELEVEN, 8, norm).find(s => s.pipeSize === '2-1/8').qty;
    expect(at6).toBe(275);
    expect(at8).toBe(207);
  });

  it('is empty when nothing runs horizontally', () => {
    expect(saddleCounts([{ isRiserOnly: true, riserLength: 40 }], 6, norm)).toEqual([]);
    expect(saddleCounts([], 6, norm)).toEqual([]);
  });
});

describe('basisText', () => {
  it('reads as a sentence an estimator can act on', () => {
    expect(basisText(hangerBasis(ELEVEN, 220, 6)))
      .toBe('11 circuit(s), longest run 150 ft, header 220 ft — about 37 supports per route at 6 ft');
  });
});
