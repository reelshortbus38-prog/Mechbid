import { describe, it, expect } from 'vitest';
import { flagCategory, triageFlags } from './flagTriage.js';
import { backupModelFlag } from '../api/ai.js';
import { dedupeFlags } from './flagDedupe.js';

// Every string here is verbatim from a live run on the industrial set. The
// point of the split: a correct extraction should read like a takeoff, not
// like a list of problems.

describe('flagCategory — diagnostics (the analyzer describing itself)', () => {
  it('demotes "this sheet had nothing to extract" in its many phrasings', () => {
    const d = [
      'This page contains only BMS/controls legend, instrument identification letters, and general sequence-of-operation notes (e.g., for EF-01, EF-02) - no actual equipment schedule table with sizes, models, or CFM data is present on this sheet.',
      'No extractable equipment rows found on this page; equipment schedules likely appear on other sheets in this document set (e.g., M0.01 or similar).',
      'This sheet (M0.02) contains only sequence of operations / control narrative text for RTU, MAU, exhaust fan, and VAV terminal unit systems, not an equipment schedule table, so no individual scheduled units could be extracted.',
      'No tonnage, CFM, model numbers, or electrical characteristics could be extracted for any unit because this excerpt contains only narrative control sequence text, not schedule table data.',
      'Sheet also includes Piping Systems Insulation Schedule and Duct Systems Insulation Schedule (non-equipment, spec-level tables) - not itemized as equipment.',
    ];
    d.forEach(t => expect(flagCategory(t), t.slice(0, 40)).toBe('diagnostic'));
  });

  it('demotes narrative-mention and sheet-type commentary', () => {
    expect(flagCategory('Referenced equipment tags found in sequence of operation text (not schedule rows): EF-10, EF-11, RTU-01 through RTU-08.')).toBe('diagnostic');
    expect(flagCategory('Text references LEL room sensors and room-by-room zoning but these are not separate scheduled equipment.')).toBe('diagnostic');
    expect(flagCategory('This document is a mechanical floor plan drawing (Enlarged First Floor Plan), not a specification section.')).toBe('diagnostic');
    expect(flagCategory('Match lines/callouts (M1.00, M1.05, M1.06) reference other sheets for detailed mechanical layout not shown here.')).toBe('diagnostic');
  });

  it('demotes the app\'s own process telemetry', () => {
    expect(flagCategory('Read as a mechanical set: 1 schedule sheet(s) + 2 spec/notes page(s) analyzed as text, 6 drawing sheet(s) read by vision (pages 1, 3, 4, 5, 6, 7).')).toBe('diagnostic');
    expect(flagCategory('HVAC takeoff [M0.01 — MECHANICAL OVERALL PLAN]: 48 unit(s) · 8 air device type(s) · 67,640 CFM total')).toBe('diagnostic');
    expect(flagCategory('Drawing scale detected (page 1: 30 ft/in, page 6: 21.333 ft/in) — a calibrated scale bar was stamped on the renders.')).toBe('diagnostic');
    expect(flagCategory('Page 7 cross-check: a second AI model also saw equipment tag "EF-3" that the primary read didn\'t — verify on the plan')).toBe('diagnostic');
  });
});

