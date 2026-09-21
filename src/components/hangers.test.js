import { describe, it, expect } from 'vitest';
import {
  hangerBasis, basisText, hangerLines, saddleCounts,
  DEFAULT_SPACING_FT, normalizeSpacing, ROD_SIZE,
  copperOd, insulationWall, saddleSizeFor,
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

  it('marks every line the estimator has to supply', () => {
    // The pre-flight check keys off this flag, not off the wording, so the
    // description can improve without breaking the warning.
    // Eight now, not four. The loose-hardware lot became four separate parts
    // at the mechanic's request, and an unflagged zero is a line nobody is
    // told about — splitting one into four would have been a step backwards.
    expect(lines.filter(l => l.hangerManual)).toHaveLength(8);
    expect(lines.every(l => l.hangerManual)).toBe(true);
  });

  it('buys strut and rod by the stick and everything else by the each', () => {
    const unitOf = re => lines.find(l => re.test(l.desc))?.unit;
    expect(unitOf(/^Pipe Hangers/)).toBe('ea');
    expect(unitOf(/^Unistrut/)).toBe('stick');
    expect(unitOf(/All-Thread Rod/)).toBe('stick');
    expect(unitOf(/Beam clamps/)).toBe('ea');
    expect(unitOf(/^Strut Nuts/)).toBe('ea');
  });

  // ── "the nuts, washers, and rod couplings need to be separated" ───────────
  // One lot line covered all of these. A strut nut and a rod coupling are
  // different parts at different prices from different bins, and a lot priced
  // as a guess cannot be checked against a supplier quote — which is what this
  // list is for.
  it('prices the loose hardware as four parts, not one lot', () => {
    const descs = lines.map(l => l.desc);
    for (const part of [/^Strut Nuts/, /Rod Couplings/, /Hex Nuts/, /Flat Washers/]) {
      expect(descs.filter(d => part.test(d)), String(part)).toHaveLength(1);
    }
    // And the line they replaced is gone, rather than sitting alongside them
    // double-counting the same hardware.
    expect(descs.some(d => /Nuts & Washers/.test(d))).toBe(false);
    expect(lines.some(l => l.unit === 'lot')).toBe(false);
  });

  it('runs one thread size across rod, clamps and loose hardware', () => {
    // A beam clamp and a rod coupling are sized to the thread they go on, so a
    // 3/8" rod line beside an unsized clamp line is not an orderable list. One
    // constant, three descriptions — they cannot drift apart.
    expect(ROD_SIZE).toBe('3/8"');
    const sized = lines.filter(l => l.desc.includes(ROD_SIZE));
    expect(sized).toHaveLength(5);
    expect(sized.map(l => l.desc.match(/All-Thread Rod|Beam clamps|Rod Couplings|Hex Nuts|Flat Washers/)?.[0]).sort())
      .toEqual(['All-Thread Rod', 'Beam clamps', 'Flat Washers', 'Hex Nuts', 'Rod Couplings']);
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
    const suction = saddleCounts(ELEVEN, 6, norm).find(s => s.saddleSize === 5);
    expect(suction.ft).toBe(1650);
    expect(suction.qty).toBe(275);
  });

  it('grows when circuits are added — unlike the trapeze count', () => {
    const one = saddleCounts([ELEVEN[0]], 6, norm)[0].qty;
    const all = saddleCounts(ELEVEN, 6, norm).find(s => s.saddleSize === 5).qty;
    expect(all).toBe(one * 11);
  });

  it('saddles low-temp liquid but not medium-temp liquid', () => {
    // Medium-temp liquid is not insulated, so there is nothing to protect.
    const sizes = saddleCounts(ELEVEN, 6, norm).map(s => s.saddleSize);
    expect(sizes).toContain(4);
    const liquid = saddleCounts(ELEVEN, 6, norm).find(s => s.saddleSize === 4);
    expect(liquid.ft).toBe(5 * 150); // the five low-temp circuits only
  });

  it('skips riser-only drops', () => {
    const withRiser = [...ELEVEN, { isRiserOnly: true, riserLength: 300, sucRiser: '1-3/8' }];
    // 1-3/8 medium temp is a 4" saddle, and the only 4" here comes from the
    // low-temp liquid at 750 ft. A riser folded into it would show as more.
    expect(saddleCounts(withRiser, 6, norm).find(s => s.saddleSize === 4).ft).toBe(750);
  });

  it('follows the same spacing spec the hangers do', () => {
    const at6 = saddleCounts(ELEVEN, 6, norm).find(s => s.saddleSize === 5).qty;
    const at8 = saddleCounts(ELEVEN, 8, norm).find(s => s.saddleSize === 5).qty;
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

// ── LINES IN THE FLOOR ──────────────────────────────────────────────────────
// "Some lines might get pushed in the floor and those don't need hangers and
// are always soft copper." The slab supports them, so they take neither a
// trapeze nor a saddle.
describe('in-floor circuits', () => {
  const overhead = { id: 'a', runLength: 150, sucHoriz: '2-1/8', liqHoriz: '7/8', tempType: 'low' };
  const buried = { id: 'b', runLength: 400, inFloor: true, sucHoriz: '2-1/8', liqHoriz: '7/8', tempType: 'low' };

  it('leaves an in-floor run out of the hanger route', () => {
    // The buried run is the LONGEST one here. If it counted, it would set the
    // route and buy 67 supports of strut for pipe sitting in concrete.
    const b = hangerBasis([overhead, buried], 0, 6);
    expect(b.routeFt).toBe(150);
    expect(b.circuits).toBe(1);
  });

  it('generates no trapeze lines at all when everything is in the floor', () => {
    expect(hangerLines([buried], 0, 6)).toEqual([]);
  });

  it('gives an in-floor run no saddles either', () => {
    // A saddle stops a hanger crushing insulation. There is no hanger.
    const only = saddleCounts([buried], 6, norm);
    expect(only).toEqual([]);
    const mixed = saddleCounts([overhead, buried], 6, norm);
    expect(mixed.find(s => s.saddleSize === 5).ft).toBe(150);
  });

  it('still hangs a riser-only drop, which is not in the floor', () => {
    const riser = { id: 'r', isRiserOnly: true, riserLength: 20, sucRiser: '1-3/8' };
    expect(hangerBasis([overhead, riser], 0, 6).routeFt).toBe(150);
  });
});

// ── THE SADDLE SPEC, FROM THE MECHANIC WHO INSTALLS THEM ─────────────────────
// The takeoff named saddles after the pipe inside them — "1-3/8" Pipe Saddles"
// — which is not something anybody can order. A saddle goes around the
// FINISHED line, copper plus insulation both sides.
//
//   "for saddles can they be changed to 2", 3", 4" and so on. For the 2"
//    saddles we run 5/8 copper with 1/2" insulation and below. 3" is for
//    medium temp 7/8-1 1/8 copper with 3/4 insulation. For 4" 1 3/8-1 5/8 with
//    3/4" insulation and smaller low temp runs with 1" insulation then 5"
//    saddles for anything larger"
//
// Encoded as geometry rather than as a lookup of those four sentences, so a
// size he did not list still lands somewhere defensible. These assertions are
// the four sentences, checked against the geometry.
describe('what size saddle a line takes', () => {
  it('2" — 5/8 and below', () => {
    expect(saddleSizeFor('5/8', 'medium')).toBe(2);
    expect(saddleSizeFor('1/2', 'medium')).toBe(2);
    expect(saddleSizeFor('3/8', 'low')).toBe(2);
  });

  it('3" — medium temp 7/8 through 1-1/8', () => {
    expect(saddleSizeFor('7/8', 'medium')).toBe(3);
    expect(saddleSizeFor('1-1/8', 'medium')).toBe(3);
  });

  it('4" — 1-3/8 through 1-5/8, and the smaller low-temp runs', () => {
    expect(saddleSizeFor('1-3/8', 'medium')).toBe(4);
    expect(saddleSizeFor('1-5/8', 'medium')).toBe(4);
    expect(saddleSizeFor('7/8', 'low')).toBe(4);
    expect(saddleSizeFor('1-1/8', 'low')).toBe(4);
  });

  it('5" — anything larger', () => {
    expect(saddleSizeFor('2-1/8', 'medium')).toBe(5);
    expect(saddleSizeFor('1-3/8', 'low')).toBe(5);
    expect(saddleSizeFor('3-1/8', 'medium')).toBe(5);
  });

  // ── THE CASE THAT PROVES IT IS GEOMETRY AND NOT A LOOKUP TABLE ────────────
  // 7/8 low temp and 1-3/8 medium temp are two different pipes with two
  // different insulation walls, and they finish at exactly the same 2.875".
  // He put both in a 4". A table of his sentences would have got there too; it
  // would not have got the sizes he never mentioned.
  it('lands two different pipes in the same saddle when they finish the same', () => {
    const a = copperOd('7/8') + 2 * insulationWall('7/8', 'low');
    const b = copperOd('1-3/8') + 2 * insulationWall('1-3/8', 'medium');
    expect(a).toBeCloseTo(2.875);
    expect(b).toBeCloseTo(2.875);
    expect(saddleSizeFor('7/8', 'low')).toBe(saddleSizeFor('1-3/8', 'medium'));
  });

  it('puts ONE pipe size in two saddles depending on the temperature', () => {
    // The thing the old naming could not express at all: the line item said
    // "7/8" and that was the whole answer, whichever temperature it ran at.
    expect(saddleSizeFor('7/8', 'medium')).toBe(3);
    expect(saddleSizeFor('7/8', 'low')).toBe(4);
  });

  it('reads the sizes the way the app writes them', () => {
    expect(copperOd('1-3/8')).toBeCloseTo(1.375);
    expect(copperOd('1 3/8')).toBeCloseTo(1.375);
    expect(copperOd('5/8"')).toBeCloseTo(0.625);
    expect(copperOd('2')).toBe(2);
  });

  it('refuses to size a line it cannot read, instead of guessing one', () => {
    for (const junk of ['', null, undefined, 'TBD', 'see plan', '??']) {
      expect(saddleSizeFor(junk, 'low'), String(junk)).toBe(0);
    }
  });
});

describe('a line whose size cannot be read', () => {
  // The old version keyed saddles on the raw string, so an unreadable size
  // still produced a line. Dropping it silently would be a quantity going
  // missing from a bid with nothing said, which is worse than an ugly line.
  const unreadable = [{ id: 'x', runLength: 120, sucHoriz: 'see plan', tempType: 'low' }];

  it('still produces a line, under a saddle size of 0', () => {
    const [row] = saddleCounts(unreadable, 6, norm);
    expect(row.saddleSize).toBe(0);
    expect(row.qty).toBe(20);
    expect(row.covers).toEqual(['see plan" LT']);
  });

  it('does not merge it into a real saddle size', () => {
    const mixed = saddleCounts([...unreadable, ...ELEVEN], 6, norm);
    expect(mixed.find(s => s.saddleSize === 0).ft).toBe(120);
    expect(mixed.find(s => s.saddleSize === 5).ft).toBe(1650);
  });
});

describe('what the saddle line says it covers', () => {
  it('names the copper that ended up in each saddle', () => {
    // So the sizing can be checked on the line rather than taken on faith.
    const all = saddleCounts(ELEVEN, 6, norm);
    expect(all.find(s => s.saddleSize === 5).covers).toEqual(['2-1/8" LT', '2-1/8" MT']);
    expect(all.find(s => s.saddleSize === 4).covers).toEqual(['7/8" LT']);
  });
});
