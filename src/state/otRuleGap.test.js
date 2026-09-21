import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { otRuleGap, otRuleConflict, otReview } from './store.js';

// ── THE CONFIGURATION THAT GOT SILENCE ───────────────────────────────────────
// Reported from a live bid, on screen at the time:
//
//   Job Length 27 weeks · Days/Week 4 · OT after (hrs/day) blank ·
//   OT after (hrs/week) 40 · OT Multiplier 1 · crew of 4 on ten-hour days
//
//   "if we're bidding 40 hours a week for 4 days a week then the overtime
//    isn't on there unless it's added"
//
// Four tens is exactly forty, so the weekly rule owes nothing and the app said
// nothing. Both true. But every shop that pays past eight in a DAY owes eight
// hours a man a week on that schedule, and neither existing check could speak:
// otReview goes quiet as soon as any threshold is set, and otRuleConflict needs
// a daily threshold to compare against — which is the one that was missing.

const crew = (n, hrsPerDay) => Array.from({ length: n }, () => ({ rate: 75, hrsPerDay }));
const HIS = { daysPerWeek: 4, otAfterHours: 0, weeklyOtHours: 40, otMult: 1 };

describe('the four-ten that owed nothing', () => {
  it('speaks about exactly the configuration that was on screen', () => {
    const gap = otRuleGap(crew(4, 10), HIS);
    expect(gap).toBeTruthy();
    expect(gap.missing).toBe('daily');
    expect(gap.hrsPerWeek).toBe(40);
    expect(gap.perManPerWeek).toBe(2 * 4);   // two hours over eight, four days
    expect(gap.otHoursPerWeek).toBe(32);     // the crew of four
    expect(gap.men).toBe(4);
  });

  it('notices the multiplier makes the whole thing inert', () => {
    // A threshold splits the hours and then prices both halves identically at
    // 1x. Setting the daily rule would change the bid by nothing.
    expect(otRuleGap(crew(4, 10), HIS).multiplierInert).toBe(true);
    expect(otRuleGap(crew(4, 10), { ...HIS, otMult: 1.5 }).multiplierInert).toBe(false);
  });

  // The two checks that were already there, on the same inputs, to record that
  // this was genuinely silence rather than a message nobody read.
  it('is invisible to both of the checks that existed', () => {
    expect(otRuleConflict(crew(4, 10), HIS)).toBeNull();
    expect(otReview({
      laborMode: 'flat',
      flatJob: { ...HIS, weeks: 27, crew: crew(4, 10) },
    })).toBeNull();
  });
});

describe('the mirror case', () => {
  it('a six-eight with only the daily rule set is short the weekly hours', () => {
    const gap = otRuleGap(crew(3, 8), { daysPerWeek: 6, otAfterHours: 8, weeklyOtHours: 0, otMult: 1.5 });
    expect(gap.missing).toBe('weekly');
    expect(gap.hrsPerWeek).toBe(48);
    expect(gap.perManPerWeek).toBe(8);
    expect(gap.otHoursPerWeek).toBe(24);
  });
});

describe('when it stays quiet', () => {
  it('says nothing when the configured rule is already billing overtime', () => {
    // 5x10 on a weekly 40: ten hours a week are already overtime. Whatever the
    // daily rule would say, nothing is being hidden.
    expect(otRuleGap(crew(4, 10), { daysPerWeek: 5, weeklyOtHours: 40, otMult: 1.5 })).toBeNull();
  });

  it('says nothing when BOTH rules are set — that is otRuleConflict', () => {
    expect(otRuleGap(crew(4, 10), { daysPerWeek: 4, otAfterHours: 8, weeklyOtHours: 40 })).toBeNull();
  });

  it('says nothing when NEITHER is set — that is otReview', () => {
    expect(otRuleGap(crew(4, 10), { daysPerWeek: 4 })).toBeNull();
  });

  it('says nothing when the other rule would owe nothing either', () => {
    // 5x8 is forty hours and eight-hour days. Both rules agree on zero, and
    // there is no second opinion worth printing.
    expect(otRuleGap(crew(4, 8), { daysPerWeek: 5, weeklyOtHours: 40 })).toBeNull();
  });

  it('says nothing without a crew or a week', () => {
    expect(otRuleGap([], HIS)).toBeNull();
    expect(otRuleGap(crew(4, 10), { ...HIS, daysPerWeek: 0 })).toBeNull();
    expect(otRuleGap(undefined, HIS)).toBeNull();
  });
});

