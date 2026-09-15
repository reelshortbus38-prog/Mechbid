import { describe, it, expect } from 'vitest';
import { numberOr, pctOr, fieldValue, fieldNumber } from './numberField.js';
import { computeBidTotals } from '../steps/bidTotals.js';
import { initialState } from './store.js';

describe('numberOr tells a typed zero from an empty box', () => {
  it('keeps a zero somebody typed', () => {
    expect(numberOr(0, 20)).toBe(0);
    expect(numberOr('0', 20)).toBe(0);
  });

  it('falls back only when nothing was given', () => {
    expect(numberOr(undefined, 20)).toBe(20);
    expect(numberOr(null, 20)).toBe(20);
    expect(numberOr('', 20)).toBe(20);
  });

  it('falls back on something that is not a number', () => {
    // A half-typed "-" or "1e" must not price the job at NaN.
    for (const junk of ['-', '1e', 'abc', NaN, {}, []]) {
      expect(Number.isFinite(numberOr(junk, 20))).toBe(true);
    }
    expect(numberOr('-', 20)).toBe(20);
    expect(numberOr('abc', 20)).toBe(20);
  });

  it('takes the number when there is one', () => {
    expect(numberOr(35, 20)).toBe(35);
    expect(numberOr('12.5', 20)).toBe(12.5);
    expect(numberOr(-5, 20)).toBe(-5);
  });
});

describe('pctOr', () => {
  it('is numberOr that will not go negative', () => {
    expect(pctOr(0, 20)).toBe(0);
    expect(pctOr(-5, 20)).toBe(0);
    expect(pctOr('', 20)).toBe(20);
    expect(pctOr(35, 20)).toBe(35);
  });
});

describe('what a number box shows and stores', () => {
  it('shows a zero back instead of replacing it with the default', () => {
    expect(fieldValue(0)).toBe(0);
    expect(fieldValue(20)).toBe(20);
  });

  it('shows an unset field as empty, so it can be typed in', () => {
    expect(fieldValue(undefined)).toBe('');
    expect(fieldValue(null)).toBe('');
    expect(fieldValue('')).toBe('');
  });

  it('stores a typed zero as zero', () => {
    expect(fieldNumber('0')).toBe(0);
  });

  it('leaves a cleared box cleared rather than pricing the job at nothing', () => {
    expect(fieldNumber('')).toBe('');
    expect(fieldNumber('abc')).toBe('');
    expect(fieldNumber('-')).toBe('');
  });

  it('round-trips: what a box stores is what it shows', () => {
    for (const typed of ['0', '12.5', '35', '']) {
      expect(fieldValue(fieldNumber(typed))).toBe(fieldNumber(typed));
    }
  });
});

// ── THE MONEY, AND THE TWO SCREENS THAT DISAGREED ────────────────────────────
// state.markupPct === 0 was reachable: the Proposal step's scenario card writes
// `parseFloat(v) || 0`, so a zero stuck. The Materials step then read
// `state.markupPct || 20` and priced the SAME JOB at 20%, at the same time.
describe('a zero markup prices at zero on every screen', () => {
  const job = {
    ...initialState, mode: 'Commercial Refrigeration', markupPct: 0,
    lineItems: [{ id: 'l1', desc: 'Copper + insulation', total: 100000 }],
  };

  it('is $20,000 apart under the old reading, and level under the new one', () => {
    const proposal = computeBidTotals(job, 0);
    const oldMaterials = computeBidTotals(job, job.markupPct || 20);
    const newMaterials = computeBidTotals(job, pctOr(job.markupPct, 20));

    expect(Math.round(oldMaterials.total - proposal.total)).toBe(20000);
    expect(newMaterials.total).toBe(proposal.total);
  });

  it('still defaults to 20% for a job that never set one', () => {
    for (const unset of [undefined, null, '']) {
      const t = computeBidTotals({ ...job, markupPct: unset }, pctOr(unset, 20));
      expect(Math.round(t.total)).toBe(120000);
    }
  });

  it('leaves every job that DID set a markup exactly where it was', () => {
    for (const pct of [15, 20, 28, 35]) {
      const t = computeBidTotals({ ...job, markupPct: pct }, pctOr(pct, 20));
      expect(Math.round(t.total)).toBe(100000 + 1000 * pct);
    }
  });
});

// The margin card reports "what you stated". Reporting 0% while the bid is
// priced at 20% is the card disagreeing with the money.
describe('the margin report states what is actually charged', () => {
  const job = {
    ...initialState, mode: 'Commercial Refrigeration',
    lineItems: [{ id: 'l1', desc: 'Copper', total: 100000 }],
  };
  const stated = state => {
    const t = computeBidTotals(state, pctOr(state.markupPct, 20));
    return t;
  };

  it('agrees with the bid when no markup was set', () => {
    const t = stated({ ...job, markupPct: '' });
    expect(Math.round(t.total)).toBe(120000);
  });

  it('agrees with the bid at zero', () => {
    const t = stated({ ...job, markupPct: 0 });
    expect(Math.round(t.total)).toBe(100000);
  });
});
