import { useState } from 'react';
import { colors } from '../styles/theme.js';
import { Btn } from './UI.jsx';
import { LAST_UPDATED, termsSections, privacySections } from './legalText.js';
import { loadCompanyProfile } from '../state/store.js';
import {
  loadAcceptance, recordAcceptance, needsAcceptance, acceptanceKind,
} from './termsAcceptance.js';

// ── THE ACCEPTANCE GATE ──────────────────────────────────────────────────────
// Shown once, before the app is usable, and again only when the terms change.
//
// Three deliberate choices:
//
//   The disclaimer is ON THE SCREEN, not behind a link. What is being agreed to
//   is that this produces ESTIMATES and the estimator verifies them. That is
//   the clause the whole liability position rests on, and hiding it behind "I
//   agree to the Terms" would defeat the point of asking.
//
//   The button is DISABLED until the checkbox is ticked. A pre-ticked box or a
//   single "Continue" is not an affirmative act, and an agreement nobody had to
//   act on is the browsewrap problem again with extra steps.
//
//   A STORAGE FAILURE DOES NOT LOCK THE USER OUT. If the acceptance cannot be
//   written, the app still opens and says so. Locking a contractor out of their
//   own bids the morning of a deadline, because their browser blocks storage, is
//   a worse outcome than an unrecorded acceptance.

function FullText({ profile }) {
  const [tab, setTab] = useState('terms');
  const items = tab === 'terms' ? termsSections(profile) : privacySections(profile);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[['terms', 'Terms of Service'], ['privacy', 'Privacy Policy']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${tab === k ? colors.green : colors.border}`,
              background: tab === k ? colors.greenFaint : 'transparent',
              color: tab === k ? colors.green : colors.textDim,
            }}
          >{label}</button>
        ))}
      </div>
      <div style={{ maxHeight: '34vh', overflowY: 'auto', border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12, background: colors.card2 }}>
        {items.map(([h, body], i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.text, marginBottom: 2 }}>{h}</div>
            <div style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.6 }}>{body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TermsGate({ children }) {
  const [profile] = useState(() => loadCompanyProfile());
  const [accepted, setAccepted] = useState(() => {
    try { return loadAcceptance(localStorage); } catch { return null; }
  });
  const [ticked, setTicked] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [saveWarning, setSaveWarning] = useState('');

  const kind = acceptanceKind(accepted, LAST_UPDATED);
  // Fragment, not a bare `children` — children is an array here, and returning
  // one raw makes React ask for keys on the app's top-level components.
  if (!needsAcceptance(accepted, LAST_UPDATED)) return <>{children}</>;

  function accept() {
    let ok = false;
    try { ok = recordAcceptance(localStorage, LAST_UPDATED); } catch { ok = false; }
    if (!ok) setSaveWarning('Your browser blocked saving this, so you may be asked again next time.');
    // Open the app either way — see the note above about not locking anyone out.
    setAccepted({ version: LAST_UPDATED, at: new Date().toISOString() });
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000, background: colors.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        background: colors.card, border: `1px solid ${colors.border2}`, borderRadius: 14,
        maxWidth: 620, width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 22,
      }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 900, color: colors.text, marginBottom: 4 }}>
          COLD<span style={{ color: colors.green }}>GAUGE</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, marginBottom: 12 }}>
          {kind === 'updated' ? 'The terms have been updated' : 'Before you start'}
        </div>

        {kind === 'updated' && (
          <div style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.6, marginBottom: 12 }}>
            The Terms of Service and Privacy Policy have changed since you last accepted them.
            Please review and accept the current version to continue.
          </div>
        )}

        {/* The clause the whole thing rests on, in front of them rather than
            behind a link. */}
        <div style={{
          border: `1px solid ${colors.yellow}55`, background: 'rgba(234,179,8,0.07)',
          borderRadius: 8, padding: '12px 14px', marginBottom: 14, lineHeight: 1.65,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.yellow, marginBottom: 6 }}>
            This tool produces estimates, not certified takeoffs.
          </div>
          <div style={{ fontSize: 11.5, color: colors.textDim }}>
            Coldgauge assists with takeoff, pricing and proposals. Quantities, sizes, scope and prices are
            derived in part from <strong style={{ color: colors.text }}>automated extraction of documents you
            upload</strong> and in part from <strong style={{ color: colors.text }}>default values built into
            the app</strong>. Both can be wrong.
            <br /><br />
            You are responsible for verifying every figure — quantities, pipe and duct sizes, equipment
            selections, labor hours, scope and pricing — against the final construction documents, the
            applicable codes and actual field conditions, <strong style={{ color: colors.text }}>before you
            submit a bid</strong>. Bids you submit are yours.
          </div>
        </div>

        <button
          onClick={() => setShowFull(v => !v)}
          style={{ background: 'none', border: 'none', color: colors.green, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          {showFull ? 'Hide the full documents' : 'Read the full Terms of Service and Privacy Policy'}
        </button>
        {showFull && <FullText profile={profile} />}

        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
          marginTop: 16, padding: '12px 14px', borderRadius: 8,
          border: `1px solid ${ticked ? colors.green : colors.border}`,
          background: ticked ? colors.greenFaint : colors.card2,
        }}>
          <input
            type="checkbox"
            checked={ticked}
            onChange={e => setTicked(e.target.checked)}
            style={{ width: 18, height: 18, flexShrink: 0, marginTop: 1, accentColor: colors.green, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 12, color: colors.text, lineHeight: 1.5 }}>
            I have read and agree to the Terms of Service and Privacy Policy, and I understand that I am
            responsible for verifying every figure before submitting a bid.
          </span>
        </label>

        {saveWarning && (
          <div style={{ fontSize: 11, color: colors.yellow, marginTop: 10 }}>{saveWarning}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 10, color: colors.textMuted }}>Version {LAST_UPDATED}</div>
          <Btn onClick={accept} disabled={!ticked}>Accept and continue</Btn>
        </div>
      </div>
    </div>
  );
}