// ── THE 1 YOU CANNOT DELETE ──────────────────────────────────────────────────
// Same report, same screen: "Can't delete the 1 on the ot multiplier."
//
//   onChange={e => setFlat({ otMult: parseFloat(e.target.value) || 1 })}
//
// Clearing the box sends '', parseFloat('') is NaN, `|| 1` turns that into 1,
// and the 1 is written straight back into the field. The box cannot be emptied
// and cannot be typed into from the left — typing "1.5" means clearing first,
// and clearing is what does not work.
//
// This is the third time this exact coercion has shipped in this repo: the rack
// task Men box billed an explicit 0 as 1 man, and markupPct had three readers
// with three different fallbacks. numberField.js exists because of those.
//
// Source-level, because the failure is in an event handler that no static
// render reaches — the field renders correctly, saves correctly, and prices
// correctly. The only thing wrong is what happens when somebody presses
// backspace.
describe('the overtime multiplier can be cleared', () => {
  const src = readFileSync(new URL('../steps/Step5_Labor.jsx', import.meta.url), 'utf8');

  it('does not coerce an empty box back to a number as you type', () => {
    const bad = src.split('\n')
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => /otMult:\s*parseFloat\([^)]*\)\s*\|\|/.test(line));
    expect(bad, bad.map(([n, l]) => `${n}: ${l.trim()}`).join('\n')
      + '\n\nparseFloat(\'\') is NaN and `|| 1` writes 1 back into the field, so the box cannot be '
      + 'emptied. Use fieldNumber from state/numberField.js, which keeps \'\' as \'\'.').toEqual([]);
  });

  it('reads the field through the helper that tolerates an empty value', () => {
    expect(src).toMatch(/value=\{fieldValue\((?:flat|period)\.otMult\)\}/);
  });

  // An empty multiplier has to still PRICE as 1, or clearing the box would
  // quietly zero the labor it multiplies.
  it('an empty multiplier still costs straight time', async () => {
    const { crewDayCost } = await import('./store.js');
    const men = [{ rate: 100, hrsPerDay: 10 }];
    expect(crewDayCost(men, { otMult: '', otAfterHours: 8 })).toBe(1000);
    expect(crewDayCost(men, { otMult: 1.5, otAfterHours: 8 })).toBe(1100);
  });
});

// ── THE SHOP'S OWN RULE ──────────────────────────────────────────────────────
// "We pay overtime after 40 in a week."
//
// That is a fact about the agreement, not about the store being bid. It was
// living on individual labor PERIODS, so it was re-decided on every job —
// usually by leaving it alone — and otMult was hardcoded to 1 when a period
// was created. A 1x multiplier splits the hours into straight and overtime and
// then prices both halves the same, so a shop that never touched it had
// overtime machinery that could not move a total.
describe('once the shop has said which rule it pays', () => {
  const FOUR_TEN = { daysPerWeek: 4, otAfterHours: 0, weeklyOtHours: 40, otMult: 1.5 };

  it('stops asking about the other one', () => {
    // The card is right and it has been answered. Repeating it on every job
    // after that is how a real warning stops being read.
    expect(otRuleGap(crew(4, 10), { ...FOUR_TEN, shopBasis: 'weekly' })).toBeNull();
  });

  it('still asks when the shop has said nothing', () => {
    expect(otRuleGap(crew(4, 10), FOUR_TEN)).toBeTruthy();
    expect(otRuleGap(crew(4, 10), { ...FOUR_TEN, shopBasis: '' })).toBeTruthy();
  });

  it('still speaks when the job is set to a rule the shop does NOT pay', () => {
    // Shop pays weekly; this job has a daily threshold and no weekly one. The
    // gap is real and pointing the other way.
    const daily = { daysPerWeek: 6, otAfterHours: 8, weeklyOtHours: 0, otMult: 1.5 };
    expect(otRuleGap(crew(3, 8), { ...daily, shopBasis: 'weekly' })).toBeTruthy();
  });

  it('still speaks to a shop that pays BOTH about the half that is missing', () => {
    // 'both' matches neither single rule, deliberately.
    expect(otRuleGap(crew(4, 10), { ...FOUR_TEN, shopBasis: 'both' })).toBeTruthy();
  });
});
