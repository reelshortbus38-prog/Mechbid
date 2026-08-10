import { describe, it, expect } from 'vitest';
import { partitionHvacEquipment, isTerminalUnit, isPhantomScheduleUnit, expandEquipTags, canonicalTag, proseTagRe, unitTagRe } from './hvacEquip.js';

// The load-bearing rule: when a batch has an equipment SCHEDULE, the schedule
// owns the count and plan-read duplicates are dropped — so the same VAV isn't
// billed twice (once off the plan, once off the schedule). Bid-critical.

// Default carries a model so a helper-built unit is a REAL scheduled row, not a
// bare cross-reference — tests that exercise the phantom rule set fields inline.
const unit = (over = {}) => ({ tag: '', category: 'major', type: 'Unit', model: 'GEN-100', size: '', cfm: '', electrical: '', notes: '', ...over });
const c = (e, fileName = 'f.pdf', drawing = '') => ({ e, fileName, drawing });

describe('partitionHvacEquipment', () => {
  it('keeps every plan unit when there is NO schedule in the batch', () => {
    const collected = [
      c(unit({ tag: 'RTU-1', type: 'Rooftop Unit' })),
      c(unit({ tag: 'AHU-1', type: 'Air Handler' })),
    ];
    const { hasSchedule, suppressed, major } = partitionHvacEquipment(collected);
    expect(hasSchedule).toBe(false);
    expect(suppressed).toBe(0);
    expect(major.map(m => m.e.tag).sort()).toEqual(['AHU-1', 'RTU-1']);
  });

  it('drops plan-read units whose tag has a schedule row (the double-count)', () => {
    const collected = [
      // vision read these off the plan (no source)
      c(unit({ tag: 'VAV-M101', type: 'VAV box' }), 'plan.pdf'),
      c(unit({ tag: 'AHU-M-01', type: 'Air Handler' }), 'plan.pdf'),
      // the schedule carries the same tags — its copies win
      c(unit({ tag: 'AHU-M-01', type: 'Air Handling Unit', source: 'schedule' }), 'sched.pdf'),
      c(unit({ tag: 'VAV-M101', category: 'terminal', type: 'VAV box', model: 'Nailor 3001', size: '6Ø', source: 'schedule' }), 'sched.pdf'),
    ];
    const { hasSchedule, suppressed, major, terminals } = partitionHvacEquipment(collected);
    expect(hasSchedule).toBe(true);
    expect(suppressed).toBe(2);              // both plan-read duplicates set aside
    expect(major.map(m => m.e.tag)).toEqual(['AHU-M-01']); // only the schedule's
    expect(terminals).toHaveLength(1);
    expect(terminals[0].qty).toBe(1);
  });

  it('keeps units that live ONLY on the drawings even when schedules exist', () => {
    // The industrial-set regression: a small MAU/louver schedule must not wipe
    // out the RTUs, VRF system, and fans that only appear on schematic sheets.
    // (The wholesale version of the rule kept 10 of 96 real units.)
    const collected = [
      c(unit({ tag: 'MAU-01', type: 'Make-Up Air Unit', cfm: '30000', source: 'schedule' }), 'sched.pdf'),
      c(unit({ tag: 'RTU-08', type: 'Rooftop Unit' }), 'diagram.pdf'),   // vision-only
      c(unit({ tag: 'VRF-01', type: 'VRF Indoor Unit' }), 'diagram.pdf'),
      c(unit({ tag: 'DHU-01', type: 'Desiccant Dehumidifier' }), 'diagram.pdf'),
    ];
    const { suppressed, major } = partitionHvacEquipment(collected);
    expect(suppressed).toBe(0);
    expect(major.map(m => m.e.tag).sort()).toEqual(['DHU-01', 'MAU-01', 'RTU-08', 'VRF-01']);
  });

  it('counts the same terminal tag once across plan sheets and schedules', () => {
    const collected = [
      c(unit({ tag: 'VAV-22', category: 'terminal', type: 'VAV box', size: '6Ø', source: 'schedule' }), 'sched.pdf'),
      c(unit({ tag: 'VAV-22', category: 'terminal', type: 'VAV box' }), 'plan-left.png'),
      c(unit({ tag: 'VAV-22', category: 'terminal', type: 'VAV box' }), 'plan-right.png'),
      c(unit({ tag: 'VAV-23', category: 'terminal', type: 'VAV box' }), 'plan-left.png'), // plan-only VAV
    ];
    const { terminals } = partitionHvacEquipment(collected);
    const total = terminals.reduce((s, t) => s + t.qty, 0);
    expect(total).toBe(2); // VAV-22 once (schedule copy), VAV-23 once
  });

  it('groups repeated terminal boxes by type+model+size with a summed qty', () => {
    const collected = [
      c(unit({ tag: 'VAV-1', category: 'terminal', type: 'VAV box', model: 'Nailor 3001', size: '6Ø', source: 'schedule' })),
      c(unit({ tag: 'VAV-2', category: 'terminal', type: 'VAV box', model: 'Nailor 3001', size: '6Ø', source: 'schedule' })),
      c(unit({ tag: 'VAV-3', category: 'terminal', type: 'VAV box', model: 'Nailor 3001', size: '8Ø', source: 'schedule' })),
    ];
    const { terminals } = partitionHvacEquipment(collected);
    const bySize = Object.fromEntries(terminals.map(t => [t.size, t.qty]));
    expect(bySize).toEqual({ '6Ø': 2, '8Ø': 1 }); // two 6-inch, one 8-inch
  });

  it('dedupes major units by tag across files (overlapping shots)', () => {
    const collected = [
      c(unit({ tag: 'RTU-1', source: 'schedule' }), 'left.png'),
      c(unit({ tag: 'RTU-1', source: 'schedule' }), 'right.png'),
      c(unit({ tag: 'rtu-1', source: 'schedule' }), 'again.png'), // case-insensitive
    ];
    const { major } = partitionHvacEquipment(collected);
    expect(major).toHaveLength(1);
  });

  it('matches RTU-04 (schedule) with RTU-4 (diagram label) as ONE unit', () => {
    // The industrial set's schedule pads tags (RTU-01..08) but its airflow
    // diagrams don't (RTU-4, RTU-5) — exact matching counted 12 RTUs on a set
    // with 8. Zero-padding and punctuation must not defeat the dedupe.
    const collected = [
      c(unit({ tag: 'RTU-04', type: 'Rooftop Unit', cfm: '5000', source: 'schedule' }), 'sched.pdf'),
      c(unit({ tag: 'RTU-4', type: 'Rooftop Unit' }), 'diagram.pdf'),   // same unit, unpadded
      c(unit({ tag: 'RTU 4', type: 'Rooftop Unit' }), 'diagram2.pdf'),  // same unit, spaced
      c(unit({ tag: 'RTU-40', type: 'Rooftop Unit' }), 'diagram.pdf'),  // DIFFERENT unit
    ];
    const { suppressed, major, review } = partitionHvacEquipment(collected);
    expect(suppressed).toBe(2); // both diagram spellings of RTU-4 fold into the schedule row
    expect(major.map(m => m.e.tag)).toEqual(['RTU-04']);
    // RTU-40 is an unknown member of a scheduled family → asks for confirmation
    expect(review.map(r => r.e.tag)).toEqual(['RTU-40']);
  });

  it('strips only LEADING zeros — RTU-100 stays distinct from RTU-10', () => {
    const collected = [
      c(unit({ tag: 'RTU-100', type: 'Rooftop Unit' })),
      c(unit({ tag: 'RTU-10', type: 'Rooftop Unit' })),
    ];
    expect(partitionHvacEquipment(collected).major).toHaveLength(2);
  });

  it('classifies terminal-vs-major from the type, ignoring the flaky category field', () => {
    // The whole point: an AI read that labels a VAV box "major" must STILL
    // group as a terminal line — the type name is authoritative, category isn't.
    expect(isTerminalUnit({ type: 'VAV box', category: 'major' })).toBe(true);
    expect(isTerminalUnit({ type: '', tag: 'VAV-M101', category: 'major' })).toBe(true);
    expect(isTerminalUnit({ type: 'Fan Powered Box', tag: 'FPB-1' })).toBe(true);
    expect(isTerminalUnit({ type: 'CV terminal unit' })).toBe(true);
    expect(isTerminalUnit({ type: 'Air Handling Unit', tag: 'AHU-M-01', category: 'terminal' })).toBe(false);
    expect(isTerminalUnit({ type: 'Rooftop Unit', tag: 'RTU-1' })).toBe(false);
    expect(isTerminalUnit({ type: 'Condensing Unit', tag: 'CU-2' })).toBe(false);
  });

  it('groups VAVs the AI mislabeled "major" as terminal lines, not equipment cards', () => {
    const collected = [
      { e: { tag: 'VAV-1', category: 'major', type: 'VAV box', model: 'Nailor 3001', size: '6Ø', source: 'schedule' }, fileName: 's.pdf', drawing: '' },
      { e: { tag: 'VAV-2', category: 'major', type: 'VAV box', model: 'Nailor 3001', size: '6Ø', source: 'schedule' }, fileName: 's.pdf', drawing: '' },
      { e: { tag: 'AHU-M-01', category: 'major', type: 'Air Handling Unit', cfm: '5000', source: 'schedule' }, fileName: 's.pdf', drawing: '' },
    ];
    const { major, terminals } = partitionHvacEquipment(collected);
    expect(major.map(m => m.e.tag)).toEqual(['AHU-M-01']); // only the real major unit
    expect(terminals).toHaveLength(1);
    expect(terminals[0].qty).toBe(2);                       // both VAVs grouped
  });

  it('drops a bare schedule tag (AHU cross-reference) but keeps real scheduled units', () => {
    // A real AHU row carries a model/CFM; the VAV schedule's "served by AHU-M-01"
    // reference comes back as a bare tag — that one must not count as an AHU.
    expect(isPhantomScheduleUnit({ tag: 'AHU-M-01', type: 'Air Handling Unit', source: 'schedule' })).toBe(true);
    expect(isPhantomScheduleUnit({ tag: 'AHU-M-01', type: 'Air Handling Unit', cfm: '5000', source: 'schedule' })).toBe(false);
    expect(isPhantomScheduleUnit({ tag: 'RTU-1', model: 'Trane', source: 'schedule' })).toBe(false);
    // A bare tag from a PLAN (vision) is legitimate — that's all vision gives.
    expect(isPhantomScheduleUnit({ tag: 'AHU-M-01', type: 'Air Handling Unit' })).toBe(false);
  });

  it('a bare associated-unit reference does not inflate the AHU count', () => {
    const collected = [
      { e: { tag: 'AHU-M-01', type: 'Air Handling Unit', cfm: '5000', model: 'Xetex', source: 'schedule' }, fileName: 's.pdf', drawing: '' }, // real row
      { e: { tag: 'AHU-M-02', type: 'Air Handling Unit', source: 'schedule' }, fileName: 's.pdf', drawing: '' }, // bare cross-ref
      { e: { tag: 'VAV-1', category: 'terminal', type: 'VAV box', size: '6Ø', cfm: '350/175', source: 'schedule' }, fileName: 's.pdf', drawing: '' },
    ];
    const { major, crossRefs } = partitionHvacEquipment(collected);
    expect(crossRefs).toBe(1);
    expect(major.map(m => m.e.tag)).toEqual(['AHU-M-01']); // only the real AHU
  });

  it('a mixed PDF (schedule + vision in one result) suppresses only tag duplicates', () => {
    // analyzeHvacPlanPdf merges schedule rows (source) and vision reads (none)
    // into one equipment array — the vision copy of a scheduled tag is dropped,
    // but a vision-only unit (EF-9 has no schedule row) survives.
    const collected = [
      c(unit({ tag: 'RTU-1', source: 'schedule' }), 'set.pdf'),
      c(unit({ tag: 'RTU-1', type: 'Rooftop' }), 'set.pdf'), // vision saw it on a plan page of the same PDF
      c(unit({ tag: 'EF-9', type: 'Exhaust Fan' }), 'set.pdf'), // vision-only, not scheduled
    ];
    const { suppressed, major } = partitionHvacEquipment(collected);
    expect(suppressed).toBe(1);
    expect(major.map(m => m.e.tag).sort()).toEqual(['EF-9', 'RTU-1']);
    expect(major.find(m => m.e.tag === 'RTU-1').e.source).toBe('schedule'); // the schedule's copy won
  });
});

