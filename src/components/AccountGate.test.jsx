import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AccountGate, { AccountWall } from './AccountGate.jsx';

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

  it('gives a way across for somebody who already has one', () => {
    expect(wall()).toMatch(/Already have an account\? Sign in/);
  });

  it('takes an email and a password', () => {
    const html = wall();
    expect(html).toMatch(/type="email"/);
    expect(html).toMatch(/type="password"/);
    expect(html).toMatch(/autoComplete="new-password"|autocomplete="new-password"/);
  });

  it('says the password minimum instead of just disabling the button', () => {
    // Supabase rejects anything under 6. A button that silently does nothing is
    // indistinguishable from an app that is broken.
    expect(wall()).toMatch(/At least 6 characters/);
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
