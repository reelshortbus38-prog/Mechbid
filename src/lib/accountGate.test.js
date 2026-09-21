import { describe, it, expect } from 'vitest';
import {
  parseFlag, shouldGate, OPEN_ACCESS_VAR, authOutcome,
  ALREADY_NOTE, CONFIRM_NOTE, UNKNOWN_ERROR,
  DEFAULT_MIN_PASSWORD, MIN_PASSWORD_VAR, minPasswordLength, formProblem,
} from './accountGate.js';

// A signed-out visitor to a normally-configured deployment, with nothing set.
const VISITOR = { openAccess: undefined, configured: true, loading: false, user: null };

describe('reading the escape-hatch flag', () => {
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

  it('names the variable, so the name lives in one place', () => {
    expect(OPEN_ACCESS_VAR).toBe('VITE_OPEN_ACCESS');
  });
});

describe('when the wall shows', () => {
  // ── THE BEHAVIOUR CHANGE, ASSERTED DIRECTLY ───────────────────────────────
  // The gate this replaced needed VITE_INVITE_ONLY set before it did anything.
  // This one needs nothing set. If that ever quietly reverts, the app goes back
  // to letting people build bids into storage the browser will delete, and
  // nothing else in the suite would notice — every other test would still pass,
  // the app would still work, and the loss would happen a week later on
  // somebody's iPad.
  it('shows for a signed-out visitor with NO env var set at all', () => {
    expect(shouldGate(VISITOR)).toBe(true);
  });

  it('does not show once somebody is signed in', () => {
    expect(shouldGate({ ...VISITOR, user: { id: 'u1' } })).toBe(false);
  });
});

describe('the two rules that stop it locking everyone out', () => {
  it('RULE 1 — never gates when Supabase is unconfigured', () => {
    // Signing in and signing up both need Supabase. Gating without it is a door
    // with no handle on either side, in an app that is designed to run
    // local-only when nobody has set accounts up.
    expect(shouldGate({ ...VISITOR, configured: false })).toBe(false);
  });

  it('RULE 2 — never gates while the session is still loading', () => {
    // Supabase restores a session asynchronously. Gating in that window flashes
    // a sign-up screen at somebody who is already signed in — and the natural
    // response to that is to create a second account.
    expect(shouldGate({ ...VISITOR, loading: true })).toBe(false);
  });

  it('an unconfigured deployment is open even to a loaded, signed-out visitor', () => {
    expect(shouldGate({ configured: false, loading: false, user: null })).toBe(false);
  });
});

describe('opening the app deliberately', () => {
  it('VITE_OPEN_ACCESS takes the wall down with no code change', () => {
    expect(shouldGate({ ...VISITOR, openAccess: 'true' })).toBe(false);
  });

  // ── A TYPO MUST FAIL TOWARDS THE WALL STANDING ────────────────────────────
  // The old gate's first rule was the opposite: a misspelt flag never gated, so
  // a typo could not take the site down. That rule belonged to a wall with no
  // sign-up form, which nobody could pass. This wall anybody can pass in about
  // fifteen seconds, so a typo leaving it UP costs a visitor one form — while a
  // typo taking it DOWN costs somebody a takeoff, silently, days later.
  it('a misspelt flag leaves the wall up', () => {
    for (const typo of ['ture', 'TRU', 'y', 'open', 'false']) {
      expect(shouldGate({ ...VISITOR, openAccess: typo }), `"${typo}" opened the app`).toBe(true);
    }
  });

  it('opening the app does not resurrect it for a signed-in user', () => {
    // Nothing to show either way — just guarding against a rule ordering that
    // returns true from the open-access branch.
    expect(shouldGate({ ...VISITOR, openAccess: 'true', user: { id: 'u1' } })).toBe(false);
  });
});

// ── HOW LONG A PASSWORD HAS TO BE ────────────────────────────────────────────
// The screen said 6 while the Supabase project required 10. An 8-character
// password passed the app's own check, went to Supabase, and came back
// refused — so the person was looking at a rule they had followed and an error
// saying they had not.
describe('the password minimum', () => {
  it('matches what the Supabase project is set to', () => {
    // If this is ever changed in Supabase again, it changes here too — or in
    // VITE_MIN_PASSWORD_LENGTH, which is why that exists.
    expect(DEFAULT_MIN_PASSWORD).toBe(10);
    expect(MIN_PASSWORD_VAR).toBe('VITE_MIN_PASSWORD_LENGTH');
  });

  it('takes the deployment at its word when it sets one', () => {
    expect(minPasswordLength('12')).toBe(12);
    expect(minPasswordLength(' 8 ')).toBe(8);
    expect(minPasswordLength(20)).toBe(20);
  });

  it('falls back to the stricter default rather than to something unusable', () => {
    // A hint asking for MORE than required annoys somebody. A hint asking for
    // less refuses them after they have typed it, which is the failure this
    // whole section exists to stop — so a bad value must not soften the rule.
    for (const junk of [undefined, null, '', 'ten', '0', '3', '-5', 'NaN']) {
      expect(minPasswordLength(junk), String(junk)).toBe(DEFAULT_MIN_PASSWORD);
    }
  });

  it('never returns a fraction, because a character count is not fractional', () => {
    expect(minPasswordLength('10.7')).toBe(10);
  });
});