describe('expandEquipTags', () => {
  it('expands THRU ranges into individual tags, keeping padding style', () => {
    const out = expandEquipTags({ tag: 'RTU-01 THRU RTU-08', type: 'Rooftop Unit' });
    expect(out).toHaveLength(8);
    expect(out[0].tag).toBe('RTU-01');
    expect(out[7].tag).toBe('RTU-08');
    expect(out.every(e => e.type === 'Rooftop Unit')).toBe(true);
  });

  it('expands comma/ampersand lists, with bare numbers inheriting the prefix', () => {
    expect(expandEquipTags({ tag: 'EF-12, EF-13 & EF-14' }).map(e => e.tag)).toEqual(['EF-12', 'EF-13', 'EF-14']);
    expect(expandEquipTags({ tag: 'EF-12, 13, 14' }).map(e => e.tag)).toEqual(['EF-12', 'EF-13', 'EF-14']);
  });

  it('leaves normal tags, odd strings, and absurd ranges alone', () => {
    expect(expandEquipTags({ tag: 'RTU-04' })).toHaveLength(1);
    expect(expandEquipTags({ tag: 'RTU-01 THRU RTU-900' })).toHaveLength(1); // cap
    expect(expandEquipTags({ tag: 'SEE SCHEDULE, NOTE 3' })).toHaveLength(1); // non-tag token
    expect(expandEquipTags({ tag: '' })).toHaveLength(1);
  });
});

