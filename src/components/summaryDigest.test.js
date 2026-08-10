import { describe, it, expect } from 'vitest';
import { isUsefulSummary, digestSummaries } from './summaryDigest.js';

// Verbatim from the 16-sheet 90% design review run, where the joined summary
// ran to several hundred words and most of it said "nothing on this sheet".
const EMPTY = [
  'This sheet contains only BMS/controls narrative and instrument identification legend text, not an equipment schedule table; no schedule rows to extract.',
  'This page contains BMS/SCADA control narrative and instrumentation tagging convention text (referencing EF-10, EF-11, RTU-01 thru RTU-08) with no actual equipment schedule table present, so no scheduled units can be extracted.',
  'This is the mechanical overall plan cover sheet showing general notes, code summary, mechanical legend, abbreviations, and a drawing list, with no equipment tags, air devices, duct runs, or pipe sizes depicted.',
  'This crop shows a blank drawing sheet with only border/margin lines visible, no legible text, tags, or equipment information.',
];
const REAL = [
  'Overall roof plan showing rooftop mechanical equipment layout including RTUs, exhaust fans, a make-up air unit, dehumidification unit, vendor-package heaters, and split system condensing units with associated refrigerant piping to a second level server room.',
  'Enlarged first floor mechanical HVAC plan for Building West showing supply/return/exhaust ductwork, wire mesh screens, and split system connections serving Fire Pump, IDF Closet, and Burn Room areas.',
];

describe('isUsefulSummary', () => {
  it('drops sheets described by what they do NOT carry', () => {
    EMPTY.forEach(s => expect(isUsefulSummary(s), s.slice(0, 45)).toBe(false));
  });

  it('keeps sheets described by what IS on them', () => {
    REAL.forEach(s => expect(isUsefulSummary(s), s.slice(0, 45)).toBe(true));
  });

  it('ignores blanks and fragments', () => {
    expect(isUsefulSummary('')).toBe(false);
    expect(isUsefulSummary('roof plan')).toBe(false); // too short to be a summary
  });
});

describe('digestSummaries', () => {
  it('keeps the informative sheets and counts what it removed', () => {
    const { text, kept, dropped } = digestSummaries([...EMPTY, ...REAL]);
    expect(kept).toBe(2);
    expect(dropped).toBe(4);
    expect(text).toContain('Overall roof plan');
    expect(text).not.toContain('no schedule rows');
  });

  it('collapses the same sheet description repeated per sector', () => {
    const a = 'Overall first floor mechanical plan for the Prolec-GE Waukesha GT-400 expansion in Goldsboro, NC, showing room layout, piping routing through manufacturing spaces, and general notes.';
    const b = 'Overall first floor mechanical plan for the Prolec-GE Waukesha GT-400 Expansion in Goldsboro NC showing room layout and piping routing through manufacturing spaces with general notes.';
    expect(digestSummaries([a, b]).kept).toBe(1);
  });

  it('caps a long set and says how many were left out', () => {
    // Deliberately distinct sheets — near-identical ones would (correctly)
    // collapse before the cap ever applied.
    const subjects = ['supply ductwork and diffusers', 'refrigerant piping risers', 'roof curbs and openings',
      'exhaust fans and wall louvers', 'hydronic mains', 'VAV boxes and reheat coils',
      'condensate drains', 'kitchen hood makeup air', 'boiler room piping', 'chiller yard layout',
      'unit heaters in the warehouse', 'split system linesets', 'dust collection ducting',
      'compressed air headers', 'radiant floor loops', 'cooling tower connections',
      'fire damper locations', 'sound attenuator details', 'stair pressurization fans', 'server room CRAC units'];
    const many = subjects.map((s, i) => `Mechanical plan sheet M-${100 + i} showing ${s} for the east wing.`);
    const { text, kept } = digestSummaries(many);
    expect(kept).toBe(12);
    expect(text).toMatch(/\(\+\d+ more sheets\)$/); // the rest are counted, not printed
  });

  it('returns empty text when every sheet was a blank', () => {
    expect(digestSummaries(EMPTY).text).toBe('');
    expect(digestSummaries()).toEqual({ text: '', kept: 0, dropped: 0 });
  });
});
