import { describe, it, expect } from 'vitest';
import {
  checkUploadSize, partitionBySize, limitFor, fmtSize, uploadGuidance,
  POSTED_WHOLE_MAX, RENDERED_MAX,
} from './uploadLimits.js';
import { REFRIG_MAX_PAGES, HVAC_TEXT_MAX_PAGES, HVAC_VISION_MAX_SHEETS } from '../api/pdfRender.js';

const MB = 1024 * 1024;

describe('the two ceilings, and why they differ', () => {
  it('holds spreadsheets and documents to what a function will accept', () => {
    // These are base64'd and POSTed whole, and base64 costs a third on top.
    for (const t of ['excel', 'xls', 'scope', 'email']) {
      expect(limitFor(t), t).toBe(POSTED_WHOLE_MAX);
    }
    // The ceiling has to leave room for the encoding, or the check passes and
    // the request still bounces.
    expect(POSTED_WHOLE_MAX * (4 / 3)).toBeLessThan(4.5 * MB);
  });

  it('lets plans and photos be far bigger, because they never go up whole', () => {
    // pdf.js rasterises in the browser; only page images travel.
    for (const t of ['pdf', 'image', 'cad', 'other']) {
      expect(limitFor(t), t).toBe(RENDERED_MAX);
    }
    expect(RENDERED_MAX).toBeGreaterThan(POSTED_WHOLE_MAX * 10);
  });
});

describe('a file that is too big', () => {
  it('accepts the sizes a real job actually carries', () => {
    // A BPR, a scope doc and a bid email are all well inside.
    expect(checkUploadSize({ name: 'FL_0701_BPR.xlsx', size: 380 * 1024, type: 'excel' })).toBe(null);
    expect(checkUploadSize({ name: '1086 Rough Draft.docx', size: 1.2 * MB, type: 'scope' })).toBe(null);
    expect(checkUploadSize({ name: 'Drawings.pdf', size: 60 * MB, type: 'pdf' })).toBe(null);
  });

  it('stops a spreadsheet the server would refuse anyway', () => {
    const r = checkUploadSize({ name: 'Scanned BPR.xlsx', size: 9 * MB, type: 'excel' });
    expect(r).toBeTruthy();
    expect(r.message).toContain('9 MB');
    expect(r.message).toContain('3.3 MB');
  });

  it('tells somebody what to DO about it, not just that it failed', () => {
    // A person with a file they still need read is not helped by "too large".
    const doc = checkUploadSize({ name: 'Scope.docx', size: 9 * MB, type: 'scope' });
    expect(doc.message).toMatch(/export it as a PDF/i);
    const plan = checkUploadSize({ name: 'Full Set.pdf', size: 300 * MB, type: 'pdf' });
    expect(plan.message).toMatch(/export just the refrigeration or mechanical/i);
  });

  it('names the file, because a batch upload rejects one of eight', () => {
    expect(checkUploadSize({ name: 'Rack D.xlsx', size: 9 * MB, type: 'excel' }).message)
      .toMatch(/^Rack D\.xlsx/);
  });

  it('survives a file with nothing known about it', () => {
    expect(checkUploadSize()).toBe(null);
    expect(checkUploadSize({})).toBe(null);
    expect(checkUploadSize({ size: 'not a number', type: 'excel' })).toBe(null);
  });
});

describe('one bad file does not stop the rest', () => {
  it('takes the seven and reports the one', () => {
    const { accepted, rejected } = partitionBySize([
      { name: 'BPR.xlsx', size: 300 * 1024, type: 'excel' },
      { name: 'Huge.xlsx', size: 40 * MB, type: 'excel' },
      { name: 'Plans.pdf', size: 55 * MB, type: 'pdf' },
    ]);
    expect(accepted.map(f => f.name)).toEqual(['BPR.xlsx', 'Plans.pdf']);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].name).toBe('Huge.xlsx');
  });

  it('survives an empty or missing batch', () => {
    expect(partitionBySize([])).toEqual({ accepted: [], rejected: [] });
    expect(partitionBySize()).toEqual({ accepted: [], rejected: [] });
  });
});

describe('sizes read the way a person would say them', () => {
  it('uses MB above a megabyte and KB below', () => {
    expect(fmtSize(9 * MB)).toBe('9 MB');
    expect(fmtSize(380 * 1024)).toBe('380 KB');
  });

  it('never says 0 KB for a small but real file', () => {
    expect(fmtSize(200)).toBe('1 KB');
  });

  it('drops a trailing zero on a round limit', () => {
    // "120.0 MB" reads as a measurement; "120 MB" reads as a limit.
    expect(fmtSize(120 * MB)).toBe('120 MB');
    expect(fmtSize(4.5 * MB)).toBe('4.5 MB');
  });
});

describe('telling a customer the limit before they upload', () => {
  // The instinct is to drag a whole 120-sheet issued set in. The app reads a
  // bounded number and the rest is simply absent from the takeoff, so this has
  // to be said on the upload screen — afterwards the minutes are spent and the
  // number on screen is already short.
  const REAL = { refrigPages: REFRIG_MAX_PAGES, hvacTextPages: HVAC_TEXT_MAX_PAGES, hvacVisionSheets: HVAC_VISION_MAX_SHEETS };

  it('quotes the number the refrigeration reader actually enforces', () => {
    const g = uploadGuidance('Commercial Refrigeration', REAL);
    expect(g.headline).toContain(String(REFRIG_MAX_PAGES));
    expect(g.detail).toContain(`${REFRIG_MAX_PAGES} pages deep`);
  });

  it('quotes the numbers the HVAC reader actually enforces', () => {
    const g = uploadGuidance('Commercial HVAC', REAL);
    expect(g.headline).toContain(String(HVAC_VISION_MAX_SHEETS));
    expect(g.detail).toContain(String(HVAC_TEXT_MAX_PAGES));
    expect(g.detail).toContain(String(HVAC_VISION_MAX_SHEETS));
  });

  it('is derived from the readers, never retyped', () => {
    // If somebody raises a limit in pdfRender.js and this note keeps the old
    // number, the app is lying to a customer about what it will read. Feeding
    // it different numbers must change what it says.
    const g = uploadGuidance('Commercial Refrigeration', { ...REAL, refrigPages: 99 });
    expect(g.headline).toContain('99');
    expect(g.headline).not.toContain(String(REFRIG_MAX_PAGES));
  });

  it('treats residential as HVAC, since that is the reader it uses', () => {
    expect(uploadGuidance('Residential HVAC', REAL).headline)
      .toBe(uploadGuidance('Commercial HVAC', REAL).headline);
  });

  it('says what to do instead of dropping the whole set in', () => {
    expect(uploadGuidance('Commercial Refrigeration', REAL).detail).toMatch(/pull out the refrigeration/i);
    expect(uploadGuidance('Commercial HVAC', REAL).detail).toMatch(/M-series/);
  });

  it('says splitting a set costs nothing, because people assume it does', () => {
    const g = uploadGuidance('Commercial Refrigeration', REAL);
    expect(g.split).toMatch(/adds to the same takeoff/i);
  });

  it('states both size ceilings in the units a person reads', () => {
    const g = uploadGuidance('Commercial Refrigeration', REAL);
    expect(g.sizes).toContain(fmtSize(POSTED_WHOLE_MAX));
    expect(g.sizes).toContain(fmtSize(RENDERED_MAX));
  });

  it('still produces a usable note with no arguments at all', () => {
    const g = uploadGuidance();
    expect(g.headline).toBeTruthy();
    expect(g.detail).toBeTruthy();
    expect(g.sizes).toBeTruthy();
  });
});
