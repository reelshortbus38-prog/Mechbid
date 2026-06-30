import { useState } from 'react';
import { colors } from '../styles/theme.js';

// Privacy Policy + Terms of Service shell. The STRUCTURE and section headings
// are here; the wording is placeholder and MUST be reviewed/replaced with real
// legal text (an attorney or a generator like Termly/iubenda) before selling.
// Kept in-app so there's a real link to point Stripe and customers at.
const COMPANY = '[Your Company / DBA]';
const CONTACT = '[your contact email]';

const PRIVACY = [
  ['Who we are', `MechBid ("the Service") is operated by ${COMPANY}. Questions: ${CONTACT}.`],
  ['What we collect', 'Account details you provide (name, email, company); the bid documents and data you upload (schedules, blueprints, equipment lists, pricing); and basic usage data needed to run the Service.'],
  ['How uploaded documents are processed', 'To extract takeoff data, the contents of documents you upload are sent to third-party AI providers — OpenAI (via OpenRouter) and Anthropic — for processing. These providers process the data to return extraction results. Do not upload documents you are not authorized to share.'],
  ['Third parties we use', 'AI processing: OpenAI / OpenRouter, Anthropic. Hosting: Vercel. Database/auth: Supabase. Payments: Stripe (we do not store full card numbers — Stripe handles payment data). Each processes data only to provide their part of the Service.'],
  ['How we use your data', 'To provide and improve the Service, generate estimates, maintain your saved jobs, process subscriptions, and provide support. We do not sell your personal information.'],
  ['Data retention & deletion', 'We keep your data while your account is active. You can request export or deletion of your account data by contacting us.'],
  ['Your choices', 'You can edit or delete jobs in the app, and request account deletion. Depending on where you live, you may have additional rights over your data.'],
  ['Changes', 'We will post any changes to this policy here and update the date below.'],
];

const TERMS = [
  ['Acceptance', `By using MechBid you agree to these Terms. If you do not agree, do not use the Service.`],
  ['The Service is an estimating aid', 'MechBid produces ESTIMATES generated, in part, by automated extraction from the documents you provide. It is a tool to assist a qualified estimator — not a substitute for one.'],
  ['Your responsibility to verify', 'You are solely responsible for reviewing and verifying all extracted data, quantities, pipe/duct sizes, equipment, scope, and pricing against the final construction documents and actual field conditions before submitting or relying on any bid.'],
  ['No warranty', 'The Service is provided "as is" without warranties of any kind. We do not warrant that extracted data or estimates are accurate, complete, or fit for a particular purpose.'],
  ['Limitation of liability', `To the maximum extent permitted by law, ${COMPANY} is not liable for any lost profits, bid losses, or other damages arising from use of the Service or from errors in extracted or estimated data.`],
  ['Subscriptions & billing', 'Paid plans are billed through Stripe on a recurring basis until cancelled. [Add your billing cycle, refund, and cancellation terms here.]'],
  ['Acceptable use', 'Do not upload content you lack the right to share, attempt to break or misuse the Service, or use it unlawfully.'],
  ['Contact', `Questions about these Terms: ${CONTACT}.`],
];

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

export default function Legal() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 900 }}>
        <button onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', color: colors.textMuted, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
          Terms · Privacy
        </button>
      </div>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: colors.card, border: `1px solid ${colors.border2}`, borderRadius: 14, maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 900 }}>Legal</div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: colors.textDim, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 10, color: colors.yellow, background: 'rgba(234,179,8,0.08)', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 10px', marginBottom: 18, lineHeight: 1.5 }}>
              ⚠️ Template text — review and replace with attorney-approved language before charging customers.
            </div>
            <Section title="Privacy Policy" items={PRIVACY} />
            <div style={{ height: 1, background: colors.border, margin: '6px 0 18px' }} />
            <Section title="Terms of Service" items={TERMS} />
            <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 8 }}>Last updated: [date]</div>
          </div>
        </div>
      )}
    </>
  );
}