describe('family closure → review', () => {
  const sched = (tag, over = {}) => ({ e: { tag, type: 'x', cfm: '1000', source: 'schedule', ...over }, fileName: 's.pdf', drawing: '' });
  const plan = (tag, over = {}) => ({ e: { tag, type: 'x', ...over }, fileName: 'p.pdf', drawing: '' });

  it('routes an unknown member of a scheduled family to review, not equipment', () => {
    const { major, review } = partitionHvacEquipment([sched('RTU-01'), sched('RTU-02'), plan('RTU-09')]);
    expect(major.map(m => m.e.tag)).toEqual(['RTU-01', 'RTU-02']);
    expect(review.map(r => r.e.tag)).toEqual(['RTU-09']);
  });

  it('a THRU-range mention folds into schedule rows instead of surviving as a unit', () => {
    const collected = [sched('RTU-01'), sched('RTU-02'), plan('RTU-01 THRU RTU-02', { notes: 'BMS narrative' })];
    const { major, review, suppressed } = partitionHvacEquipment(collected);
    expect(major).toHaveLength(2);
    expect(review).toHaveLength(0);
    expect(suppressed).toBe(2); // both expanded tags matched schedule rows
  });

  it('keeps drawing-only families (VRF) without review noise', () => {
    const { major, review } = partitionHvacEquipment([sched('MAU-01'), plan('VRF-01'), plan('VRF-02')]);
    expect(major.map(m => m.e.tag).sort()).toEqual(['MAU-01', 'VRF-01', 'VRF-02']);
    expect(review).toHaveLength(0);
  });

  it('sends tagless mentions to review only when schedules exist', () => {
    const withSched = partitionHvacEquipment([sched('MAU-01'), plan('', { type: 'Make-Up Air Unit' })]);
    expect(withSched.review).toHaveLength(1);
    expect(withSched.major.map(m => m.e.tag)).toEqual(['MAU-01']);
    const noSched = partitionHvacEquipment([plan('', { type: 'Make-Up Air Unit' })]);
    expect(noSched.review).toHaveLength(0);
    expect(noSched.major).toHaveLength(1); // vision-only job keeps tagless units
  });
});

