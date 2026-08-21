import { describe, it, expect } from 'vitest';
import {
  ESTIMATOR_WARNING, DEFAULT_PROPOSAL_TERMS, basisOfBid, basisComplete,
} from './proposalTerms.js';

describe('the two disclaimers point opposite ways', () => {
  it('the estimator warning says plainly that it is not printed', () => {
    expect(ESTIMATOR_WARNING).toMatch(/not printed on the proposal/i);
  });

  it('the estimator warning is the one that mentions automated extraction', () => {
    expect(ESTIMATOR_WARNING).toMatch(/automated extraction/i);
  });

  it('NOTHING printed on the proposal mentions how the bid was produced', () => {
    // Telling a general contractor the bid was machine-made loses the job. That
    // belongs in the app's Terms of Service, where it already is.
    const printed = DEFAULT_PROPOSAL_TERMS.join(' ');
    expect(printed).not.toMatch(/automated|extraction|AI\b|machine|software|app\b/i);
  });

  it('nothing printed disclaims the contractor\'s own numbers', () => {
    // A proposal that will not stand behind its price is not an offer.
    const printed = DEFAULT_PROPOSAL_TERMS.join(' ');
    expect(printed).not.toMatch(/no warranty|not liable|as is|verify all takeoff/i);
  });

  it('nothing printed asks the recipient to check the contractor\'s takeoff', () => {
    const printed = DEFAULT_PROPOSAL_TERMS.join(' ');
    expect(printed).not.toMatch(/recipient is responsible/i);
  });
});

describe('what a mechanical proposal actually carries', () => {
  const printed = DEFAULT_PROPOSAL_TERMS.join(' ');

  it('states what the bid was priced from', () => {
    expect(printed).toMatch(/based on the drawings, specifications and addenda/i);
  });

  it('fences the schedule and the access it assumes', () => {
    expect(printed).toMatch(/normal working hours/i);
    expect(printed).toMatch(/continuous uninterrupted access/i);
  });

  it('requires written authorisation before extra work', () => {
    expect(printed).toMatch(/prior written authorization/i);
    expect(printed).toMatch(/change order/i);
  });

  it('states payment terms', () => {
    expect(printed).toMatch(/net 30/i);
    expect(printed).toMatch(/retainage/i);
  });

  it('says it is not a contract until accepted', () => {
    expect(printed).toMatch(/not a contract until accepted in writing/i);
  });

  it('is a handful of clauses, not a wall of text nobody reads', () => {
    expect(DEFAULT_PROPOSAL_TERMS.length).toBeLessThanOrEqual(8);
    for (const t of DEFAULT_PROPOSAL_TERMS) expect(t.length).toBeLessThan(320);
  });
});

describe('basis of bid', () => {
  it('lists the documents the price stands on', () => {
    const lines = basisOfBid({ drawings: ['M4.12b', 'M10.06'], specSection: '23 00 00', addenda: ['1', '2'], dated: '2026-06-26' });
    expect(lines[0]).toBe('Drawings: M4.12b, M10.06');
    expect(lines[1]).toBe('Specification: 23 00 00');
    expect(lines[2]).toBe('Addenda acknowledged: 1, 2');
    expect(lines[3]).toBe('Dated: 2026-06-26');
  });

  it('says "none" for addenda rather than leaving it silent', () => {
    // Silence reads as "we missed them"; "none" is a position.
    expect(basisOfBid({ drawings: ['M1'] })).toContain('Addenda acknowledged: none');
  });

  it('drops blank entries instead of printing empty commas', () => {
    const lines = basisOfBid({ drawings: ['M1', '', '  '], addenda: [''] });
    expect(lines[0]).toBe('Drawings: M1');
  });

  it('still produces the addenda line with nothing else supplied', () => {
    expect(basisOfBid({})).toEqual(['Addenda acknowledged: none']);
  });

  it('knows when no document has been named at all', () => {
    expect(basisComplete({ drawings: ['M4.12b'] })).toBe(true);
    expect(basisComplete({ drawings: [] })).toBe(false);
    expect(basisComplete({ drawings: ['  '] })).toBe(false);
    expect(basisComplete({})).toBe(false);
  });
});
