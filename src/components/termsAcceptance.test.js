import { describe, it, expect } from 'vitest';
import {
  ACCEPTANCE_KEY, loadAcceptance, recordAcceptance, needsAcceptance,
  acceptanceKind, acceptedOn,
} from './termsAcceptance.js';

function fakeStore(initial = {}, { readonly = false } = {}) {
  const data = { ...initial };
  return {
    data,
    getItem(k) { return k in data ? data[k] : null; },
    setItem(k, v) { if (readonly) throw new Error('storage disabled'); data[k] = v; },
  };
}

describe('when the gate should appear', () => {
  it('appears for someone who has never accepted', () => {
    expect(needsAcceptance(null, '2026-08-21')).toBe(true);
  });

  it('does not appear once the current version is accepted', () => {
    expect(needsAcceptance({ version: '2026-08-21', at: 'x' }, '2026-08-21')).toBe(false);
  });

  it('appears again when the terms change', () => {
    expect(needsAcceptance({ version: '2026-08-21', at: 'x' }, '2026-11-02')).toBe(true);
  });

  it('never blocks when there is no version to agree to', () => {
    // A missing LAST_UPDATED is a bug in the app, not grounds for locking the
    // user out of their own bids.
    expect(needsAcceptance(null, '')).toBe(false);
    expect(needsAcceptance(null, undefined)).toBe(false);
  });
});

describe('first acceptance vs re-acceptance', () => {
  it('is a first acceptance for a new user', () => {
    expect(acceptanceKind(null, '2026-08-21')).toBe('first');
  });

  it('is an update for someone who accepted an older version', () => {
    expect(acceptanceKind({ version: '2026-01-01', at: 'x' }, '2026-08-21')).toBe('updated');
  });

  it('is neither when nothing is owed', () => {
    expect(acceptanceKind({ version: '2026-08-21', at: 'x' }, '2026-08-21')).toBe('none');
  });
});

describe('recording an acceptance', () => {
  it('stores the version and a timestamp', () => {
    const s = fakeStore();
    expect(recordAcceptance(s, '2026-08-21', new Date('2026-08-27T12:00:00Z'))).toBe(true);
    expect(loadAcceptance(s)).toEqual({ version: '2026-08-21', at: '2026-08-27T12:00:00.000Z' });
  });

  it('closes the gate it was recorded for', () => {
    const s = fakeStore();
    recordAcceptance(s, '2026-08-21');
    expect(needsAcceptance(loadAcceptance(s), '2026-08-21')).toBe(false);
  });

  it('refuses to record an empty version — that would record nothing useful', () => {
    const s = fakeStore();
    expect(recordAcceptance(s, '')).toBe(false);
    expect(loadAcceptance(s)).toBe(null);
  });

  it('reports a storage failure instead of pretending it saved', () => {
    // If it silently failed, the user would be re-prompted every launch.
    expect(recordAcceptance(fakeStore({}, { readonly: true }), '2026-08-21')).toBe(false);
  });
});

describe('reading a corrupt or hand-edited record', () => {
  it('treats invalid JSON as never accepted', () => {
    expect(loadAcceptance(fakeStore({ [ACCEPTANCE_KEY]: '{not json' }))).toBe(null);
  });

  it('treats a record with no version as never accepted', () => {
    // A record that cannot say WHAT was agreed to is not evidence of anything.
    expect(loadAcceptance(fakeStore({ [ACCEPTANCE_KEY]: '{"at":"2026-08-27"}' }))).toBe(null);
  });

  it('treats a record with no timestamp as never accepted', () => {
    expect(loadAcceptance(fakeStore({ [ACCEPTANCE_KEY]: '{"version":"2026-08-21"}' }))).toBe(null);
  });

  it('treats a non-object as never accepted', () => {
    expect(loadAcceptance(fakeStore({ [ACCEPTANCE_KEY]: '"yes"' }))).toBe(null);
  });

  it('re-prompts on a corrupt record rather than assuming agreement', () => {
    const s = fakeStore({ [ACCEPTANCE_KEY]: '{not json' });
    expect(needsAcceptance(loadAcceptance(s), '2026-08-21')).toBe(true);
  });
});

describe('displaying when it was accepted', () => {
  it('formats the date', () => {
    expect(acceptedOn({ version: 'v', at: '2026-08-27T18:04:00.000Z' })).toBe('2026-08-27');
  });

  it('returns empty rather than "Invalid Date"', () => {
    expect(acceptedOn({ version: 'v', at: 'not-a-date' })).toBe('');
    expect(acceptedOn(null)).toBe('');
    expect(acceptedOn({ version: 'v' })).toBe('');
  });
});
