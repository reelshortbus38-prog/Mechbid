import { describe, it, expect } from 'vitest';
import { dedupeFlags, flagKey, dedupeSavings, textSimilarity, mergeNearDuplicates } from './flagDedupe.js';

// Analyzing a full 40-page set repeated the same general notes once per sheet
// and the same cross-check once per page, burying the flags that mattered.

describe('flagKey', () => {
  it('ignores case and punctuation so the same note collapses', () => {
    expect(flagKey('REFER TO DETAIL SHEETS AND SPECIFICATIONS.'))
      .toBe(flagKey('Refer to detail sheets and specifications'));
  });

  it('strips the page prefix — one finding, not one per page', () => {
    expect(flagKey('Page 4 cross-check: a second AI model also saw equipment tag "RTU-1"'))
      .toBe(flagKey('Page 7 cross-check: a second AI model also saw equipment tag "RTU-1"'));
  });

  it('keeps genuinely different notes apart', () => {
    expect(flagKey('Provide wire mesh screen at the end of the return duct'))
      .not.toBe(flagKey('Provide sound attenuators in supply air duct'));
    expect(flagKey('')).toBe('');
  });
});

describe('dedupeFlags', () => {
  it('collapses a note repeated per sheet and counts the sheets', () => {
    const note = 'FOR ALL EXTERIOR WALL/ROOF PENETRATIONS, COORDINATE WITH ARCHITECTURAL DRAWINGS.';
    const flags = [
      { type: 'warn', text: note, source: 'M0.01' },
      { type: 'warn', text: note, source: 'M0.03' },
      { type: 'warn', text: note, source: 'M1.01' },
      { type: 'info', text: 'PROGRESS - NOT FOR CONSTRUCTION 10/29/25', source: 'M0.01' },
    ];
    const out = dedupeFlags(flags);
    expect(out).toHaveLength(2);
    expect(out[0].count).toBe(3);
    expect(out[0].sources).toEqual(['M0.01', 'M0.03', 'M1.01']);
    expect(out[0].text).toBe(note);       // original wording preserved
    expect(out[1].count).toBe(1);
  });

  it('collapses the per-page cross-check repeats', () => {
    const flags = [1, 4, 5, 7].map(p => ({
      type: 'warn', text: `Page ${p} cross-check: a second AI model also saw equipment tag "RTU-1" that the primary read didn't — verify on the plan`,
    }));
    expect(dedupeFlags(flags)).toHaveLength(1);
    expect(dedupeFlags(flags)[0].count).toBe(4);
  });

  it('preserves first-seen order and promotes a repeat that is a warning', () => {
    const out = dedupeFlags([
      { type: 'info', text: 'Same note', source: 'a' },
      { type: 'warn', text: 'Same note', source: 'b' },
      { type: 'info', text: 'Other note' },
    ]);
    expect(out.map(f => f.text)).toEqual(['Same note', 'Other note']);
    expect(out[0].type).toBe('warn'); // severity wins over first-seen
  });

  it('accepts bare strings, skips empties, and handles nothing', () => {
    expect(dedupeFlags(['a note', 'a note', 'other'])).toHaveLength(2);
    expect(dedupeFlags([null, { text: '' }, undefined])).toEqual([]);
    expect(dedupeFlags()).toEqual([]);
  });
});

describe('near-duplicates — the same note the AI re-worded per sheet', () => {
  // Both verbatim from one run, from two different sheets. One requirement.
  const SLEEVE_A = 'FOR DUCTWORK AND PIPING PENETRATING PARTITIONS ABOVE THE CEILING, THE CONTRACTOR IS TO PROVIDE SLEEVE AND SEAL THE OPENING BACK TO DISTRIBUTION. IN THE EVENT THAT A FIRE RATING IS CROSSED, PROVIDE FIRE DAMPERS AND FIRE CAULK AS REQUIRED.';
  const SLEEVE_B = 'CONTRACTOR IS TO PROVIDE SLEEVE AND SEAL THE OPENING FOR DUCTWORK AND PIPING PENETRATING PARTITIONS ABOVE THE CEILING; IN THE EVENT THAT A FIRE RATING IS CROSSED, PROVIDE FIRE DAMPERS AND FIRE CAULK AS REQUIRED.';

  it('folds a re-worded note into one entry and keeps the fuller wording', () => {
    const out = dedupeFlags([
      { type: 'warn', text: SLEEVE_A, source: 'M0.03' },
      { type: 'warn', text: SLEEVE_B, source: 'M1.01' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(out[0].sources).toEqual(['M0.03', 'M1.01']);
    expect(out[0].text).toBe(SLEEVE_A); // the longer one carries more detail
  });

  it('keeps scope notes that merely rhyme APART — different work, different money', () => {
    // Same verbs, same nouns, different ducts and different elevations. Merging
    // these would drop a requirement from the bid.
    const out = dedupeFlags([
      { text: "PROVIDE WIRE MESH SCREEN AND BALANCING DAMPER AT THE END OF EXHAUST AIR DUCT AT 18' FROM FFL." },
      { text: "PROVIDE WIRE MESH SCREEN AT THE END OF THE RETURN DUCT, LOCATED 5' BELOW THE ROOF." },
    ]);
    expect(out).toHaveLength(2);
  });

  it('never merges on short notes, where overlap means little', () => {
    expect(mergeNearDuplicates([
      { text: 'Provide fire caulk', count: 1, sources: [] },
      { text: 'Provide fire dampers', count: 1, sources: [] },
    ])).toHaveLength(2);
  });

  it('scores identical text 1 and unrelated text near 0', () => {
    expect(textSimilarity(SLEEVE_A, SLEEVE_A)).toBe(1);
    expect(textSimilarity(SLEEVE_A, 'ALL CONDENSATE PIPING SHALL BE SET AT ONE QUARTER INCH PER FOOT SLOPE IN THE DIRECTION OF FLOW')).toBeLessThan(0.2);
  });

  it('promotes severity when the re-worded copy is the warning', () => {
    const out = dedupeFlags([
      { type: 'info', text: SLEEVE_B },
      { type: 'warn', text: SLEEVE_A },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('warn');
  });
});

describe('dedupeSavings', () => {
  it('reports how much noise was removed', () => {
    const n = { text: 'repeated' };
    expect(dedupeSavings([n, n, n, { text: 'unique' }])).toEqual({ before: 4, after: 2, removed: 2 });
  });
});
