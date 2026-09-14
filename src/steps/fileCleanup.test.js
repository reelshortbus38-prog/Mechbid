import { describe, it, expect } from 'vitest';
import { withoutFile, removalNote } from './fileCleanup.js';
import { mergeFacts, newFact } from '../api/jobFacts.js';

const fact = (sheet, subject, value) => newFact('fluidPct', subject, value, { sheet });
const flag = (source, text = 'something') => ({ type: 'warn', text, source });

describe('withoutFile', () => {
  const job = {
    jobFacts: [fact('M0.1.pdf', 'HP-1', 25), fact('Spec.pdf', 'MU-1', 20), fact('M0.1.pdf', 'HP-2', 25)],
    flags: [flag('M0.1.pdf', 'deck height 24 ft'), flag('SOW.pdf', 'night work'), { type: 'info', source: 'System', text: 'x' }],
  };

  it('takes the removed sheet out of the cross-sheet ledger', () => {
    // A fact whose sheet is gone is still COMPARED, so the app raises a
    // conflict between a live drawing and a document that was deleted.
    const out = withoutFile(job, 'M0.1.pdf');
    expect(out.jobFacts).toHaveLength(1);
    expect(out.jobFacts[0].sheet).toBe('Spec.pdf');
  });

  it('takes that file’s flags with it', () => {
    // "SOW.pdf requires night work" is not useful once SOW.pdf is gone and
    // nobody can open it to check.
    const out = withoutFile(job, 'SOW.pdf');
    expect(out.flags.map(f => f.source)).toEqual(['M0.1.pdf', 'System']);
  });

  it('leaves every other sheet completely alone', () => {
    const out = withoutFile(job, 'M0.1.pdf');
    expect(out.flags.map(f => f.source)).toEqual(['SOW.pdf', 'System']);
    expect(out.jobFacts.every(f => f.sheet === 'Spec.pdf')).toBe(true);
  });

  it('does not touch a flag the app raised about itself', () => {
    // source 'System' is the app talking, not a document.
    const out = withoutFile(job, 'System');
    expect(out.flags).toHaveLength(2);
    expect(out.flags.some(f => f.source === 'System')).toBe(false);
    // (and that is why nothing ever calls it with 'System')
  });

  it('counts what it removed rather than doing it silently', () => {
    // Removing a file takes warnings off the screen. The estimator should see
    // that happen, not fail to find them later.
    const out = withoutFile(job, 'M0.1.pdf');
    expect(out.dropped).toEqual({ facts: 2, flags: 1 });
  });

  it('changes nothing for a file that contributed nothing', () => {
    const out = withoutFile(job, 'Photo.jpg');
    expect(out.jobFacts).toHaveLength(3);
    expect(out.flags).toHaveLength(3);
    expect(out.dropped).toEqual({ facts: 0, flags: 0 });
  });

  it('refuses to match on a blank name and wipe the job', () => {
    // The dangerous input. A file row with no name must not take every fact
    // whose sheet is also blank — or worse, look like a match for everything.
    const out = withoutFile(job, '');
    expect(out.jobFacts).toHaveLength(3);
    expect(out.flags).toHaveLength(3);
    expect(out.dropped).toEqual({ facts: 0, flags: 0 });
  });

  it('is empty rather than broken on a job with neither', () => {
    expect(withoutFile({}, 'x')).toEqual({ jobFacts: [], flags: [], dropped: { facts: 0, flags: 0 } });
    expect(withoutFile(undefined, 'x').jobFacts).toEqual([]);
  });

  it('ignores stray whitespace on either side of the name', () => {
    // newFact trims on the way in, so this is built raw — the padded value has
    // to come from somewhere that did not.
    const padded = { kind: 'fluidPct', subject: 'HP-1', value: 25, sheet: ' M0.1.pdf ' };
    const out = withoutFile({ jobFacts: [padded], flags: [{ type: 'warn', source: ' M0.1.pdf ' }] }, 'M0.1.pdf');
    expect(out.jobFacts).toHaveLength(0);
    expect(out.flags).toHaveLength(0);
  });
});

// ── THE RE-ISSUE, WHICH IS THE COMMON CASE ──────────────────────────────────
describe('a drawing revision', () => {
  it('no longer leaves rev A arguing with rev B', () => {
    // Delete "M0.1.pdf", upload "M0.1 REV B.pdf". mergeFacts replaces by sheet
    // NAME, so a new name is a new sheet — both revisions sat in the ledger
    // together and disagreed with each other, and the app reported a conflict
    // it had invented out of its own bookkeeping.
    let ledger = mergeFacts([], 'M0.1.pdf', [fact('', 'HP-1', 25)]);
    // The estimator removes rev A...
    const cleaned = withoutFile({ jobFacts: ledger, flags: [] }, 'M0.1.pdf');
    // ...and uploads rev B, which read the same subject differently.
    ledger = mergeFacts(cleaned.jobFacts, 'M0.1 REV B.pdf', [fact('', 'HP-1', 30)]);

    const forHp1 = ledger.filter(f => f.subject === 'HP-1');
    expect(forHp1).toHaveLength(1);
    expect(forHp1[0].value).toBe(30);
    expect(forHp1[0].sheet).toBe('M0.1 REV B.pdf');
  });

  it('still catches a REAL disagreement between two live sheets', () => {
    // The cleanup must not be so eager that it stops the ledger doing its job.
    const ledger = mergeFacts(
      mergeFacts([], 'Equip.pdf', [fact('', 'HP-1', 25)]),
      'Specialties.pdf', [fact('', 'HP-1', 20)],
    );
    const out = withoutFile({ jobFacts: ledger, flags: [] }, 'SomethingElse.pdf');
    expect(out.jobFacts.filter(f => f.subject === 'HP-1')).toHaveLength(2);
  });
});

describe('removalNote', () => {
  it('says what went and from where', () => {
    const note = removalNote('M0.1.pdf', { facts: 2, flags: 1 });
    expect(note).toContain('M0.1.pdf');
    expect(note).toContain('1 flag');
    expect(note).toContain('2 cross-sheet facts');
  });

  it('promises that accepted work is untouched, because that is the fear', () => {
    // A remove button that quietly deleted priced takeoff would be far worse
    // than the bug this fixes.
    expect(removalNote('x.pdf', { facts: 1, flags: 0 })).toMatch(/already accepted into the takeoff stays/);
  });

  it('gets the singulars right', () => {
    expect(removalNote('x.pdf', { facts: 1, flags: 1 })).toContain('1 flag and 1 cross-sheet fact');
    expect(removalNote('x.pdf', { facts: 0, flags: 2 })).toContain('2 flags');
    expect(removalNote('x.pdf', { facts: 0, flags: 2 })).not.toContain('fact');
  });

  it('says nothing at all when nothing went', () => {
    // Most removals. A note every time would train him to ignore it.
    expect(removalNote('x.pdf', { facts: 0, flags: 0 })).toBe(null);
    expect(removalNote('x.pdf', undefined)).toBe(null);
  });
});
