import { describe, it, expect } from 'vitest';
import {
  auditText, auditDocuments, auditFlags, contradictedTerms, riskSummary, excerpt, RISKS,
} from './riskAudit.js';
import { DEFAULT_PROPOSAL_TERMS } from './proposalTerms.js';

const keys = f => f.map(x => x.key).sort();
const find = (f, k) => f.find(x => x.key === k);

describe('what the documents require', () => {
  it('finds night work in the wording a spec actually uses', () => {
    for (const line of [
      'All work shall be performed after store closing.',
      'Contractor shall schedule night work to avoid disruption to store operations.',
      'Installation to occur outside normal business hours.',
      'Work hours are 10 PM to 6 AM.',
      'Second shift work is required for the sales floor portion.',
    ]) {
      expect(keys(auditText(line)), line).toContain('nightWork');
    }
  });

  it('finds phasing', () => {
    for (const line of [
      'The work shall be completed in three phases as shown on the phasing plan.',
      'Phase 1 includes the low temp rack and associated cases.',
      'Refer to the sequence of work on sheet M0.1.',
    ]) {
      expect(keys(auditText(line)), line).toContain('phasing');
    }
  });

  it('finds a live store', () => {
    const f = auditText('The store will remain open to customers throughout construction.');
    expect(keys(f)).toContain('occupied');
  });

  it('finds height', () => {
    for (const line of [
      'Deck height is approximately 24 feet above finished floor.',
      'Piping to be installed at 18\' above finished floor.',
      'A boom lift will be required for the main runs.',
    ]) {
      expect(keys(auditText(line)), line).toContain('height');
    }
  });

  it('finds the pressure test that costs a day', () => {
    for (const line of [
      'System shall hold a 24 hour standing pressure test with dry nitrogen.',
      'Evacuate to 500 microns and hold.',
      'Perform nitrogen hold per manufacturer requirements.',
    ]) {
      expect(keys(auditText(line)), line).toContain('pressureTest');
    }
  });

  it('finds CO2 and K65', () => {
    expect(keys(auditText('Refrigerant piping shall be K65 copper-iron alloy.'))).toContain('specialtyAlloy');
    expect(keys(auditText('The system is a CO2 transcritical booster rack.'))).toContain('specialtyAlloy');
  });

  it('finds the commercial conditions too', () => {
    expect(keys(auditText('This project is subject to prevailing wage rates.'))).toContain('wage');
    expect(keys(auditText('Liquidated damages of $2,500 per calendar day of delay apply.'))).toContain('liquidatedDamages');
    expect(keys(auditText('All personnel require background checks prior to badging.'))).toContain('badging');
    expect(keys(auditText('Temporary dust barriers shall be erected at the work area.'))).toContain('barriers');
  });
});

// ── THE PART THAT DECIDES WHETHER ANYBODY KEEPS USING IT ────────────────────
// A detector that fires on every panel schedule gets switched off, and then it
// catches nothing at all. These are the phrases this trade actually writes
// that must NOT raise a flag.
describe('what must never fire', () => {
  it('does not call a compressor nameplate a phased job', () => {
    // The single biggest false positive available. Every schedule says this.
    for (const line of [
      'Compressor: 208V, 3 phase, 60 Hz.',
      'Provide 3-phase power to the rack.',
      'Single phase 115V for the condensate pump.',
      'Install phase monitor at the disconnect.',
      'Phase loss protection required.',
    ]) {
      expect(keys(auditText(line)), line).not.toContain('phasing');
    }
  });

  it('does not call a pipe fitting union labor', () => {
    // A union is a fitting, bought by the box.
    for (const line of [
      'Provide dielectric union at each connection.',
      'Furnish ground joint union on the gas line.',
      'Brass union at the coil.',
    ]) {
      expect(keys(auditText(line)), line).not.toContain('wage');
    }
  });

  it('does not call overnight shipping night work', () => {
    expect(keys(auditText('Overnight ship the replacement compressor.'))).not.toContain('nightWork');
    expect(keys(auditText('Parts to be sent overnight courier.'))).not.toContain('nightWork');
  });

  it('does not call a 12 ft stick of pipe a height problem', () => {
    // Everything in this trade is measured in feet. Height needs a height word.
    for (const line of [
      'Provide 20 feet of 1-1/8 copper.',
      'Cases are 12 ft long.',
      'Run is approximately 150 feet.',
      'Drain line 12\' to the hub.',
    ]) {
      expect(keys(auditText(line)), line).not.toContain('height');
    }
  });

  it('finds nothing at all in an ordinary takeoff line', () => {
    const plain = 'Provide and install 240 feet of 1-1/8" type L ACR copper with '
      + 'Insuguard saddles at 6 foot centers. Connect to rack A circuit 4.';
    expect(auditText(plain)).toEqual([]);
  });

  it('finds nothing in an empty or missing document', () => {
    expect(auditText('')).toEqual([]);
    expect(auditText(null)).toEqual([]);
    expect(auditText(undefined)).toEqual([]);
  });
});

