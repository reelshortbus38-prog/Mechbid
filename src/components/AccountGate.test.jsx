import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AccountGate, { AccountWall } from './AccountGate.jsx';
import { DEFAULT_MIN_PASSWORD, formProblem } from '../lib/accountGate.js';

// These render statically — nothing here can tap anything. That is fine for
// this screen, because unlike most panels in this app it is not collapsed: the
// sign-up form is the first thing it paints, so everything asserted below is
// genuinely in the markup rather than behind an interaction the test cannot
// perform. Where that has been forgotten in this repo before, the test passed
// because the DOM was empty.

const noop = async () => ({ data: {}, error: null });
const wall = () => renderToStaticMarkup(<AccountWall signIn={noop} signUp={noop} />);

describe('the wall a signed-out visitor meets', () => {
  it('offers to CREATE an account, not only to sign in', () => {
    // The whole difference from the invite gate this replaced. That screen was
    // sign-in only on purpose; leaving it that way while sign-ups are open
    // would turn every new contractor around at the door.
    const html = wall();
    expect(html).toMatch(/Create an account to start a bid/);
    expect(html).toMatch(/Create account/);
  });

  // ── THE ONE THE OWNER FOUND, WITHIN A MINUTE OF IT GOING LIVE ─────────────
  //   "There's no sign up button to tap... Shouldn't there be a sign in button
  //    to tap"
  //
  // Signing in was a line of dim grey text at the bottom with no underline and
  // no border. It was reachable — it just did not look like a control, which
  // for a returning user whose session expired is the same as not being there.
  //
  // Both modes are a segmented control now, and this is the assertion that
  // keeps them there. Note it could NOT have been written against the old
  // layout in a way that would have caught it: the text link WAS in the markup,
  // so any test asking "is signing in reachable" passed. What was missing was
  // that it looked like something you could press, and the closest mechanical
  // stand-in for that is being a button with a border, next to the other one.
  it('shows both choices as controls before anything is tapped', () => {
    const html = wall();
    expect(html).toMatch(/<button[^>]*>New account<\/button>/);
    expect(html).toMatch(/<button[^>]*>Sign in<\/button>/);
  });

  it('marks which of the two is selected', () => {
    // Two identically-styled buttons say nothing about which form is on screen,
    // which is most of the way back to the problem this replaced.
    const tabs = [...wall().matchAll(/<button([^>]*)>(?:New account|Sign in)<\/button>/g)];
    expect(tabs).toHaveLength(2);
    expect(tabs[0][1], 'the two mode buttons are styled identically').not.toBe(tabs[1][1]);
  });

  it('takes an email and a password', () => {
    const html = wall();
    expect(html).toMatch(/type="email"/);
    expect(html).toMatch(/type="password"/);
    expect(html).toMatch(/autoComplete="new-password"|autocomplete="new-password"/);
  });

  it('says the password minimum instead of just disabling the button', () => {
    // A button that silently does nothing is indistinguishable from an app
    // that is broken.
    expect(wall()).toMatch(/At least \d+ characters/);
  });

  // ── THE HINT AND THE RULE ARE THE SAME NUMBER ─────────────────────────────
  // This was hardcoded to 6 in two places while the Supabase project required
  // 10. Both places agreed with each other and neither agreed with reality, so
  // an 8-character password passed the app and was refused by the server.
  //
  // Read from the module rather than written as a literal: a test carrying its
  // own copy of the number is a third place to drift.
  it('shows the number the form actually enforces', () => {
    const html = wall();
    const shown = /At least (\d+) characters/.exec(html);
    expect(shown, 'no password hint on the screen at all').toBeTruthy();
    expect(Number(shown[1])).toBe(DEFAULT_MIN_PASSWORD);
    expect(formProblem({
      email: 'pat@example.com', password: 'x'.repeat(DEFAULT_MIN_PASSWORD - 1),
      min: DEFAULT_MIN_PASSWORD, signingUp: true,
    })).toContain(String(DEFAULT_MIN_PASSWORD));
  });

  // ── THE REASON IS THE PERSUASIVE PART ──────────────────────────────────────
  // A wall that says only "sign up to continue" reads as a marketing funnel,
  // and an estimator who is evaluating the app owes it nothing. The actual
  // reason — that the browser deletes the work — is both true and the most
  // convincing sentence available.
  it('says why there is a wall at all', () => {
    const html = wall();
    expect(html).toMatch(/saved to your account/i);
    expect(html).toMatch(/Safari clears that storage/i);
  });

  it('says it costs nothing, because it does not', () => {
    // Kept in step with the Terms, which say the app is free while in testing.
    expect(wall()).toMatch(/free while Coldgauge is in testing/i);
  });

  it('leaves a way to reach a person', () => {
    expect(wall()).toMatch(/support@coldgauge\.com/);
  });
});

describe('what the gate does when there are no accounts to gate with', () => {
  // useAuth() outside a provider reports an unconfigured deployment, which is
  // exactly rule 1 in ../lib/accountGate.js — and it means this renders the
  // REAL default export down the real path, not a stand-in.
  const open = () => renderToStaticMarkup(
    <AccountGate><p>the app</p></AccountGate>,
  );

  it('shows the app rather than a door with no handle', () => {
    expect(open()).toContain('<p>the app</p>');
  });

  it('does not show the wall as well', () => {
    // Guarding against a version that renders both — the children behind a
    // fixed-position overlay is a blank screen, not an open app.
    expect(open()).not.toMatch(/Create an account to start a bid/);
  });
});
