import { describe, it, expect } from 'vitest';
import { parseFlag, shouldGate } from './inviteGate.js';

const OPEN = { flag: 'true', configured: true, loading: false, user: null };

describe('reading the flag', () => {
  it('accepts the forms an env var actually arrives in', () => {
    for (const v of ['true', 'TRUE', ' True ', '1', 'yes', 'on']) {
      expect(parseFlag(v)).toBe(true);
    }
  });

  it('is false for anything else', () => {
    for (const v of ['false', '0', 'no', '', 'maybe', undefined, null]) {
      expect(parseFlag(v)).toBe(false);
    }
  });
});

describe('when the gate shows', () => {
  it('shows for a signed-out visitor when the flag is on', () => {
    expect(shouldGate(OPEN)).toBe(true);
  });

  it('does not show once somebody is signed in', () => {
    expect(shouldGate({ ...OPEN, user: { id: 'u1' } })).toBe(false);
  });
});

describe('the three rules that stop it locking the owner out', () => {
  it('RULE 1 — a missing or misspelled flag never gates', () => {
    // A typo in an env var must not take the site down.
    expect(shouldGate({ ...OPEN, flag: undefined })).toBe(false);
    expect(shouldGate({ ...OPEN, flag: '' })).toBe(false);
    expect(shouldGate({ ...OPEN, flag: 'ture' })).toBe(false);
    expect(shouldGate({ ...OPEN, flag: 'false' })).toBe(false);
  });

  it('RULE 2 — never gates when Supabase is unconfigured', () => {
    // Signing in is the only way through, and signing in needs Supabase.
    // Gating without it is a door with no handle on either side.
    expect(shouldGate({ ...OPEN, configured: false })).toBe(false);
  });

  it('RULE 3 — never gates while the session is still loading', () => {
    // Supabase restores a session asynchronously. Gating in that window
    // flashes a sign-in screen at somebody who is already signed in.
    expect(shouldGate({ ...OPEN, loading: true })).toBe(false);
  });

  it('all three together: the flag alone is never enough', () => {
    expect(shouldGate({ flag: 'true' })).toBe(false);
  });
});

describe('turning it off again', () => {
  it('removing the flag reopens the app with no code change', () => {
    const gated = shouldGate(OPEN);
    const opened = shouldGate({ ...OPEN, flag: undefined });
    expect(gated).toBe(true);
    expect(opened).toBe(false);
  });
});
