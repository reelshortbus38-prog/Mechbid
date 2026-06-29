import { describe, it, expect } from 'vitest';
import { anchorMonth, buildDateParser, formatSpan, extractWeekNum } from './scheduleDates.js';

// Guards the project-span calculation. A real store-812 schedule (Sep 16 →
// Mar 22, crossing into Jan/Feb/Mar) showed "Jan – Nov" because the old code
// anchored the start month with Math.min, which on a year-wrap picks January.
function span(schedule) {
  const parse = buildDateParser(schedule);
  const ms = schedule.map(s => parse(s.date)).filter(v => v != null);
  return formatSpan(Math.min(...ms), Math.max(...ms));
}

describe('schedule date span (year-wrap)', () => {
  it('store 812: Sep→Mar reads Sep first, not January', () => {
    const sched = [
      { date: 'Monday, September 16th' }, { date: 'Tuesday, October 14th' },
      { date: 'Monday, November 4th' }, { date: 'Monday, December 2nd' },
      { date: 'Sunday, January 5th' }, { date: 'Monday, February 3rd' },
      { date: 'Saturday, March 22nd' },
    ];
    // Sep(8) Oct(9) Nov(10) Dec(11) Jan(0) Feb(1) Mar(2) → start month is Sep.
    expect(anchorMonth([8, 9, 10, 11, 0, 1, 2])).toBe(8);
    expect(span(sched)).toBe('Sep 16 – Mar 22');
  });

  it('a stray earlier outlier (July draft date) never anchors to January', () => {
    const sched = [
      { date: 'July 1st' }, { date: 'September 16th' }, { date: 'December 2nd' },
      { date: 'January 5th' }, { date: 'March 22nd' },
    ];
    // Largest gap is Mar→Jul, so July anchors the start — still chronological.
    expect(span(sched).startsWith('Jul')).toBe(true);
  });

  it('non-wrapping job (store 47, Jun→Aug) is unchanged', () => {
    const sched = [{ date: 'June 23rd' }, { date: 'July 27th' }, { date: 'August 12th' }];
    expect(span(sched)).toBe('Jun 23 – Aug 12');
  });

  it('week numbers parse from headers', () => {
    expect(extractWeekNum('Tuesday, August 4th (Night) w7')).toBe(7);
    expect(extractWeekNum('WEEK #17')).toBe(17);
    expect(extractWeekNum('no week here')).toBe(null);
  });

  it('empty/undated schedule does not throw', () => {
    expect(anchorMonth([])).toBe(0);
    expect(buildDateParser([])({ })).toBe(null);
  });
});
