import { describe, it, expect } from 'vitest';
import { flagPage, flagFile, flagVerifyTarget } from './flagSource.js';
import { dedupeFlags } from './flagDedupe.js';
import { resolveCoverageFlags } from './flagCoverage.js';
import { triageFlags } from './flagTriage.js';

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

// ── THE PAGE HAS TO SURVIVE THE PIPELINE ─────────────────────────────────────
// A live set came back with flags and no view buttons. The duct-misread
// warning is raised in Step1 rather than the vision loop, so it never got the
// "Page N:" prefix the recovery relied on — and every scope note the analyzer
// raised from a sheet had no page either. Both now carry it as a FIELD, which
// only helps if nothing downstream drops it.

describe('the page survives every stage between the read and the button', () => {
  const flag = { type: 'warn', source: 'Drawings 3.pdf', page: 12,
    text: 'Duct size "60x3" looks misread (a 3" side isn\'t a real duct dimension). Verify on the plan.' };
  const loaded = () => true;

  it('survives dedupe', () => {
    const [out] = dedupeFlags([flag]);
    expect(flagVerifyTarget(out, loaded)).toEqual({ file: 'Drawings 3.pdf', page: 12 });
  });

  it('survives dedupe when the same note collapses from several sheets', () => {
    const [out] = dedupeFlags([flag, { ...flag, page: 15 }]);
    expect(out.count).toBe(2);
    expect(flagPage(out)).toBe(12); // the first sighting's sheet
  });

  it('survives coverage resolution', () => {
    const [out] = resolveCoverageFlags([flag], []);
    expect(flagPage(out)).toBe(12);
  });

  it('survives triage', () => {
    const { actionable } = triageFlags([flag]);
    expect(flagVerifyTarget(actionable[0], loaded)).toEqual({ file: 'Drawings 3.pdf', page: 12 });
  });

  it('gives a scope note its sheet too', () => {
    // The commonest case: "PROVIDE CEILING ACCESS PANEL FOR FIRE/SMOKE DAMPER
    // ACCESS" is worth far more when you can see where it was written.
    const note = { type: 'warn', source: 'Drawings 3.pdf', page: 4,
      text: 'PROVIDE CEILING ACCESS PANEL FOR FIRE/SMOKE DAMPER ACCESS.' };
    expect(flagVerifyTarget(note, loaded)).toEqual({ file: 'Drawings 3.pdf', page: 4 });
  });
});
