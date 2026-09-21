import { useState } from 'react';
import { colors } from '../styles/theme.js';
import { Btn } from './UI.jsx';
import { useAuth } from '../lib/auth.jsx';
import { shouldGate, authOutcome } from '../lib/accountGate.js';
import { BRAND_HEAD, BRAND_TAIL } from './brand.js';

// ── THE ACCOUNT WALL ─────────────────────────────────────────────────────────
// The rule for whether this shows lives in ../lib/accountGate.js, with the
// reasoning. This file is the screen.
//
// It replaces an invite gate that was sign-in only. Two things changed:
//
//   IT HAS A SIGN-UP FORM. The old screen deliberately had none, because
//   admission was controlled by hand in Supabase and a sign-up form would have
//   made the gate decorative. Admission is not controlled here any more, so the
//   form belongs on the screen rather than behind an email to support.
//
//   IT DEFAULTS TO SIGNING UP, not signing in. Returning users mostly never see
//   this screen at all — Supabase restores their session and the wall is gone
//   before it paints. The people who DO see it skew new. A returning user whose
//   session did expire is one tap away, and the "already registered" branch in
//   authOutcome moves them across by itself.
//
// ── SAY WHY, NOT JUST NO ─────────────────────────────────────────────────────
// The reason for the wall is not "please register." It is that a bid built
// signed-out lives in this browser's localStorage, and iPad Safari empties that
// on its own. An estimator deciding whether this is worth fifteen seconds
// deserves the actual reason, and the actual reason happens to be the most
// persuasive thing on the screen.
//
// ── WHY THIS FILE EXPORTS TWO THINGS ─────────────────────────────────────────
// AccountWall is exported separately so a render test can reach it. The default
// export decides whether to show anything at all, and that decision depends on
// auth context a static render has no way to supply — so a test of the default
// export can only ever see the open case. Splitting them means the copy on the
// wall is actually asserted against, rather than assumed.

export function AccountWall({ signIn, signUp }) {
  const [mode, setMode] = useState('signup'); // 'signup' | 'signin'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const signingUp = mode === 'signup';
  const tooShort = signingUp && password.length > 0 && password.length < 6;

  async function submit() {
    if (!email.trim() || !password) { setErr('Enter your email and a password.'); return; }
    if (signingUp && password.length < 6) { setErr('Passwords need at least 6 characters.'); return; }
    setBusy(true); setErr(''); setNote('');
    try {
      const r = signingUp ? await signUp(email.trim(), password) : await signIn(email.trim(), password);
      const next = authOutcome(r, { signingUp });
      if (next.mode) setMode(next.mode);
      if (next.clearPassword) setPassword('');
      setNote(next.note);
      setErr(next.error);
    } catch (e) {
      setErr(e?.message || (signingUp ? 'Could not create the account.' : 'Could not sign in.'));
    } finally {
      setBusy(false);
    }
  }

  function swap() {
    setMode(signingUp ? 'signin' : 'signup');
    setErr(''); setNote('');
  }

  const field = {
    width: '100%', background: colors.surface, border: `1px solid ${colors.border}`,
    color: colors.text, borderRadius: 8, padding: '11px 12px', fontSize: 14,
    fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2100, background: colors.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      overflowY: 'auto', fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        background: colors.card, border: `1px solid ${colors.border2}`, borderRadius: 14,
        maxWidth: 420, width: '100%', padding: 26,
      }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 900, color: colors.text, letterSpacing: '-0.02em' }}>
          {BRAND_HEAD}<span style={{ color: colors.green }}>{BRAND_TAIL}</span>
        </div>
        <div style={{ fontSize: 9, color: colors.textDim, letterSpacing: '0.05em', marginBottom: 18 }}>
          REFRIGERATION + HVAC · ONE ESTIMATOR
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, marginBottom: 6 }}>
          {signingUp ? 'Create an account to start a bid' : 'Sign in to your account'}
        </div>
        <div style={{ fontSize: 11.5, color: colors.textDim, lineHeight: 1.65, marginBottom: 16 }}>
          Your bids are saved to your account, so they are on every device you sign in from and
          survive a cleared browser. Without an account they would live only in this browser —
          and iPad Safari clears that storage on its own after about a week, with no way to get
          the work back. It is free while Coldgauge is in testing.
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <input
            type="email" inputMode="email" autoComplete="email"
            value={email} onChange={e => { setEmail(e.target.value); setErr(''); }}
            placeholder="Email" style={field}
          />
          <input
            type="password"
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            value={password} onChange={e => { setPassword(e.target.value); setErr(''); }}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder={signingUp ? 'Choose a password' : 'Password'} style={field}
          />
          {signingUp && (
            // Said up front rather than enforced by a dead button. A disabled
            // control with no explanation is the same as no explanation.
            <div style={{ fontSize: 10.5, color: tooShort ? colors.yellow : colors.textMuted, marginTop: -3 }}>
              At least 6 characters.
            </div>
          )}
        </div>

        {err && <div style={{ fontSize: 11.5, color: colors.yellow, marginTop: 10, lineHeight: 1.5 }}>{err}</div>}
        {note && <div style={{ fontSize: 11.5, color: colors.green, marginTop: 10, lineHeight: 1.5 }}>{note}</div>}

        <div style={{ marginTop: 16 }}>
          <Btn onClick={submit} disabled={busy} style={{ width: '100%' }}>
            {busy ? (signingUp ? 'Creating account…' : 'Signing in…')
              : (signingUp ? 'Create account' : 'Sign in')}
          </Btn>
        </div>

        <button
          onClick={swap}
          style={{
            background: 'transparent', border: 'none', color: colors.textDim, fontSize: 11.5,
            cursor: 'pointer', marginTop: 14, padding: 0, width: '100%', textAlign: 'center',
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {signingUp ? 'Already have an account? Sign in' : 'No account yet? Create one'}
        </button>

        <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 16, lineHeight: 1.6 }}>
          Trouble getting in? Email <span style={{ color: colors.textDim }}>support@coldgauge.com</span>.
        </div>
      </div>
    </div>
  );
}

export default function AccountGate({ children }) {
  const { configured, user, loading, signIn, signUp } = useAuth();
  const openAccess = import.meta.env.VITE_OPEN_ACCESS;
  if (!shouldGate({ openAccess, configured, loading, user })) return <>{children}</>;
  return <AccountWall signIn={signIn} signUp={signUp} />;
}
