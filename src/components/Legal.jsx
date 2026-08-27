import { useState } from 'react';
import { colors } from '../styles/theme.js';
import { loadCompanyProfile, saveCompanyProfile } from '../state/store.js';
import { loadAcceptance, acceptedOn } from './termsAcceptance.js';
import {
  termsSections, privacySections, LEGAL_FIELDS, legalGaps, legalReady, LAST_UPDATED,
} from './legalText.js';

// ── TERMS + PRIVACY ──────────────────────────────────────────────────────────
// The text lives in legalText.js and is real, not a shell. What is here is the
// modal, and the four fields that turn a template into a document: entity name,
// governing state, contact email, mailing address.
//
// Until those are filled the policy renders "[Legal entity name]" on the page,
// which is worse than saying nothing — it announces that nobody finished it. So
// the gap is reported at the top with the fields right there to fix it.

function Section({ title, items }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800, color: colors.green, marginBottom: 10 }}>{title}</div>
      {items.map(([h, body], i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.text, marginBottom: 2 }}>{h}</div>
          <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.6 }}>{body}</div>
        </div>
      ))}
    </div>
  );
}

function FillIn({ profile, onChange }) {
  const gaps = legalGaps(profile);
  const [open, setOpen] = useState(gaps.length > 0);
  const set = (k, v) => {
    const next = { ...profile, [`legal_${k}`]: v };
    onChange(next);
    saveCompanyProfile(next);
  };

  return (
    <div style={{
      border: `1px solid ${gaps.length ? colors.yellow + '55' : colors.border}`,
      background: gaps.length ? 'rgba(234,179,8,0.07)' : 'rgba(34,197,94,0.05)',
      borderRadius: 8, padding: '10px 12px', marginBottom: 18,
    }}>
      <div onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', fontSize: 11, lineHeight: 1.6, color: colors.textDim }}>
        <strong style={{ color: gaps.length ? colors.yellow : colors.green }}>
          {gaps.length
            ? `⚠ ${gaps.length} detail${gaps.length === 1 ? '' : 's'} still to fill in`
            : '✓ These policies are filled in and ready to publish'}
        </strong>
        <span style={{ float: 'right', color: colors.textDim }}>{open ? '▲' : '▼'}</span>
        <br />
        {gaps.length
          ? 'The wording below is complete. These four facts are the only things it cannot know, and until they are set the page shows them in brackets.'
          : 'Everything below carries your details. Review the wording, then link this page from your signup and checkout.'}
      </div>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginTop: 10 }}>
          {LEGAL_FIELDS.map(f => (
            <div key={f.k}>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 3 }}>{f.label}</div>
              <input
                value={profile[`legal_${f.k}`] || ''}
                onChange={e => set(f.k, e.target.value)}
                placeholder={f.ph}
                style={{
                  width: '100%', background: colors.card2, border: `1px solid ${colors.border}`,
                  borderRadius: 6, color: colors.text, fontSize: 12, padding: '7px 9px',
                  fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box',
                }} />
              <div style={{ fontSize: 9, color: colors.textMuted, marginTop: 2 }}>{f.why}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Legal() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(() => loadCompanyProfile());
  const ready = legalReady(profile);
  // What this browser agreed to, and when. Shown so the record is inspectable
  // rather than only existing in storage.
  const acceptance = (() => { try { return loadAcceptance(localStorage); } catch { return null; } })();
  const acceptedDate = acceptedOn(acceptance);

  return (
    <>
      <div style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 900 }}>
        <button onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', color: ready ? colors.textMuted : colors.yellow, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
          Terms · Privacy{ready ? '' : ' ⚠'}
        </button>
      </div>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: colors.card, border: `1px solid ${colors.border2}`, borderRadius: 14, maxWidth: 680, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 900 }}>Legal</div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: colors.textDim, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <FillIn profile={profile} onChange={setProfile} />

            {/* Two situations the generic wording does not reach, both about who
                signs up rather than about how the app is written. */}
            <div style={{ fontSize: 10, color: colors.textDim, background: 'rgba(148,163,184,0.06)', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 10px', marginBottom: 18, lineHeight: 1.6 }}>
              <strong style={{ color: colors.text }}>Two cases these do not fully cover.</strong> If you take
              users in the <strong>EU or UK</strong>, GDPR adds required disclosures — a legal basis stated per
              purpose, an in-region representative, and a 72-hour breach clock. If you cross the revenue or data
              thresholds for <strong>California’s CCPA/CPRA</strong>, its notice requirements attach as well.
              Both are about who signs up, not about how the app works, and neither is attempted below.
            </div>

            <Section title="Privacy Policy" items={privacySections(profile)} />
            <div style={{ height: 1, background: colors.border, margin: '6px 0 18px' }} />
            <Section title="Terms of Service" items={termsSections(profile)} />
            <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 8 }}>
              Last updated: {LAST_UPDATED}
              {acceptedDate && <> · You accepted version {acceptance.version} on {acceptedDate}</>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