describe('what is wrong with the form as typed', () => {
  const ok = { email: 'pat@example.com', password: 'abcdefghij', min: 10 };

  it('says nothing when nothing is wrong', () => {
    expect(formProblem({ ...ok, signingUp: true })).toBe('');
    expect(formProblem({ ...ok, signingUp: false })).toBe('');
  });

  it('asks for the fields it needs before spending a round trip', () => {
    expect(formProblem({ ...ok, email: '', signingUp: true })).toMatch(/email and a password/i);
    expect(formProblem({ ...ok, email: '   ', signingUp: true })).toMatch(/email and a password/i);
    expect(formProblem({ ...ok, password: '', signingUp: true })).toMatch(/email and a password/i);
  });

  it('names the same number the hint shows', () => {
    // The whole point. Any drift between these two puts a rule on the screen
    // that the screen itself does not enforce.
    expect(formProblem({ ...ok, password: 'short', min: 10, signingUp: true }))
      .toBe('Passwords need at least 10 characters.');
    expect(formProblem({ ...ok, password: 'short', min: 14, signingUp: true }))
      .toBe('Passwords need at least 14 characters.');
  });

  // ── SIGNING IN IS NOT SIGNING UP ──────────────────────────────────────────
  // Raising the minimum does not rewrite anybody's existing password. An
  // account made under the old rule still has a shorter one and still works;
  // refusing to even attempt it would lock that person out of a live account
  // over a rule that was introduced after they joined.
  it('does not apply the minimum to somebody signing IN', () => {
    expect(formProblem({ ...ok, password: 'abc123', min: 10, signingUp: false })).toBe('');
  });
});

// ── WHAT THE WALL DOES WITH WHAT CAME BACK ───────────────────────────────────
// Every branch here is a way for a wall to become a dead end, which is the one
// thing a wall must never be. A person who cannot get past this screen cannot
// reach anything — there is no partial version of the app behind it to fall
// back to, and no other route in.
describe('the outcome of a sign-up or sign-in attempt', () => {
  it('lets a successful sign-in through with nothing to say', () => {
    const out = authOutcome({ data: { session: {} }, error: null }, { signingUp: false });
    expect(out.done).toBe(true);
    expect(out.error).toBe('');
    expect(out.note).toBe('');
  });

  it('lets a successful sign-up through when a session came back with it', () => {
    // "Confirm email" off in Supabase: signUp returns a live session and the
    // person is simply in.
    const out = authOutcome({ data: { session: {} }, needsConfirm: false }, { signingUp: true });
    expect(out.done).toBe(true);
    expect(out.mode).toBeFalsy();
  });

  // The account exists; the session does not. Without this branch the wall
  // just sits there after a successful signup, which reads as the signup
  // having failed — and the obvious next move, signing up again, fails too.
  it('sends a new account that needs confirming to the sign-in side, and says why', () => {
    const out = authOutcome({ needsConfirm: true }, { signingUp: true });
    expect(out.done).toBeFalsy();
    expect(out.mode).toBe('signin');
    expect(out.clearPassword).toBe(true);
    expect(out.note).toBe(CONFIRM_NOTE);
    expect(out.note).toMatch(/check your email/i);
    expect(out.error).toBe('');
  });

  // A returning user whose session expired lands on a screen that defaults to
  // signing UP. Supabase tells them the email is taken; on its own that reads
  // as a refusal rather than as "you are already a member."
  it('moves an existing account across to signing in instead of refusing it', () => {
    for (const msg of ['User already registered', 'user already exists', 'Email has already been registered']) {
      const out = authOutcome({ error: msg }, { signingUp: true });
      expect(out.mode, msg).toBe('signin');
      expect(out.note, msg).toBe(ALREADY_NOTE);
      expect(out.error, msg).toBe('');
      expect(out.clearPassword, msg).toBe(true);
    }
  });

  it('does not swallow the same wording arriving from a SIGN-IN attempt', () => {
    // Nothing should produce this, but reclassifying a sign-in failure as
    // "you already have an account" would leave somebody re-reading a message
    // that tells them to do the thing they just did.
    const out = authOutcome({ error: 'User already registered' }, { signingUp: false });
    expect(out.error).toBe('User already registered');
    expect(out.mode).toBeFalsy();
  });

  it('shows a real failure as an error, unchanged', () => {
    const out = authOutcome({ error: 'Invalid login credentials' }, { signingUp: false });
    expect(out.error).toBe('Invalid login credentials');
    expect(out.note).toBe('');
    expect(out.done).toBeFalsy();
  });

  // ── THE BUG THIS TEST WAS WRITTEN TO CONFIRM, AND FOUND INSTEAD ───────────
  // The name went in first and the assertion contradicted it: a result with no
  // error and no data returned `done: true`. The component does not read
  // `done` — it sets the error to '' and the note to '' — so a tapped button
  // wiped the screen and left the wall standing with nothing said and no
  // session behind it.
  it('treats a missing result as a failure rather than as a way in', () => {
    for (const nothing of [undefined, null, {}]) {
      const out = authOutcome(nothing, { signingUp: true });
      expect(out.done, String(nothing)).toBeFalsy();
      expect(out.error, String(nothing)).toBe(UNKNOWN_ERROR);
    }
  });

  it('still lets a real success through, so that guard is not just refusing everyone', () => {
    // The other half of the check above. A guard that never passes anything is
    // the same outage wearing a different message.
    expect(authOutcome({ data: { session: {} }, error: null }, { signingUp: false }).done).toBe(true);
    expect(authOutcome({ data: { session: {} }, error: null }, { signingUp: true }).done).toBe(true);
  });
});