describe('the quote is the evidence', () => {
  const text = 'Contractor shall schedule night work to avoid disruption.';

  it('carries the sentence that caused it', () => {
    const f = find(auditText(text), 'nightWork');
    expect(f.quotes[0].text).toBe(text);
  });

  it('names the document it came from', () => {
    const f = find(auditText(text, { source: 'SOW.pdf' }), 'nightWork');
    expect(f.quotes[0].source).toBe('SOW.pdf');
  });

  it('does not print the same clause forty times', () => {
    // A spec repeats itself. An estimator wants to know it is true and see
    // why, not scroll a wall of identical sentences.
    const repeated = Array.from({ length: 40 }, (_, i) => `Night work is required in area ${i}.`).join(' ');
    expect(find(auditText(repeated), 'nightWork').quotes.length).toBeLessThanOrEqual(3);
  });

  it('trims a long sentence around the words that matched', () => {
    const long = 'x'.repeat(400) + ' night work required ' + 'y'.repeat(400) + '.';
    const q = find(auditText(long), 'nightWork').quotes[0].text;
    expect(q.length).toBeLessThan(280);
    expect(q).toMatch(/night work required/);
  });

  it('excerpt leaves a short sentence alone', () => {
    expect(excerpt('short one', /short/)).toBe('short one');
  });
});

describe('across a whole set of documents', () => {
  const docs = [
    { name: 'SOW.pdf', text: 'All work after store closing. Store will remain open to customers.' },
    { name: 'Spec 23 00 00.pdf', text: 'Night work is required. System shall hold a 24 hour standing pressure test.' },
    { name: 'M0.1.pdf', text: 'Provide 240 feet of copper.' },
  ];

  it('merges one condition found in two documents', () => {
    const f = find(auditDocuments(docs), 'nightWork');
    expect(f.quotes.length).toBe(2);
    expect(f.quotes.map(q => q.source).sort()).toEqual(['SOW.pdf', 'Spec 23 00 00.pdf']);
  });

  it('puts what changes the hours first', () => {
    const order = auditDocuments(docs).map(f => f.affects);
    expect(order[0]).toBe('hours');
    expect(order).toEqual([...order].sort((a, b) =>
      ({ hours: 0, access: 1, method: 2, terms: 3 }[a] - { hours: 0, access: 1, method: 2, terms: 3 }[b])));
  });

  it('is empty rather than broken with no documents', () => {
    expect(auditDocuments([])).toEqual([]);
    expect(auditDocuments()).toEqual([]);
    expect(auditDocuments([{ name: 'x' }, null])).toEqual([]);
  });
});

