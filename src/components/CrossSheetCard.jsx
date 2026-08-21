import { useStore } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Card, SLabel } from './UI.jsx';
import { ledgerSummary, sheetsInLedger, factLabel } from '../api/jobFacts.js';
import { reconcile, reconcileSummary } from '../api/factReconcile.js';

// ── WHAT THE SHEETS SAY ABOUT EACH OTHER ─────────────────────────────────────
// Every per-sheet check the app has looks at one drawing. This is the only view
// that looks BETWEEN them, so it says out loud how many it has to work with —
// a single sheet cannot disagree with itself, and an estimator staring at an
// empty panel deserves to know that is why rather than assuming it passed.

const TONE = { blocker: colors.red, verify: colors.yellow, ok: colors.green, fyi: colors.textDim };
const ICON = { blocker: '⛔', verify: '⚠', ok: '✓', fyi: 'ℹ' };

export default function CrossSheetCard() {
  const { state } = useStore();
  const ledger = state.jobFacts || [];
  const sheets = sheetsInLedger(ledger);
  const findings = reconcile(ledger, { plantHeadFt: 0 });
  const summary = reconcileSummary(findings);

  if (!ledger.length) return null;

  return (
    <Card style={{ background: colors.surface }}>
      <SLabel>🔗 Cross-Sheet Check</SLabel>
      <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.6, marginBottom: 12 }}>
        Every other check in Coldgauge reads one sheet. This one reads what the sheets say about{' '}
        <strong>each other</strong> — a pump schedule against a control sequence, a fluid stated in
        two places, the drawing's own answer against the app's.
        <br />
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{ledgerSummary(ledger)}</span>
      </div>

      {sheets.length < 2 && (
        <div style={{ fontSize: 12, marginBottom: 12, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(59,130,246,0.06)', border: `1px solid ${colors.blue}40`, color: colors.textDim }}>
          Only <strong>one sheet</strong> has contributed facts so far. Cross-checks need two —
          analyse another sheet from the same set and the comparisons below fill in. Upload them a
          few at a time if the set is large; the ledger keeps what earlier sheets said.
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 600, color: TONE[summary.tone], marginBottom: 10 }}>
        {ICON[summary.tone]} {summary.text}
      </div>

      {findings.map((x, i) => (
        <div key={i} style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 8,
          background: x.severity === 'blocker' ? 'rgba(239,68,68,0.08)'
            : x.severity === 'verify' ? 'rgba(234,179,8,0.06)' : 'rgba(34,197,94,0.05)',
          border: `1px solid ${TONE[x.severity]}40` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: x.severity === 'ok' ? colors.textDim : colors.text }}>
            {ICON[x.severity]} {x.label}
          </div>
          <div style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.5, marginTop: 3 }}>{x.detail}</div>
          <div style={{ fontSize: 10, color: colors.textDim, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
            {x.sheets.filter(Boolean).join('  +  ') || 'sheet not recorded'}
          </div>
        </div>
      ))}

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 11, color: colors.textDim }}>
          Everything the sheets stated ({ledger.length})
        </summary>
        <div style={{ marginTop: 8, border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {ledger.map((f, i) => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 10px',
              fontSize: 11, borderBottom: i < ledger.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
              <span style={{ minWidth: 0 }}>
                <strong>{factLabel(f.kind)}</strong>
                {f.subject && <span style={{ color: colors.textDim }}> — {f.subject}</span>}
                {f.system && <span style={{ color: colors.textDim, fontSize: 10 }}> [{f.system}]</span>}
              </span>
              <span style={{ whiteSpace: 'nowrap', fontFamily: "'DM Mono', monospace" }}>
                {f.value} {f.unit}
                <span style={{ color: colors.textDim, fontSize: 10 }}> · {f.sheet || '—'}</span>
              </span>
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}
