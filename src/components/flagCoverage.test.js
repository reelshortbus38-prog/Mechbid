import { describe, it, expect } from 'vitest';
import { isCoverageFlag, extractFlagTags, resolveCoverageFlags } from './flagCoverage.js';
import { flagCategory, triageFlags } from './flagTriage.js';

// Every string below is verbatim from a live run on the industrial set.
const NARRATIVE_EF = 'Referenced exhaust fan tags EF-01, EF-02, EF-04, EF-05, EF-08 appear only within sequence-of-operation narrative text, not as rows in a schedule table with size/model/CFM/electrical data, so they cannot be extracted as scheduled equipment from this page.';
const NARRATIVE_MIXED = 'Referenced equipment tags mentioned in narrative (RTU, MAU, EF-03, EF-06, EF-07, EF-09, EF-15, VAV terminal units) have no associated schedule data (model, size, cfm, electrical) on this page and cannot be extracted as scheduled units.';
const VRF_RANGE = 'VRF-01 thru VRF-06 and SSCU-04 share a sequence of operation section; individual unit sizes/models/CFM/electrical not provided in this text extract.';
const LEL = 'Room LEL sensors mentioned for gas detection interlock with exhaust fans; not a scheduled equipment tag.';
const SCOPE = 'PROVIDE 4" THICK CONCRETE HOUSEKEEPING PADS FOR EQUIPMENT INSTALLED ON FLOORS OR ON GRADE.';

const unit = tag => ({ tag, model: 'GEN-100' });

describe('isCoverageFlag', () => {
  it('recognizes the analyzer saying it saw a tag it could not schedule', () => {
    [NARRATIVE_EF, NARRATIVE_MIXED, VRF_RANGE, LEL].forEach(t =>
      expect(isCoverageFlag(t), t.slice(0, 40)).toBe(true));
  });

  it('leaves real scope alone', () => {
    expect(isCoverageFlag(SCOPE)).toBe(false);
    expect(isCoverageFlag('VAV schedule table is cut off/truncated after VAV-M235A rows.')).toBe(false);
    expect(isCoverageFlag('')).toBe(false);
  });
});

describe('extractFlagTags', () => {
  it('pulls the tags out of a sentence', () => {
    expect(extractFlagTags(NARRATIVE_EF)).toEqual(['EF-01', 'EF-02', 'EF-04', 'EF-05', 'EF-08']);
  });

  it('expands a range written into prose', () => {
    expect(extractFlagTags(VRF_RANGE)).toEqual(
      ['VRF-01', 'VRF-02', 'VRF-03', 'VRF-04', 'VRF-05', 'VRF-06', 'SSCU-04']);
  });

  it('skips bare class names that carry no unit number', () => {
    // "RTU", "MAU" and "VAV terminal units" have nothing to look up.
    expect(extractFlagTags(NARRATIVE_MIXED)).toEqual(['EF-03', 'EF-06', 'EF-07', 'EF-09', 'EF-15']);
  });

  it('does not mistake sheet ids or model numbers for tags', () => {
    expect(extractFlagTags('Match lines (M1.00, M1.05) reference other sheets')).toEqual([]);
    expect(extractFlagTags('keynotes 15 and 16 apply')).toEqual([]);
  });
});

describe('resolveCoverageFlags', () => {
  it('silences a page-note whose tags the schedule already carried', () => {
    // The normal case in a real set: the plan sheet only names EF-01…EF-08 in
    // a control narrative, and the schedule sheet three pages later has them.
    const equipment = ['EF-01', 'EF-02', 'EF-04', 'EF-05', 'EF-08'].map(unit);
    const out = resolveCoverageFlags([{ text: NARRATIVE_EF }], equipment);
    expect(out).toHaveLength(1);
    expect(flagCategory(out[0])).toBe('diagnostic');
    expect(triageFlags(out).actionable).toHaveLength(0);
  });

  it('matches padded against unpadded tags', () => {
    const out = resolveCoverageFlags([{ text: NARRATIVE_EF }], ['EF-1', 'EF-2', 'EF-4', 'EF-5', 'EF-8'].map(unit));
    expect(out.filter(f => f.type === 'warn')).toHaveLength(0);
  });

  it('raises ONE warning naming only the tags nothing scheduled', () => {
    const equipment = ['EF-01', 'EF-02', 'EF-04', 'EF-05'].map(unit); // EF-08 never scheduled
    const out = resolveCoverageFlags([{ text: NARRATIVE_EF }], equipment);
    const warns = out.filter(f => f.type === 'warn');
    expect(warns).toHaveLength(1);
    expect(warns[0].text).toContain('EF-08');
    expect(warns[0].text).not.toContain('EF-01'); // covered tags stay out of it
    expect(flagCategory(warns[0])).toBe('scope'); // must reach the estimator
  });

  it('pools gaps from several pages into a single line', () => {
    const out = resolveCoverageFlags(
      [{ text: NARRATIVE_EF }, { text: NARRATIVE_MIXED }, { text: VRF_RANGE }],
      [], // nothing scheduled at all
    );
    const warns = out.filter(f => f.type === 'warn');
    expect(warns).toHaveLength(1);
    expect(warns[0].text).toMatch(/EF-01/);
    expect(warns[0].text).toMatch(/VRF-06/);
    expect(warns[0].text).toMatch(/SSCU-04/);
    expect(warns[0].text).toMatch(/missing schedule sheet/);
  });

  it('counts a tag named on two pages once', () => {
    const out = resolveCoverageFlags([{ text: NARRATIVE_EF }, { text: NARRATIVE_EF }], []);
    const warns = out.filter(f => f.type === 'warn');
    expect(warns[0].text).toMatch(/^5 equipment tag/);
  });

  it('demotes a tagless coverage note without inventing a gap', () => {
    const out = resolveCoverageFlags([{ text: LEL }], []);
    expect(out.filter(f => f.type === 'warn')).toHaveLength(0);
    expect(flagCategory(out[0])).toBe('diagnostic');
  });

  it('passes scope through untouched', () => {
    const out = resolveCoverageFlags([{ text: SCOPE, type: 'warn' }], []);
    expect(out).toHaveLength(1);
    expect(out[0].category).toBeUndefined();
    expect(flagCategory(out[0])).toBe('scope');
  });

  it('handles no flags and no equipment', () => {
    expect(resolveCoverageFlags()).toEqual([]);
    expect(resolveCoverageFlags([null, undefined])).toEqual([]);
  });
});

describe('the sheet-description noise from the same run', () => {
  it('demotes the analyzer describing what a sheet was not', () => {
    const d = [
      'This document is a drawing sheet (Enlarged First Floor Plan - Building East High Bay, M1.03), not spec text; contains ductwork sizes, CFM values, VD (volume dampers), VRF units, sound attenuators, and room labels rather than equipment specification narrative.',
      'No furnished-by, warranty, T&B, or contact information present in extracted text; content is schedule/plan tabular data (duct sizes, CFM, bottom-of-duct elevations) not spec language.',
      'RTU referenced with hot gas reheat and indirect fired gas heating coil, but no RTU tag number legible in this text segment.',
    ];
    d.forEach(t => expect(flagCategory(t), t.slice(0, 40)).toBe('diagnostic'));
  });
});