describe('flagCategory — what must stay visible', () => {
  it('keeps scope: work the contractor prices or performs', () => {
    const scope = [
      'PROVIDE WIRE MESH SCREEN AND BALANCING DAMPER AT THE END OF EXHAUST AIR DUCT AT 18\' FROM FFL.',
      'Provide sound attenuator in supply air duct and return air duct per keynotes 15 and 16',
      'PROVIDE 4" THICK CONCRETE HOUSEKEEPING PADS FOR EQUIPMENT INSTALLED ON FLOORS OR ON GRADE.',
      'Contractor to provide sleeve and seal openings for ductwork/piping penetrating partitions above ceiling',
      'CONNECT CONDENSATE DRAIN TO NEAREST HUB DRAIN.',
      'FOR ALL EXTERIOR WALL/ROOF PENETRATIONS, COORDINATE WITH ARCHITECTURAL DRAWINGS.',
    ];
    scope.forEach(t => expect(flagCategory(t), t.slice(0, 40)).toBe('scope'));
  });

  it('never demotes completeness or money warnings, even when they read like commentary', () => {
    // These match diagnostic-ish wording but change whether the NUMBERS are good.
    expect(flagCategory('VAV schedule table is cut off/truncated in source text after VAV-M235A rows; additional VAV units may exist beyond this excerpt.')).toBe('scope');
    expect(flagCategory('Source text is heavily garbled/duplicated OCR from a sequence-of-operations narrative, not a clean tabular equipment schedule.')).toBe('scope');
    expect(flagCategory('MAU (VENDOR PACKAGE) and Exhaust Fan (VENDOR PACKAGE) noted for Paint Booth/Weld Room area')).toBe('scope');
    expect(flagCategory('Mini split ACU/CU pairs are listed under Add Alt #3 per schedule note 7')).toBe('scope');
    expect(flagCategory('Duct size "40x0" looks misread — likely a dropped digit. Verify on the plan.')).toBe('scope');
    expect(flagCategory('90 plan-read duplicate(s) suppressed — these tags also have a schedule row')).toBe('scope');
    expect(flagCategory('Schedule part 4 of 7 failed (API error) — re-run to fill it in')).toBe('scope');
  });

  it('keeps unrecognized notes visible rather than hiding them', () => {
    expect(flagCategory('DUCTWORK ELBOWS SHALL BE LONG RADIUS OR SQUARE THROAT PER SMACNA STANDARDS.')).toBe('note');
    expect(flagCategory('Approved manufacturers for roof hoods: Cook, Pennbarry.')).toBe('note');
    expect(flagCategory('Design firm: DG Architectural, NC Registration No. P-0477')).toBe('note');
  });
});

describe('backupModelFlag', () => {
  it('says nothing when the primary model answered', () => {
    expect(backupModelFlag(null, 'Page 3', 'set.pdf')).toEqual([]);
    expect(backupModelFlag(undefined, 'Page 3', 'set.pdf')).toEqual([]);
  });

  it('names the sheet and the model, and survives triage as actionable', () => {
    const [f] = backupModelFlag('gpt-4o', 'Page 3', 'Drawings_5.pdf');
    expect(f.type).toBe('warn');
    expect(f.source).toBe('Drawings_5.pdf');
    expect(f.text).toMatch(/gpt-4o/);
    expect(f.text).toMatch(/re-run/);
    // The whole point is that the estimator SEES it — a backup read hidden in
    // the diagnostics drawer is the same as no warning at all.
    expect(flagCategory(f)).toBe('scope');
    expect(triageFlags([f]).diagnostics).toHaveLength(0);
  });

  it('collapses to one line when several pages fell back', () => {
    const flags = [3, 4, 9].flatMap(p => backupModelFlag('gpt-4o', `Page ${p}`, 'set.pdf'));
    const out = dedupeFlags(flags);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(3);
  });
});

describe('triageFlags', () => {
  it('separates the transcript from the takeoff, scope first', () => {
    const flags = [
      { text: 'Read as a mechanical set: 6 drawing sheet(s) read by vision' },
      { text: 'DUCTWORK ELBOWS SHALL BE LONG RADIUS PER SMACNA.' },
      { text: 'PROVIDE WIRE MESH SCREEN AT THE END OF THE RETURN DUCT.' },
      { text: 'No extractable equipment rows found on this page' },
    ];
    const { actionable, diagnostics, scope, notes } = triageFlags(flags);
    expect(diagnostics).toHaveLength(2);
    expect(scope).toHaveLength(1);
    expect(notes).toHaveLength(1);
    expect(actionable[0].text).toMatch(/WIRE MESH/); // scope ahead of reference notes
  });

  it('handles bare strings, empties and no input', () => {
    expect(triageFlags(['PROVIDE a thing', null, undefined]).scope).toHaveLength(1);
    expect(triageFlags().actionable).toEqual([]);
  });
});
