import { useState } from 'react';
import { colors } from '../styles/theme.js';
import { Btn, Input } from './UI.jsx';
import { useAuth } from '../lib/auth.jsx';

// ── ACCOUNT BUTTON + LOGIN/SIGNUP MODAL ────────────────────────────────────────
// Header button that shows the signed-in email (or "Sign In"), and a modal with
// email+password sign in / sign up. Only rendered when cloud accounts are
// configured — otherwise the app is local-only and there's nothing to log into.
// onSignedIn fires after a successful login so the parent can pull cloud jobs.
export default function AuthButton({ onSignedIn }) {
  const { configured, user, signIn, signUp, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (!configured) return null;

  async function submit() {
    setMsg(''); setBusy(true);
    try {
      const fn = mode === 'signup' ? signUp : signIn;
      const res = await fn(email.trim(), password);
      if (res.error) { setMsg(res.error); return; }
      if (res.needsConfirm) { setMsg('Check your email to confirm your account, then sign in.'); setMode('signin'); return; }
      setOpen(false); setEmail(''); setPassword('');
      onSignedIn?.();
    } finally { setBusy(false); }
  }

  if (user) {
    return (
      <Btn variant="surface" size="sm" onClick={() => signOut()} title={user.email}>
        👤 {(user.email || '').split('@')[0]} · Sign out
      </Btn>
    );
  }

  return (
    <>
      <Btn variant="surface" size="sm" onClick={() => { setOpen(true); setMsg(''); }}>👤 Sign In</Btn>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 24, width: 360, maxWidth: '100%' }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
              {mode === 'signup' ? 'Create your account' : 'Sign in'}
            </div>
            <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 16 }}>
              Your jobs sync to the cloud so they’re on every device and safe from a cleared browser.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
                autoComplete="email" onKeyDown={e => e.key === 'Enter' && submit()} />
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} onKeyDown={e => e.key === 'Enter' && submit()} />
              {msg && <div style={{ fontSize: 12, color: colors.yellow }}>{msg}</div>}
              <Btn variant="green" onClick={submit} disabled={busy || !email.trim() || password.length < 6}>
                {busy ? '…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </Btn>
              <button onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMsg(''); }}
                style={{ background: 'transparent', border: 'none', color: colors.textDim, fontSize: 12, cursor: 'pointer' }}>
                {mode === 'signup' ? 'Already have an account? Sign in' : 'No account yet? Create one'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
