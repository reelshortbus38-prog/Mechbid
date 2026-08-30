import { describe, it, expect } from 'vitest';
import {
  canonicalDay, taskKey, sameTask, dedupeSchedule, distinctDays, distinctNights, MIN_CONTAIN,
} from './scheduleDedupe.js';

// The real pair from store 701. The schedule document contains this task ONCE.
// The deterministic reader normalised the header to "Sep 23"; the AI pass kept
// it as written. Both landed in the list, and the night was counted twice.
const FROM_AI = {
  id: 'a', date: 'Monday, September 23rd (Night)',
  task: 'Deliver and install 2 - Rack A headers from Julian Rd.',
};
const FROM_DIRECT = {
  id: 'b', date: 'Sep 23', isNight: true,
  task: 'Deliver and install: 2 - Rack A headers from Julian Rd.   Tag#40128 and #40643 · Deliver and Hold for RC to schedule install',
};

describe('one day, however it was written', () => {
  it('recognises the long header and the short label as the same day', () => {
    expect(canonicalDay('Monday, September 23rd (Night)')).toBe(canonicalDay('Sep 23'));
  });

  it('handles the numeric form too', () => {
    expect(canonicalDay('Monday 9/23')).toBe(canonicalDay('Sep 23'));
  });

  it('keeps different days apart', () => {
    expect(canonicalDay('Sep 23')).not.toBe(canonicalDay('Oct 1'));
  });

  it('is empty for nothing, so blanks are never counted as a day', () => {
    expect(canonicalDay('')).toBe('');
    expect(canonicalDay(null)).toBe('');
  });
});

describe('the same task at two levels of detail', () => {
  it('matches the real 701 pair', () => {
    expect(sameTask(FROM_AI.task, FROM_DIRECT.task)).toBe(true);
  });

  it('ignores punctuation and case', () => {
    expect(sameTask('Remove: cases 1, 2 and 3', 'REMOVE CASES 1 2 AND 3')).toBe(true);
  });

  it('does NOT match two genuinely different tasks', () => {
    expect(sameTask(
      'RC to remove cases 1, 2 and 3',
      'RC to relocate cases 15 and 16 to the back room',
    )).toBe(false);
  });

  it('will not collapse two SHORT tasks just because one contains the other', () => {
    // "Set 5" inside "Set 59" is a coincidence, not a duplicate.
    expect('SET 5'.length).toBeLessThan(MIN_CONTAIN);
    expect(sameTask('Set 5', 'Set 59')).toBe(false);
  });

  it('still matches short tasks when they are identical', () => {
    expect(sameTask('Set 5', 'set 5.')).toBe(true);
  });
});

describe('collapsing the 701 duplicate', () => {
  const out = dedupeSchedule([FROM_AI, FROM_DIRECT]);

  it('leaves one entry', () => {
    expect(out).toHaveLength(1);
  });

  it('keeps the FULLER description, tags and all', () => {
    expect(out[0].task).toContain('Tag#40128');
  });

  it('keeps the night marking even though it was on the other entry', () => {
    expect(out[0].isNight).toBe(true);
  });

  it('normalises the date rather than keeping whichever label won', () => {
    expect(out[0].date).toBe('Sep 23');
  });
});

describe('what it must not collapse', () => {
  it('two different tasks on the same night both survive', () => {
    const items = [
      { date: 'Sep 23', task: 'Deliver and install 2 - Rack A headers from Julian Rd.' },
      { date: 'Sep 23', task: 'Remove 2 (8 ft) IL1 meat promos case# 20, 21' },
    ];
    expect(dedupeSchedule(items)).toHaveLength(2);
  });

  it('the same task on two different nights both survive', () => {
    // A remodel really does repeat work on successive nights.
    const items = [
      { date: 'Sep 23', task: 'Deliver and install Rack A headers from Julian Rd.' },
      { date: 'Oct 1', task: 'Deliver and install Rack A headers from Julian Rd.' },
    ];
    expect(dedupeSchedule(items)).toHaveLength(2);
  });

  it('survives an empty list and junk entries', () => {
    expect(dedupeSchedule([])).toEqual([]);
    expect(dedupeSchedule([null, undefined])).toEqual([]);
  });
});

describe('the counts that cost money', () => {
  const withDuplicate = [
    FROM_AI, FROM_DIRECT,
    { date: 'Oct 1', task: 'Remove 2 (8 ft) IL1 meat promos case# 20, 21', isNight: true },
    { date: 'Oct 14', task: 'Disconnect and relocate 20 ft Fresh Meat case# 18, 19', isNight: true },
  ];

  it('counts distinct DAYS by the date, not by the label', () => {
    // Four entries, three nights. Before this, Sep 23 counted twice.
    expect(distinctDays(withDuplicate)).toBe(3);
  });

  it('counts distinct NIGHTS the same way', () => {
    expect(distinctNights(withDuplicate)).toBe(3);
  });

  it('an extra night is an extra mobilisation, so the count must match the list', () => {
    const deduped = dedupeSchedule(withDuplicate);
    expect(deduped).toHaveLength(3);
    expect(distinctDays(deduped)).toBe(3);
  });

  it('accepts a caller supplied night test, for items with no isNight flag', () => {
    const items = [
      { date: 'Monday, September 23rd (Night)', task: 'Deliver headers' },
      { date: 'Sep 24', task: 'Day work' },
    ];
    const isNight = i => /\(night\)/i.test(i.date);
    expect(distinctNights(items, isNight)).toBe(1);
  });
});
