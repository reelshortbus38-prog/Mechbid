import { describe, it, expect } from 'vitest';
import {
  checkUploadSize, partitionBySize, limitFor, fmtSize,
  POSTED_WHOLE_MAX, RENDERED_MAX,
} from './uploadLimits.js';

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
    expect(r.message).toContain('9.0 MB');
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
    expect(fmtSize(9 * MB)).toBe('9.0 MB');
    expect(fmtSize(380 * 1024)).toBe('380 KB');
  });

  it('never says 0 KB for a small but real file', () => {
    expect(fmtSize(200)).toBe('1 KB');
  });
});
