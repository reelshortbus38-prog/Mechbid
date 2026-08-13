import { describe, it, expect } from 'vitest';
import { flagPage, flagFile, flagVerifyTarget } from './flagSource.js';

// Flag wording here is verbatim from live runs — the page is written into the
// sentence, which is fine to read and useless to a button.

describe('flagPage', () => {
  it('recovers the page from the wording the analyzers already use', () => {
    expect(flagPage({ text: 'Page 7: duct size "32x0" looks misread — verify on the plan.' })).toBe(7);
    expect(flagPage({ text: 'Page 12 cross-check: a second AI model also saw equipment tag "EF-3"' })).toBe(12);
    expect(flagPage({ text: 'Page 4: the primary AI read failed and this was read by the backup model' })).toBe(4);
  });

  it('prefers an explicit field over the sentence', () => {
    expect(flagPage({ page: 9, text: 'Page 2: something' })).toBe(9);
  });

  it('returns null when no sheet is named', () => {
    expect(flagPage({ text: 'PROVIDE WIRE MESH SCREEN AT THE END OF THE RETURN DUCT.' })).toBeNull();
    expect(flagPage({ text: '' })).toBeNull();
    expect(flagPage(null)).toBeNull();
  });

  it('accepts a bare string flag', () => {
    expect(flagPage('Page 3: something happened')).toBe(3);
  });
});

describe('flagFile', () => {
  it('names the document', () => {
    expect(flagFile({ source: 'Drawings_5.pdf' })).toBe('Drawings_5.pdf');
  });

  it('treats an app-raised flag as belonging to no file', () => {
    // "System" flags are the app talking about the run, not about a sheet.
    expect(flagFile({ source: 'System' })).toBeNull();
    expect(flagFile({})).toBeNull();
  });
});

describe('flagVerifyTarget', () => {
  const loaded = name => name === 'set.pdf';

  it('offers a target when the page AND the file are both known', () => {
    expect(flagVerifyTarget({ source: 'set.pdf', text: 'Page 7: misread' }, loaded))
      .toEqual({ file: 'set.pdf', page: 7 });
  });

  it('offers nothing when the file is no longer loaded', () => {
    // After a reload the PDF is gone. No button beats a button that opens
    // nothing.
    expect(flagVerifyTarget({ source: 'old.pdf', text: 'Page 7: misread' }, loaded)).toBeNull();
  });

  it('offers nothing when no page is named', () => {
    expect(flagVerifyTarget({ source: 'set.pdf', text: 'PROVIDE SLEEVE AND SEAL' }, loaded)).toBeNull();
  });

  it('offers nothing for a System flag, which has no sheet to open', () => {
    expect(flagVerifyTarget({ source: 'System', text: 'Page 7: something' }, loaded)).toBeNull();
  });

  it('defaults to offering nothing when availability is unknown', () => {
    expect(flagVerifyTarget({ source: 'set.pdf', text: 'Page 7: misread' })).toBeNull();
  });
});
