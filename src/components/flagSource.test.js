import { describe, it, expect } from 'vitest';
import { flagPage, flagFile, flagVerifyTarget, flagCircuits, flagScheduleTarget } from './flagSource.js';
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

// ── THE REFRIGERATION SIDE GETS THE BUTTON TOO ───────────────────────────────
// analyzeRedlinePdf stamped pageNum onto field tasks but not onto flags, so a
// refrigeration job's flags never named a page and never offered the button —
// the same defect the HVAC read had, on the other half of the app.

describe('a refrigeration redline flag can open its sheet', () => {
  const loaded = () => true;

  it('offers the target once the page is stamped', () => {
    const flag = { type: 'warn', source: 'Store plan.pdf', page: 5,
      text: 'PROVIDE NEW 3/4" COPPER TO CASE END — FIELD VERIFY ROUTING.' };
    expect(flagVerifyTarget(flag, loaded)).toEqual({ file: 'Store plan.pdf', page: 5 });
  });

  it('survives the same pipeline the HVAC flags go through', () => {
    const flag = { type: 'warn', source: 'Store plan.pdf', page: 5, text: 'PROVIDE NEW CASE END.' };
    expect(flagPage(dedupeFlags([flag])[0])).toBe(5);
    expect(flagPage(triageFlags([flag]).actionable[0] || triageFlags([flag]).scope[0])).toBe(5);
  });
});

// ── A REWORDED FINDING MUST NOT KEEP THE WRONG SHEET ─────────────────────────
// mergeNearDuplicates takes the LONGER wording when the model re-words the same
// note from sheet to sheet, and it used to take the wording alone. A flag first
// seen on page 4 and reworded at greater length on page 9 ended up with page 9's
// text and page 4's page number, so "Show me on page 4" opened a sheet that says
// nothing of the kind — and the red mark, which searches the text layer for the
// flag's own words, had nothing to find.

describe('the wording and the sheet stay the same sighting', () => {
  const loaded = () => true;
  const short = 'Circuit B11 line size is unreadable on this sheet and could not be measured';
  const long = 'Circuit B11 line size is unreadable on this sheet and could not be measured from the drawing';

  it('takes the page of whichever wording it kept', () => {
    const [out] = dedupeFlags([
      { type: 'warn', source: 'plans.pdf', page: 4, text: short },
      { type: 'warn', source: 'plans.pdf', page: 9, text: long },
    ]);
    expect(out.text).toBe(long);
    expect(flagVerifyTarget(out, loaded)).toEqual({ file: 'plans.pdf', page: 9 });
  });

  it('leaves the page alone when the first wording is the fuller one', () => {
    const [out] = dedupeFlags([
      { type: 'warn', source: 'plans.pdf', page: 4, text: long },
      { type: 'warn', source: 'plans.pdf', page: 9, text: short },
    ]);
    expect(out.text).toBe(long);
    expect(flagPage(out)).toBe(4);
  });

  it('takes the document too, when the rewrite came off another file', () => {
    const [out] = dedupeFlags([
      { type: 'warn', source: 'sheet A.pdf', page: 4, text: short },
      { type: 'warn', source: 'sheet B.pdf', page: 9, text: long },
    ]);
    expect(flagVerifyTarget(out, loaded)).toEqual({ file: 'sheet B.pdf', page: 9 });
    // ...and both documents are still listed, because the note is on both.
    expect(out.sources).toEqual(['sheet A.pdf', 'sheet B.pdf']);
  });

  it('still counts both sightings', () => {
    const [out] = dedupeFlags([
      { type: 'warn', source: 'plans.pdf', page: 4, text: short },
      { type: 'warn', source: 'plans.pdf', page: 9, text: long },
    ]);
    expect(out.count).toBe(2);
  });
});

// ── THE SCHEDULE IS THE OTHER HALF OF THE SAME QUESTION ──────────────────────
// Refrigeration has two documents and only the print has pages. The flags off
// the BPR — "these circuits are marked as changed but have NO new line sizes"
// — are about a ROW, so they never carried a page and never offered a button,
// and checking one meant opening the spreadsheet somewhere else and scrolling
// a sixty-row legend.

describe('a BPR flag can open its row', () => {
  const loaded = () => true;
  const flag = {
    type: 'warn', source: 'Legend 2417.xlsx',
    text: '3 circuit(s) are marked as changed but have NO new line sizes — Dairy 4-door; Meat Prep. '
      + 'Check whether these carry new cases to set and connect.',
    circuits: ['B11', 'C6'],
  };

  it('offers the schedule target', () => {
    expect(flagScheduleTarget(flag, loaded))
      .toEqual({ file: 'Legend 2417.xlsx', circuits: ['B11', 'C6'] });
  });

  it('normalises and de-duplicates the ids', () => {
    expect(flagCircuits({ circuits: [' b11 ', 'B11', 'c6', '', null] })).toEqual(['B11', 'C6']);
  });

  // The IDs are carried as a field because the SENTENCE names the application
  // ("Dairy 4-door"), which is not what column 1 of the BPR says. Recovering
  // them from the prose would find nothing here, or the wrong thing.
  it('does not try to read the circuits out of the wording', () => {
    const { circuits, ...noField } = flag;
    expect(flagCircuits(noField)).toEqual([]);
    expect(flagScheduleTarget(noField, loaded)).toBe(null);
  });

  it('offers nothing when the workbook is no longer on the device', () => {
    expect(flagScheduleTarget(flag, () => false)).toBe(null);
  });

  it('offers nothing for an app-raised flag, which has no document', () => {
    expect(flagScheduleTarget({ source: 'System', circuits: ['B11'] }, loaded)).toBe(null);
  });

  it('survives dedupe, coverage resolution and triage', () => {
    expect(flagScheduleTarget(dedupeFlags([flag])[0], loaded)).toBeTruthy();
    expect(flagScheduleTarget(resolveCoverageFlags([flag], [])[0], loaded)).toBeTruthy();
    const t = triageFlags([flag]);
    const seen = [...t.actionable, ...(t.scope || []), ...(t.diagnostics || [])];
    expect(seen.some(f => flagScheduleTarget(f, loaded))).toBe(true);
  });

  it('keeps the page and the schedule apart — a flag is offered the document it is about', () => {
    // A page flag gets no schedule button, and a row flag gets no page button.
    const page = { source: 'plans.pdf', page: 7, text: 'Page 7: verify duct size' };
    expect(flagScheduleTarget(page, loaded)).toBe(null);
    expect(flagVerifyTarget(flag, loaded)).toBe(null);
  });

  it('survives the save and reload a job goes through', () => {
    const back = JSON.parse(JSON.stringify(dedupeFlags([flag])))[0];
    expect(flagScheduleTarget(back, loaded))
      .toEqual({ file: 'Legend 2417.xlsx', circuits: ['B11', 'C6'] });
  });
});
