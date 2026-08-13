import { describe, it, expect } from 'vitest';
import { tagFamily, gradeTagFinds, crossCheckDiff } from './crossCheck.js';

const eq = (...tags) => tags.map(tag => ({ tag }));

describe('tagFamily', () => {
  it('groups a series regardless of zero padding or punctuation', () => {
    expect(tagFamily('RTU-08')).toBe('RTU');
    expect(tagFamily('rtu 8')).toBe('RTU');
    expect(tagFamily('RTU-8')).toBe(tagFamily('RTU-08'));
  });

  it('keeps genuinely different classes apart', () => {
    expect(tagFamily('EF-3')).not.toBe(tagFamily('SF-3'));
    expect(tagFamily('AHU')).toBe('AHU');
    expect(tagFamily('')).toBe('');
  });
});

describe('gradeTagFinds', () => {
  it('confirms a missing sibling in a series the primary already found', () => {
    const { confirmed, unknownFamilies } = gradeTagFinds(
      eq('RTU-1', 'RTU-2', 'RTU-3'), eq('RTU-1', 'RTU-4'), e => e.tag);
    expect(confirmed).toEqual(['RTU-4']);
    expect(unknownFamilies).toEqual({});
  });

  it('drops a lone tag from a class the primary saw nothing of', () => {
    // The live false alarm: primary read a sheet with no exhaust fans at all,
    // the second model produced one "EF-3", and it got flagged every page.
    const { confirmed, unknownFamilies } = gradeTagFinds(
      eq('RTU-1', 'RTU-2'), eq('EF-3'), e => e.tag);
    expect(confirmed).toEqual([]);
    expect(unknownFamilies).toEqual({ EF: ['EF-3'] });
  });

  it('treats padding differences as agreement, not a find', () => {
    const { confirmed } = gradeTagFinds(eq('RTU-01'), eq('RTU-1'), e => e.tag);
    expect(confirmed).toEqual([]);
  });

  it('counts a repeated second-model tag once', () => {
    const { confirmed } = gradeTagFinds(eq('VAV-1'), eq('VAV-2', 'VAV-02', 'VAV-2'), e => e.tag);
    expect(confirmed).toEqual(['VAV-2']);
  });

  it('survives empty and missing lists', () => {
    expect(gradeTagFinds(undefined, undefined, e => e.tag))
      .toEqual({ confirmed: [], unknownFamilies: {} });
    expect(gradeTagFinds(eq(''), eq('', null), e => e?.tag).confirmed).toEqual([]);
  });
});

describe('crossCheckDiff', () => {
  it('reports a corroborated miss per tag', () => {
    const { reported: out } = crossCheckDiff(
      { equipment: eq('RTU-1', 'RTU-2') },
      { equipment: eq('RTU-3') });
    expect(out).toEqual(['equipment tag "RTU-3"']);
  });

  it('collapses a whole unseen class into one line instead of six', () => {
    const { reported: out } = crossCheckDiff(
      { equipment: eq('RTU-1') },
      { equipment: eq('EF-1', 'EF-2', 'EF-3', 'EF-4', 'EF-5', 'EF-6') });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('6 "EF" equipment tags');
    expect(out[0]).toContain('EF-1, EF-2, EF-3, EF-4, …');
    expect(out[0]).toMatch(/found none of/);
  });

  it('stays quiet when the two models agree', () => {
    const both = { equipment: eq('RTU-01', 'RTU-02'), airDevices: eq('SD-1') };
    expect(crossCheckDiff(both, { equipment: eq('RTU-1', 'RTU-2'), airDevices: eq('SD-01') }).reported).toEqual([]);
  });

  it('still reports callouts the primary has no trace of', () => {
    const { reported: out } = crossCheckDiff(
      { fieldTasks: [{ desc: 'Provide sound attenuator in supply air duct' }] },
      { fieldTasks: [{ desc: 'Provide 4 inch concrete housekeeping pads at all floor units' }] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/housekeeping/);
  });

  it('ignores a callout the primary already worded differently at the tail', () => {
    const { reported: out } = crossCheckDiff(
      { fieldTasks: [{ desc: 'PROVIDE SOUND ATTENUATOR IN SUPPLY AIR DUCT PER KEYNOTE 15' }] },
      { fieldTasks: [{ desc: 'Provide sound attenuator in supply air duct' }] });
    expect(out).toEqual([]);
  });

  it('handles a missing second read', () => {
    expect(crossCheckDiff({ equipment: eq('RTU-1') }, null)).toEqual({ reported: [], dropped: [] });
    expect(crossCheckDiff(null, { equipment: eq('RTU-1') })).toEqual({ reported: [], dropped: [] });
  });
});

describe('nothing is discarded without a trace', () => {
  it('returns the low-confidence single it graded out', () => {
    // The exact case that was silently dropped: one EF on a sheet where the
    // primary found no exhaust fans at all. Still not a warning — but now the
    // estimator can see it happened.
    const { reported, dropped } = crossCheckDiff(
      { equipment: eq('RTU-1', 'RTU-2') },
      { equipment: eq('EF-3') });
    expect(reported).toEqual([]);
    expect(dropped).toEqual(['EF-3']);
  });

  it('reports a cluster instead of dropping it', () => {
    const { reported, dropped } = crossCheckDiff(
      { equipment: eq('RTU-1') }, { equipment: eq('EF-1', 'EF-2') });
    expect(dropped).toEqual([]);
    expect(reported).toHaveLength(1);
  });

  it('drops nothing when the models agree', () => {
    expect(crossCheckDiff({ equipment: eq('RTU-1') }, { equipment: eq('RTU-01') }).dropped).toEqual([]);
  });
});
