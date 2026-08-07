import { describe, it, expect } from 'vitest';
import { partitionHvacEquipment, isTerminalUnit, isPhantomScheduleUnit } from './hvacEquip.js';

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