// ── ONE DEFINITION OF A UNIT TAG ─────────────────────────────────────────────
// This had drifted into four patterns across three files. Two matched any
// capitalised word plus a number, and ALL of them required the separator to be
// a dash or nothing — so a set that writes "CU 1-3" and "HP 1-5", which is
// perfectly ordinary, was invisible to schedule detection, coverage checks and
// page selection alike.

describe('proseTagRe — scanning sentences and page text', () => {
  it('matches the tag forms real sets actually use', () => {
    ['CU 1-3', 'HP 1-5', 'RTU-01', 'RTU01', 'EF-2', 'VAV-M235A', 'SSCU-04', 'AHU 2']
      .forEach(t => expect(proseTagRe().test(t), t).toBe(true));
  });

  it('rejects the look-alikes that made every page look tagged', () => {
    // "LEVEL 01" and "AREA 518" kept every sheet in the vision budget.
    ['LEVEL 01', 'AREA 518', 'SECTOR 1', 'TYP 2', 'OPTDC 2']
      .forEach(t => expect(proseTagRe().test(t), t).toBe(false));
  });

  it('rejects sheet numbers and figures that merely look like tags', () => {
    expect(proseTagRe().test('M-20301')).toBe(false);   // a sheet number
    expect(proseTagRe().test('SF 1200')).toBe(false);   // square feet, not supply fan 1200
  });

  it('leaves single-letter prefixes out of prose', () => {
    // "NC Registration No. P-0477" must not become pump 477.
    expect(proseTagRe().test('P-0477')).toBe(false);
    expect(proseTagRe().test('P-1')).toBe(false);
  });
});

describe('unitTagRe — dense schedule tables', () => {
  it('does allow the single-letter prefixes a schedule really uses', () => {
    expect(unitTagRe().test('P-1')).toBe(true);
    expect(unitTagRe().test('CU 1-3')).toBe(true);
  });
});

describe('canonicalTag across separator styles', () => {
  it('unifies every spelling of one unit', () => {
    const forms = ['CU 1-3', 'CU-1-3', 'cu13'].map(canonicalTag);
    expect(new Set(forms).size).toBe(1);
    expect(canonicalTag('RTU 1')).toBe(canonicalTag('RTU-01'));
  });
});

describe('expandEquipTags with spaced tags', () => {
  it('expands a range written with spaces', () => {
    expect(expandEquipTags({ tag: 'RTU 01 THRU RTU 04' }).map(e => e.tag))
      .toEqual(['RTU 01', 'RTU 02', 'RTU 03', 'RTU 04']);
  });
});
