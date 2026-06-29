import { describe, it, expect } from 'vitest';
import { anchorMonth, buildDateParser, formatSpan, extractWeekNum, maxWeekNumber,
  scanScheduleDate, scanScheduleTime, PRECON_RE, PRECON_FALLBACK_RE, RC_NIGHT_RE } from './scheduleDates.js';

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

  it('job length = highest week number, mixed "Week #N" / "wN" forms', () => {
    const text = 'Week #1 mobilize ... Week #12 ... WEEK #17 floor tile ... Week #27 final inspections';
    expect(maxWeekNumber(text)).toBe(27);
    expect(maxWeekNumber('no weeks here')).toBe(null);
    expect(maxWeekNumber('Tuesday w7 night work')).toBe(7);
  });

  it('date scan anchors to the day-of-week header, not a date in task prose', () => {
    // Mirrors the real store-0348 trap: the line above the RC task mentions
    // "November 5th" in prose, but the night's header is "October 20th".
    const text = [
      'Monday, October 20th (Night) w6',
      '',
      'Deli Bakery suspend operations for renovations until November 5th.',
      '',
      'Refrigeration Contractor to temp cases out on sales floor so drains can be moved.',
    ].join('\n');
    expect(scanScheduleDate(text, RC_NIGHT_RE)).toBe('Oct 20');
  });

  it('RC night marker = case handling, not the store wash or kick plates', () => {
    expect(RC_NIGHT_RE.test('Remove:')).toBe(true);
    expect(RC_NIGHT_RE.test('Relocate:')).toBe(true);
    expect(RC_NIGHT_RE.test('Refrigeration Contractor to temp cases out on sales floor')).toBe(true);
    expect(RC_NIGHT_RE.test('Store Associates to remove product and wash cases by 9 pm.')).toBe(false);
    expect(RC_NIGHT_RE.test('Refrigeration Contractor to remove kick plates in affected case areas')).toBe(false);
  });

  it('pre-con scan reads the meeting day + time, varied wording', () => {
    const text = [
      'Tuesday, September 10th (Day)',
      '',
      'Pre-construction/schedule Coordination Meeting between the Store Personnel and GC. All MUST BE PRESENT at 10:00 am.',
    ].join('\n');
    const d = scanScheduleDate(text, PRECON_RE) || scanScheduleDate(text, PRECON_FALLBACK_RE);
    const t = scanScheduleTime(text, PRECON_RE) || scanScheduleTime(text, PRECON_FALLBACK_RE);
    expect(d).toBe('Sep 10');
    expect(t).toBe('10:00 am');
  });

  it('empty/undated schedule does not throw', () => {
    expect(anchorMonth([])).toBe(0);
    expect(buildDateParser([])({ })).toBe(null);
  });
});