// ── THE CONTRADICTION THIS EXISTS FOR ───────────────────────────────────────
describe('against the proposal this app actually prints', () => {
  it('catches the bid disclaiming what the documents require', () => {
    // The printed terms say premium time and phased work are not included.
    // If the documents REQUIRE them, that is not a disclaimer anybody holds.
    const findings = auditText('All work shall be performed after store closing, in three phases.');
    const clash = contradictedTerms(findings, DEFAULT_PROPOSAL_TERMS);
    expect(clash.map(c => c.key).sort()).toEqual(['nightWork', 'phasing']);
  });

  it('says nothing when the documents are quiet', () => {
    expect(contradictedTerms(auditText('Provide 240 feet of copper.'), DEFAULT_PROPOSAL_TERMS)).toEqual([]);
  });

  it('holds only while the terms still say it', () => {
    // If somebody rewrites the terms to include night work, the contradiction
    // is gone and this must stop claiming one.
    expect(contradictedTerms(auditText('Night work is required.'), ['We price night work.'])).toEqual([]);
  });

  it('every contradicts phrase is really in the default terms', () => {
    // A typo here would silently switch the check off.
    const terms = DEFAULT_PROPOSAL_TERMS.join(' ').toLowerCase();
    for (const r of RISKS.filter(x => x.contradicts)) {
      expect(terms, `${r.key} claims to contradict "${r.contradicts}"`).toContain(r.contradicts.toLowerCase());
    }
  });
});

describe('riskSummary', () => {
  it('counts by what the estimator would change', () => {
    const f = auditText('Night work required. Store will remain open. K65 piping. Prevailing wage applies.');
    expect(riskSummary(f)).toMatchObject({ total: 4, hours: 2, method: 1, terms: 1 });
  });

  it('is zeroes rather than broken with nothing found', () => {
    expect(riskSummary([])).toMatchObject({ total: 0, hours: 0 });
    expect(riskSummary()).toMatchObject({ total: 0 });
  });
});

describe('the rules themselves', () => {
  it('gives every condition a reason an estimator can act on', () => {
    for (const r of RISKS) {
      expect(r.why, r.key).toBeTruthy();
      expect(r.re.length, r.key).toBeGreaterThan(0);
      expect(['hours', 'access', 'method', 'terms'], r.key).toContain(r.affects);
    }
  });

  it('prices nothing', () => {
    // Deliberate. What a night shift costs depends on the shop's premium, the
    // crew and the local agreement. A multiplier invented here would be the
    // same unchecked guess as every other number this app is trying to stop
    // presenting as fact.
    const src = JSON.stringify(RISKS.map(r => ({ ...r, re: null, not: null })));
    expect(src).not.toMatch(/multiplier|1\.[123]5|premiumPct/i);
  });
});

describe('auditFlags — reading what the analyzers already extracted', () => {
  const triage = flags => ({
    actionable: flags.filter(f => !/^no schedule/i.test(f.text)),
  });

  it('audits the scope lines a job carries', () => {
    const flags = [
      { type: 'warn', text: 'All work shall be performed after store closing.', source: 'SOW.pdf' },
      { type: 'info', text: 'Provide 240 feet of copper.', source: 'M1.pdf' },
    ];
    const f = auditFlags(flags, triage);
    expect(f.map(x => x.key)).toEqual(['nightWork']);
    expect(f[0].quotes[0].source).toBe('SOW.pdf');
  });

  it('ignores the analyzer talking about its own run', () => {
    // "no schedule table on this sheet" is housekeeping, not a requirement.
    // Auditing it would invent findings out of the app's own diagnostics.
    const flags = [{ type: 'info', text: 'No schedule table present; night work section not read.', source: 'x' }];
    expect(auditFlags(flags, triage)).toEqual([]);
  });

  it('works without a triage function', () => {
    expect(auditFlags([{ text: 'Night work is required.', source: 's' }]).map(x => x.key)).toEqual(['nightWork']);
  });

  it('is empty rather than broken on a job with no flags', () => {
    expect(auditFlags([])).toEqual([]);
    expect(auditFlags()).toEqual([]);
    expect(auditFlags([null, { }])).toEqual([]);
  });
});
