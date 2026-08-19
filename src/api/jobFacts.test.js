import { describe, it, expect } from 'vitest';
import {
  FACT_KINDS, newFact, mergeFacts, dropSheet, factsOfKind, sheetsInLedger,
  subjectFacts, subjectsWithKind, ledgerSummary, subjectKey, systemOf, factLabel, factUnit,
} from './jobFacts.js';

const f = (kind, subj, val, sheet, extra = {}) => newFact(kind, subj, val, { sheet, ...extra });

describe('fact shape', () => {
  it('rejects an unknown kind rather than storing a fact nothing can interpret', () => {
    expect(newFact('vibes', 'HWP-01', 5, {})).toBeNull();
  });

  it('rejects a non-numeric value', () => {
    expect(newFact('pumpHead', 'HWP-01', 'tall', {})).toBeNull();
    expect(newFact('pumpHead', 'HWP-01', '', {})).toBeNull();
  });

  it('carries its unit from the kind', () => {
    expect(newFact('pumpHead', 'HWP-01', 83, {}).unit).toBe('ft');
    expect(newFact('dpSetpoint', 'HW', 12, {}).unit).toBe('psi');
  });

  it('keeps the raw text so a human can check it', () => {
    const x = newFact('pumpHead', 'HWP-01', 83, { raw: 'HWP-01 ... 276 83 78 1800 10.0' });
    expect(x.raw).toMatch(/276 83 78/);
  });

  it('gives every fact a distinct id', () => {
    const ids = Array.from({ length: 50 }, () => newFact('pumpHead', 'X', 1, {}).id);
    expect(new Set(ids).size).toBe(50);
  });

  it('labels and units are defined for every kind', () => {
    for (const k of Object.keys(FACT_KINDS)) {
      expect(factLabel(k)).toBeTruthy();
      expect(factUnit(k)).toBeTruthy();
    }
  });
});

describe('accumulation across sheets', () => {
  it('appends facts from a new sheet', () => {
    let l = mergeFacts([], 'M8.01', [f('pumpHead', 'HWP-01', 83)]);
    l = mergeFacts(l, 'M10.06', [f('dpSetpoint', 'HW', 12)]);
    expect(l.length).toBe(2);
    expect(sheetsInLedger(l).sort()).toEqual(['M10.06', 'M8.01']);
  });

  it('REPLACES a sheet rather than doubling it when re-analysed', () => {
    // This is the whole reason facts are keyed by sheet. Re-reading a drawing
    // must not add a second copy of everything it said.
    let l = mergeFacts([], 'M8.01', [f('pumpHead', 'HWP-01', 83), f('pumpFlow', 'HWP-01', 276)]);
    l = mergeFacts(l, 'M8.01', [f('pumpHead', 'HWP-01', 83), f('pumpFlow', 'HWP-01', 276)]);
    expect(l.length).toBe(2);
  });

  it('a re-read that finds a different value replaces the old one', () => {
    let l = mergeFacts([], 'M8.01', [f('pumpHead', 'HWP-01', 80)]);
    l = mergeFacts(l, 'M8.01', [f('pumpHead', 'HWP-01', 83)]);
    expect(l.length).toBe(1);
    expect(l[0].value).toBe(83);
  });

  it('re-reading one sheet leaves the others alone', () => {
    let l = mergeFacts([], 'M8.01', [f('pumpHead', 'HWP-01', 83)]);
    l = mergeFacts(l, 'M10.06', [f('dpSetpoint', 'HW', 12)]);
    l = mergeFacts(l, 'M8.01', [f('pumpHead', 'HWP-01', 83)]);
    expect(factsOfKind(l, 'dpSetpoint').length).toBe(1);
  });

  it('stamps the sheet onto facts that arrived without one', () => {
    const l = mergeFacts([], 'M8.01', [newFact('pumpHead', 'HWP-01', 83, {})]);
    expect(l[0].sheet).toBe('M8.01');
  });

  it('drops a sheet when its file is removed from the job', () => {
    let l = mergeFacts([], 'M8.01', [f('pumpHead', 'HWP-01', 83)]);
    l = mergeFacts(l, 'M10.06', [f('dpSetpoint', 'HW', 12)]);
    expect(dropSheet(l, 'M8.01').length).toBe(1);
  });

  it('ignores nulls from a failed extraction', () => {
    const l = mergeFacts([], 'M8.01', [null, f('pumpHead', 'HWP-01', 83), null]);
    expect(l.length).toBe(1);
  });
});

describe('subject matching survives PDF text damage', () => {
  it('ignores spacing, so a word broken by column wrap still matches', () => {
    // A real control sequence renders "heat pump header" as "heat pu mp header".
    expect(subjectKey('heat pu mp header')).toBe(subjectKey('heat pump header'));
  });

  it('ignores case and punctuation', () => {
    expect(subjectKey('HWP-01')).toBe(subjectKey('hwp 01'));
  });

  it('does not collapse genuinely different subjects', () => {
    expect(subjectKey('HWP-01')).not.toBe(subjectKey('HWP-02'));
    expect(subjectKey('minimum hydronic plant')).not.toBe(subjectKey('hydronic plant'));
  });

  it('gathers everything known about one subject', () => {
    const l = [f('pumpHead', 'HWP-01', 83, 'A'), f('pumpFlow', 'HWP-01', 276, 'A'), f('pumpHead', 'HWP-02', 83, 'A')];
    const s = subjectFacts(l, 'hwp 01');
    expect(s.pumpHead.value).toBe(83);
    expect(s.pumpFlow.value).toBe(276);
  });

  it('lists the subjects that have a kind', () => {
    const l = [f('pumpHead', 'HWP-01', 83, 'A'), f('pumpHead', 'CWP-01', 125, 'A')];
    expect(subjectsWithKind(l, 'pumpHead').sort()).toEqual(['CWP-01', 'HWP-01']);
  });
});

describe('which loop a fact is about', () => {
  it('reads the loop off a real pump schedule row', () => {
    expect(systemOf('HWP-01 MECHANICAL K100 HYDRONIC WATER - LOAD-SIDE B&G / E-1510 2.5AC BASE MOUNTED')).toBe('hydronic');
    expect(systemOf('CWP-01 MECHANICAL K100 CONDENSER WATER - SOURCE-SIDE B &G / E-1510 3GB')).toBe('condenser');
  });

  it('does not let a bare alias outrank a spelled-out system', () => {
    // "CONDENSER WATER" must win over any stray CW/HW two-letter match.
    expect(systemOf('GMU-01 MECHANICAL K100 CONDENSER WATER B&G / GMU560P/S 20% PG')).toBe('condenser');
  });

  it('returns empty when the text names no loop, rather than guessing one', () => {
    expect(systemOf('CWP-04 KITCHEN WATER-COOLED CONDENSING UNIT B&G / PL-36 INLINE')).toBe('');
    expect(systemOf('')).toBe('');
  });
});

describe('summary', () => {
  it('says nothing has been read yet', () => {
    expect(ledgerSummary([])).toMatch(/No facts read yet/);
  });

  it('counts facts, kinds and sheets', () => {
    const l = [f('pumpHead', 'HWP-01', 83, 'A'), f('dpSetpoint', 'HW', 12, 'B')];
    expect(ledgerSummary(l)).toBe('2 fact(s) of 2 kind(s), from 2 sheet(s)');
  });
});
