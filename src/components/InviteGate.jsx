import { useState } from 'react';
import { colors } from '../styles/theme.js';
import { Btn } from './UI.jsx';
import { useAuth } from '../lib/auth.jsx';
import { shouldGate } from '../lib/inviteGate.js';
import { BRAND_HEAD, BRAND_TAIL } from './brand.js';

// ── THE INVITE GATE ──────────────────────────────────────────────────────────
// Sign-in only. There is deliberately no "create an account" here: admission is
// controlled in Supabase by turning public sign-ups OFF and creating accounts by
// hand. A sign-up form on this screen would make the gate decorative.
//
// It says WHY the app is closed rather than just refusing. "Private beta" with
// no reason reads as a marketing funnel; the real reason — labor units that have
// not been calibrated against a finished job yet — is the thing an estimator
// would actually want to know before trusting a number.

export default function InviteGate({ children }) {
  const { configured, user, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const flag = import.meta.env.VITE_INVITE_ONLY;
  if (!shouldGate({ flag, configured, loading, user })) return <>{children}</>;

  async function submit() {
    if (!email.trim() || !password) { setErr('Enter your email and password.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await signIn(email.trim(), password);
      // On success the auth listener flips `user` and this component unmounts;
      // nothing to do here but report a failure.
      if (r?.error) setErr(r.error);
    } catch (e) {
      setErr(e?.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
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
      fontFamily: "'DM Sans', sans-serif",
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
          Private beta — sign in to continue
        </div>
        <div style={{ fontSize: 11.5, color: colors.textDim, lineHeight: 1.65, marginBottom: 18 }}>
          Coldgauge is in testing with a small number of contractors. Its labor units
          have not yet been calibrated against completed jobs, so bids built on them
          need checking against your own history before they go out. Access is by
          invitation until that work is done.
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <input
            type="email" inputMode="email" autoComplete="email"
            value={email} onChange={e => { setEmail(e.target.value); setErr(''); }}
            placeholder="Email" style={field}
          />
          <input
            type="password" autoComplete="current-password"
            value={password} onChange={e => { setPassword(e.target.value); setErr(''); }}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="Password" style={field}
          />
        </div>

        {err && <div style={{ fontSize: 11.5, color: colors.yellow, marginTop: 10, lineHeight: 1.5 }}>{err}</div>}

        <div style={{ marginTop: 16 }}>
          <Btn onClick={submit} disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Btn>
        </div>

        <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 16, lineHeight: 1.6 }}>
          Need access? Email <span style={{ color: colors.textDim }}>support@coldgauge.com</span>.
        </div>
      </div>
    </div>
  );
}
