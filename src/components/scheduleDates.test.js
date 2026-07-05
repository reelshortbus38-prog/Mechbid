import { describe, it, expect } from 'vitest';
import { anchorMonth, buildDateParser, formatSpan, extractWeekNum, maxWeekNumber,
  scanScheduleDate, scanScheduleTime, scanRcFirstCaseNight, firstCaseMoveNight, extractRcSchedule, PRECON_RE, PRECON_FALLBACK_RE, RCC_RE } from './scheduleDates.js';

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

  it('parses numeric M/D dates (store 1086 "Monday 5/13" style)', () => {
    const sched = [
      { date: 'Monday 4/29' }, { date: 'Monday 5/13 thru Thursday 5/16' },
      { date: 'Tuesday 5/28' }, { date: 'Monday 8/5' },
    ];
    expect(span(sched)).toBe('Apr 29 – Aug 5');
    expect(extractWeekNum('Week 3')).toBe(3); // "Week N" without a #
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

  it('RC first case-move night = first case# move, not store prep or checkouts', () => {
    // Mirrors the real store-812 Week-5 night: store prep + RC disconnect/relocate
    // of refrigerated cases (with case numbers) is the true first move (Oct 14).
    // An earlier night relocating front-end checkouts must NOT count.
    const text = [
      'Tuesday, October 1st (Night)',
      'Remove:',
      '5 LH Checkouts',
      'Relocate:',
      '3 existing self-checkouts',
      '',
      'Monday, October 14th (Night)',
      'Store Associates to remove product and wash cases by 9 pm.',
      'Disconnect and relocate to back room:',
      "(2) 8' Meat promo case# 25, 26",
      'Relocate and temp set on front wall:',
      "16' self serve cold deli case# 1, 2",
    ].join('\n');
    expect(scanRcFirstCaseNight(text)).toBe('Oct 14');
  });

  it('RC scan handles case numbers written without "#" plus a circuit tag', () => {
    // Store-0348 style: "temp cases out" then cases as "Case 36 (Circuit C1)".
    const text = [
      'Monday, October 20th (Night) w6',
      'Refrigeration Contractor to temp cases out on sales floor so drains can be moved.',
      '',
      "8' PT-67 Deli Self-Serve Case 36 (Circuit C1)",
    ].join('\n');
    expect(scanRcFirstCaseNight(text)).toBe('Oct 20');
  });

  it('RC scan ignores the store wash and produce-specialist temp-set of shelving', () => {
    const text = [
      'Monday, October 14th (Night)',
      'Store Associates to remove product and wash cases by 9 pm.',
      'Produce specialist to temp set shelving on back wall.',
    ].join('\n');
    expect(scanRcFirstCaseNight(text)).toBe('');
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

  it('final RCC date reads the "complete store RCC" night', () => {
    const text = [
      'Monday, November 23rd (Day) w23',
      'Crescent Construction to perform electrical commissioning report this week.',
      'Energy Team will conduct a complete store RCC, General Contractor to complete any items.',
    ].join('\n');
    expect(scanScheduleDate(text, RCC_RE)).toBe('Nov 23');
  });

  it('extractRcSchedule groups a night and skips GC/store lines', () => {
    const text = [
      'Tuesday, September 8th (Night) w12',
      'Store Associates to remove product and wash cases by 9 pm from ALL deli cases.',
      'Remove:',
      "6' Bakery #34",
      "8' Deli Island #39",
      'Relocate: (temp set)',
      "18' PT-67 Deli #37, 38",
      'General Contractor to remove and discard the following:',
      'Filler wedges',
      'Wednesday, September 9th (Day) w12',
      'Electrical Contractor to begin overhead lighting.',
    ].join('\n');
    const s = extractRcSchedule(text);
    expect(s.length).toBe(1);                 // only the RC night, not the EC day
    expect(s[0].date).toBe('Sep 8');
    expect(s[0].isNight).toBe(true);
    expect(s[0].tasks.length).toBe(2);        // Remove + Relocate(temp set), grouped
    expect(s[0].tasks[0]).toMatch(/Remove.*Bakery #34.*Deli Island #39/);
    // GC "Filler wedges" must not be captured as an RC task
    expect(s[0].tasks.join(' ')).not.toMatch(/Filler wedges/);
  });

  it('firstCaseMoveNight: first NIGHT with case-move work wins (store 47 → Jul 27)', () => {
    // Mirrors the real store-47 grouped schedule: two early NON-night RC items
    // (running lines, labeling cases — the labeling text even says "relocation
    // or removal date" and must not count), then the true Jul 27 case-move night.
    const nights = [
      { date: 'Jun 22', isNight: false, tasks: ['RC to begin running new refrigeration lines early in the project.'] },
      { date: 'Jun 23', isNight: false, tasks: ["Refrigeration Contractor is to label all cases with painter's tape with case # and relocation or removal date."] },
      { date: 'Jul 27', isNight: true, tasks: ["Relocate: (1) 8' Meat #13 (to back room) NOTE: RC to provide case 14,15 (A7) in working order.", "Remove: (Product only): 20' Meat # 14, 15"] },
      { date: 'Aug 3', isNight: true, tasks: ["Relocate: (1) 8' MX5HN Meat Promo #13 (A7) (from back room)"] },
    ];
    expect(firstCaseMoveNight(nights)).toBe('Jul 27');
    expect(firstCaseMoveNight([])).toBe('');
    expect(firstCaseMoveNight(null)).toBe('');
  });

  it('empty/undated schedule does not throw', () => {
    expect(anchorMonth([])).toBe(0);
    expect(buildDateParser([])({ })).toBe(null);
  });
});
