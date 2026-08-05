import { describe, it, expect } from 'vitest';
import { partitionHvacEquipment } from './hvacEquip.js';

// The load-bearing rule: when a batch has an equipment SCHEDULE, the schedule
// owns the count and plan-read duplicates are dropped — so the same VAV isn't
// billed twice (once off the plan, once off the schedule). Bid-critical.

const unit = (over = {}) => ({ tag: '', category: 'major', type: 'Unit', model: '', size: '', cfm: '', electrical: '', notes: '', ...over });
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

  it('drops plan-read units once a schedule owns the count', () => {
    const collected = [
      // vision read these off the plan (no source)
      c(unit({ tag: 'VAV-M101', type: 'VAV box' }), 'plan.pdf'),
      c(unit({ tag: 'AHU-M-01', type: 'Air Handler' }), 'plan.pdf'),
      // the schedule is authoritative
      c(unit({ tag: 'AHU-M-01', type: 'Air Handling Unit', source: 'schedule' }), 'sched.pdf'),
      c(unit({ tag: 'VAV-M101', category: 'terminal', type: 'VAV box', model: 'Nailor 3001', size: '6Ø', source: 'schedule' }), 'sched.pdf'),
    ];
    const { hasSchedule, suppressed, major, terminals } = partitionHvacEquipment(collected);
    expect(hasSchedule).toBe(true);
    expect(suppressed).toBe(2);              // both plan-read units set aside
    expect(major.map(m => m.e.tag)).toEqual(['AHU-M-01']); // only the schedule's
    expect(terminals).toHaveLength(1);
    expect(terminals[0].qty).toBe(1);
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

  it('a mixed PDF (schedule + vision in one result) suppresses only the vision units', () => {
    // analyzeHvacPlanPdf merges schedule rows (source) and vision reads (none)
    // into one equipment array — suppression must work per-item, not per-file.
    const collected = [
      c(unit({ tag: 'RTU-1', source: 'schedule' }), 'set.pdf'),
      c(unit({ tag: 'RTU-1', type: 'Rooftop' }), 'set.pdf'), // vision saw it on a plan page of the same PDF
      c(unit({ tag: 'EF-9', type: 'Exhaust Fan' }), 'set.pdf'), // vision-only, not scheduled
    ];
    const { suppressed, major } = partitionHvacEquipment(collected);
    expect(suppressed).toBe(2);
    expect(major.map(m => m.e.tag)).toEqual(['RTU-1']);
  });
});
