import { describe, it, expect } from 'vitest';
import { textPipeRuns, pipeCoverageGap, normalizeService } from './pipeCoverage.js';

// A hydronic/refrigerant sheet's labels, written the way plans write them.
const PIPING = `3/4" HWS 3/4" HWR 1-1/4" HWS 1 1/4" HWR 2" CHWS 2" CHWR 4" CHWS&R
  1 5/8" RS 7/8" RL 3/4" CD 2" NG
  ALL PLENUMS SHALL BE A MINIMUM OF 36" DEEP. BOTTOM OF OPENING MIN 12" ABOVE
  FINISHED FLOOR. MAXIMUM CABLE LENGTH SHALL NOT EXCEED 15'-0".
  8"ø 10"ø 24x12 18x16 O 315 24x48`;

describe('textPipeRuns', () => {
  it('reads size and service off the labels', () => {
    const r = textPipeRuns(PIPING);
    expect(r.get('0.75|HWS')).toMatchObject({ dia: 0.75, service: 'HWS' });
    expect(r.get('1.25|HWR')).toMatchObject({ dia: 1.25 });
    expect(r.get('1.625|RS')).toMatchObject({ dia: 1.625, service: 'RS' });
    expect(r.get('0.875|RL')).toMatchObject({ dia: 0.875 });
  });

  it('reads a hyphenated fraction as the size it is', () => {
    // "1-1/4" used to come back as 1" — wrong size, wrong price, nothing on
    // screen to notice.
    expect(textPipeRuns('1-1/4" HWS').get('1.25|HWS')).toBeTruthy();
    expect(textPipeRuns('2-1/2" CHWS').get('2.5|CHWS')).toBeTruthy();
  });

  it('does not mistake duct, dimensions or elevations for pipe', () => {
    // Every one of these sits on a real mechanical sheet next to real pipe.
    expect(textPipeRuns('8"ø 10"ø 24x12 O 315 24x48').size).toBe(0);
    expect(textPipeRuns('PLENUMS SHALL BE A MINIMUM OF 36" DEEP').size).toBe(0);
    expect(textPipeRuns('BOTTOM OF OPENING MIN 12" ABOVE FINISHED FLOOR').size).toBe(0);
    expect(textPipeRuns("SHALL NOT EXCEED 15'-0\"").size).toBe(0);
  });

  it('stays silent on a duct-only sheet', () => {
    expect(textPipeRuns('20x18 UP/DN 14x14 DN 12x12 8"ø 6"ø J 720 24x12').size).toBe(0);
  });
});

describe('normalizeService', () => {
  it('matches a spelled-out service to its code', () => {
    expect(normalizeService('hot water supply')).toBe('HWS');
    expect(normalizeService('HWS')).toBe('HWS');
    expect(normalizeService('chilled water return')).toBe('CHWR');
    expect(normalizeService('refrigerant suction')).toBe('RS');
    expect(normalizeService('liquid line')).toBe('RL');
    expect(normalizeService('condensate')).toBe('CD');
  });

  it('returns nothing for a blank, which means "not named"', () => {
    expect(normalizeService('')).toBe('');
    expect(normalizeService(null)).toBe('');
  });
});

describe('pipeCoverageGap', () => {
  it('names the runs a thin read missed', () => {
    // The live case: two 3/4" hot water runs came back and nothing else.
    const { flags, missing } = pipeCoverageGap(
      [{ size: '3/4"', service: 'hot water supply' }, { size: '3/4"', service: 'hot water return' }],
      PIPING, 'Page 3');
    expect(missing.length).toBeGreaterThan(5);
    expect(flags).toHaveLength(1);
    expect(flags[0].text).toMatch(/^Page 3: the sheet's own text shows \d+ pipe run\(s\) the read did not return/);
    expect(flags[0].text).toMatch(/1 5\/8" RS|2" CHWS/);
  });

  it('matches a spelled-out service against a coded one', () => {
    const { missing } = pipeCoverageGap(
      [{ size: '3/4"', service: 'hot water supply' }], '3/4" HWS', '');
    expect(missing).toEqual([]);
  });

  it('says nothing when the read covered the piping', () => {
    const runs = [...textPipeRuns(PIPING).values()].map(t => ({ size: `${t.dia}"`, service: t.service }));
    expect(pipeCoverageGap(runs, PIPING, 'Page 3').flags).toEqual([]);
  });

  it('treats an unnamed service as covering that size, rather than crying wolf', () => {
    // The analyzer read the size but left service blank. That is a different
    // defect, already reported elsewhere — not a coverage hole.
    const { missing } = pipeCoverageGap([{ size: '2"', service: '' }], '2" CHWS 2" CHWR', '');
    expect(missing).toEqual([]);
  });

  it('holds its tongue on a single unreported line', () => {
    expect(pipeCoverageGap([], '3/4" HWS', 'Page 3').flags).toEqual([]);
  });

  it('stays quiet on a scanned sheet with no text', () => {
    expect(pipeCoverageGap([], '', 'Page 3').flags).toEqual([]);
    expect(pipeCoverageGap([], '   ', 'Page 3').flags).toEqual([]);
  });
});
