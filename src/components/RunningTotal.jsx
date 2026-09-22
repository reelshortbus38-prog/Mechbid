import { useState } from 'react';
import { colors } from '../styles/theme.js';
import { Btn } from './UI.jsx';
import { useStore, fmt } from '../state/store.js';
import { bidLetterBreakdown } from '../steps/bidTotals.js';
import { totalParts, missingFromTotal } from './runningTotal.js';

// ── THE NUMBER YOU ARE WORKING TOWARDS ──────────────────────────────────────
// "And should there be a button to tap to get the grand total from all?"
//
// There should, and the arithmetic was already there — computeBidTotals has
// produced the whole figure all along. It was only ever SHOWN on the Proposal
// step, so an estimator four steps back, adding case tops and saddles, could
// see a materials subtotal and nothing else. The one number the whole exercise
// is for was five taps away.
//
// ── IT SAYS WHAT IS NOT IN IT ───────────────────────────────────────────────
// A running total on an unfinished bid is a number that looks final and is
// not. On the Materials step there is usually no labor yet, so the figure is
// most of a bid missing its biggest line — and $80,766 in large green type
// reads as the answer whatever caption sits above it.
//
// So the panel lists what is still zero, by name. A total with nothing missing
// says so too, which is worth as much: it is the difference between a bid that
// is finished and one nobody has checked.

export default function RunningTotal() {
  const { state } = useStore();
  const [open, setOpen] = useState(false);

  const bd = bidLetterBreakdown(state, state.markupPct);
  const total = bd?.total || 0;
  const parts = totalParts(bd);
  const missing = missingFromTotal(bd);

  return (
    <>
      <Btn variant="surface" size="sm" onClick={() => setOpen(true)} title="Everything in this bid">
        Σ {total > 0 ? fmt(total) : 'Total'}
        {missing.length > 0 && total > 0 && (
          <span style={{ color: colors.yellow, marginLeft: 5 }}>•</span>
        )}
      </Btn>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 120,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 14,
              padding: 22, width: 400, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto' }}
          >
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 2 }}>
              Everything in this bid
            </div>
            <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 16 }}>
              The same arithmetic the Proposal step prints — sell price, with markup, tax and bond in it.
            </div>

            {parts.map(p => (
              <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '7px 0', borderBottom: `1px solid ${colors.border}`, gap: 12 }}>
                <span style={{ fontSize: 12, color: p.amount > 0 ? colors.text : colors.textMuted }}>
                  {p.label}
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12.5,
                  color: p.amount > 0 ? colors.text : colors.textMuted }}>
                  {fmt(p.amount)}
                </span>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              paddingTop: 12, gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>Total</span>
              <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color: colors.green }}>
                {fmt(total)}
              </span>
            </div>

            {missing.length > 0 ? (
              <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${colors.yellow}55`, background: 'rgba(234,179,8,0.07)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.yellow, marginBottom: 4 }}>
                  This is not a finished bid
                </div>
                <div style={{ fontSize: 11.5, color: colors.textDim, lineHeight: 1.6 }}>
                  Nothing is priced for {missing.join(', ')}. The figure above is real as far as it
                  goes and it is not the number you send.
                </div>
              </div>
            ) : total > 0 && (
              <div style={{ marginTop: 14, fontSize: 11, color: colors.textDim, lineHeight: 1.6 }}>
                Every part of the bid has something in it. That is not the same as being right —
                the Proposal step runs the pre-flight checks.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
