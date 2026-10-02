import { useState } from 'react';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Row } from './UI.jsx';
import { useStore, uid, fmt } from '../state/store.js';
import { hangerBasis } from './hangers.js';
import {
  dripPanLines, panLayout, blankWidthIn,
  PAN_LENGTH_FT, PAN_WIDTH_IN, LIP_IN, FOLD_IN, CIRCUIT_WIDTH_IN,
} from './dripPans.js';
import { fieldValue, fieldNumber, numberOr } from '../state/numberField.js';

// ── ADDED BY HAND, ON PURPOSE ───────────────────────────────────────────────
// "The pans should probably be manually added because some stores don't have
//  drop ceilings."
//
// So this is a card with a button, not another line on every generate. A store
// with no drop ceiling needs none, and a line that turns up on every job
// reading zero is a line people learn to scroll past — which is how a real
// zero stops being read.
//
// It still does the arithmetic. The only number the app cannot work out is how
// much of the route runs over the sales floor; everything else — the blank
// width out of the fold schedule, how many pans sit side by side given the
// circuit count on the route — follows from what he gave.
export default function DripPanCalc() {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [coveredFt, setCoveredFt] = useState('');

  const spacingFt = numberOr(state.rates?.hangerSpacingFt, 6);
  const basis = hangerBasis(state.circuits || [], 0, spacingFt);
  // Nothing horizontal on this job: no route, nothing to put a pan under.
  if (!(basis.routeFt > 0)) return null;
  // Nothing horizontal on this job: no route, nothing to put a pan under.


  const opts = {
    coveredFt: numberOr(coveredFt, 0),
    circuits: basis.circuits,
    panFt: numberOr(state.rates?.dripPanFt, PAN_LENGTH_FT),
    widthIn: numberOr(state.rates?.dripPanWidthIn, PAN_WIDTH_IN),
    lipIn: numberOr(state.rates?.dripPanLipIn, LIP_IN),
    foldIn: numberOr(state.rates?.dripPanFoldIn, FOLD_IN),
    circuitWidthIn: numberOr(state.rates?.circuitWidthIn, CIRCUIT_WIDTH_IN),
  };
  const layout = panLayout(opts);
  const blank = blankWidthIn(opts);

  function add() {
    dripPanLines(opts).forEach(l => dispatch({
      type: 'SET', key: 'lineItems', value: [...(state.lineItems || []), { id: uid(), ...l }],
    }));
    setOpen(false);
    setCoveredFt('');
  }

  return (
    <Card style={{ background: colors.surface }}>
      <div onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <div>
          <SLabel>🛢 Drip pans — fabricated</SLabel>
          <div style={{ fontSize: 11, color: colors.textDim, marginTop: 3 }}>
            Over the sales floor and under drop ceilings only — not every store has them, so this is
            added by hand.
          </div>
        </div>
        <span style={{ color: colors.textDim, fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11.5, color: colors.textDim, lineHeight: 1.65, marginBottom: 12 }}>
            The pipe route on this job is about <strong style={{ color: colors.text }}>{basis.routeFt} ft</strong>{' '}
            end to end, carrying <strong style={{ color: colors.text }}>{basis.circuits} circuit(s)</strong>.
            How much of it runs over the sales floor or under a drop ceiling is a walk of the piping
            plan — the app cannot read it off anything.
          </div>

          <Row style={{ gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Covered route (ft)</div>
              <Input type="number" value={fieldValue(coveredFt)}
                onChange={e => setCoveredFt(fieldNumber(e.target.value))}
                placeholder={`up to ${basis.routeFt}`} style={{ fontFamily: "'DM Mono',monospace" }} />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Circuit width (in)</div>
              <Input type="number" value={fieldValue(state.rates?.circuitWidthIn)}
                onChange={e => dispatch({ type: 'SET_RATES_MISC', key: 'circuitWidthIn', value: fieldNumber(e.target.value) })}
                placeholder={String(CIRCUIT_WIDTH_IN)} style={{ fontFamily: "'DM Mono',monospace" }} />
            </div>
          </Row>

          {layout.pans > 0 ? (
            <div style={{ fontSize: 11.5, color: colors.textDim, lineHeight: 1.7, padding: '10px 12px',
              background: colors.card2, borderRadius: 8, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Pans</span>
                <span style={{ fontFamily: "'DM Mono', monospace", color: colors.text }}>
                  {layout.long} long × {layout.wide} across = {layout.pans}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{layout.perPan} circuit(s) per pan</span>
                <span style={{ fontFamily: "'DM Mono', monospace", color: colors.text }}>
                  {opts.widthIn}" ÷ {opts.circuitWidthIn}"
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, paddingTop: 4,
                borderTop: `1px solid ${colors.border}`, color: colors.text }}>
                <span>Flat stock</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                  {layout.blankFt} ft of {Number.isInteger(blank) ? blank : Math.round(blank * 100) / 100}" blank
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: colors.textMuted, marginTop: 6 }}>
                Blank is the {opts.widthIn}" floor plus two {opts.lipIn}" lips and two {opts.foldIn}" hems.
                Shop time to brake them is labor, not material.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: colors.textMuted, marginBottom: 12 }}>
              Enter the covered feet to work out the pans.
            </div>
          )}

          <Btn variant="green" onClick={add} disabled={!(layout.pans > 0)} style={{ width: '100%', justifyContent: 'center' }}>
            + Add {layout.pans > 0 ? `${layout.pans} pan(s) — ${layout.blankFt} ft of stock` : 'drip pans'}
          </Btn>
        </div>
      )}
    </Card>
  );
}
