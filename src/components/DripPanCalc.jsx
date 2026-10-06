import { useState } from 'react';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Row } from './UI.jsx';
import { useStore, uid, fmt } from '../state/store.js';
import { hangerBasis } from './hangers.js';
import {
  dripPanLines, panLayout, blankWidthIn,
  PAN_LENGTH_FT, PAN_WIDTH_IN, LIP_IN, FOLD_IN, CIRCUIT_WIDTH_IN,
  SHEET_WIDTH_IN, SHEET_LENGTH_FT, SOURCE_FABRICATE, SOURCE_BUY,
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
  const { state } = useStore();
  const [open, setOpen] = useState(false);

  const spacingFt = numberOr(state.rates?.hangerSpacingFt, 6);
  const basis = hangerBasis(state.circuits || [], 0, spacingFt);
  // Nothing horizontal on this job: no route, nothing to put a pan under.
  if (!(basis.routeFt > 0)) return null;

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

      {open && <DripPanBody onAdded={() => setOpen(false)} />}
    </Card>
  );
}

// ── EXPORTED SO A TEST CAN SEE IT ───────────────────────────────────────────
// The card above is collapsed until somebody taps it, and the render tests in
// this project cannot tap. Every screen that mattered and was only checked
// through a collapsed parent turned out to be checked by a source-grep that
// passed while nothing was wired — the fabricate/buy toggle is exactly that
// shape, so the body is its own component and the test renders it directly.
export function DripPanBody({ onAdded = () => {} }) {
  const { state, dispatch } = useStore();

  // ── THE COVERED FEET BELONG TO THE BID ────────────────────────────────────
  // This was component state, which meant collapsing the card threw it away
  // and reopening it asked again. It is not a scratch value — it is how much
  // of THIS store's route runs over the sales floor, a number somebody got by
  // walking the piping plan, and it should still be there tomorrow.
  const coveredFt = state.dripPanCoveredFt ?? '';
  const setCoveredFt = value => dispatch({ type: 'SET', key: 'dripPanCoveredFt', value });

  const spacingFt = numberOr(state.rates?.hangerSpacingFt, 6);
  const basis = hangerBasis(state.circuits || [], 0, spacingFt);

  // Fabricate or buy. A shop with a brake orders sheet; one without orders
  // finished pans and has no use for a sheet count. It is a fact about the
  // shop's building rather than this job, so it sits in rates, which is what
  // the company profile captures.
  const source = state.rates?.dripPanSource === SOURCE_BUY ? SOURCE_BUY : SOURCE_FABRICATE;
  const fabricating = source === SOURCE_FABRICATE;

  const opts = {
    source,
    sheetWidthIn: numberOr(state.rates?.sheetWidthIn, SHEET_WIDTH_IN),
    sheetLengthFt: numberOr(state.rates?.sheetLengthFt, SHEET_LENGTH_FT),
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
    onAdded();
    // The covered feet stay. They are the walked number for this store, not a
    // scratch entry, and wiping them is what made the figure disposable.
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11.5, color: colors.textDim, lineHeight: 1.65, marginBottom: 12 }}>
        The pipe route on this job is about <strong style={{ color: colors.text }}>{basis.routeFt} ft</strong>{' '}
        end to end, carrying <strong style={{ color: colors.text }}>{basis.circuits} circuit(s)</strong>.
        How much of it runs over the sales floor or under a drop ceiling is a walk of the piping
        plan — the app cannot read it off anything.
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[[SOURCE_FABRICATE, 'We fabricate them'], [SOURCE_BUY, 'We buy them built']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => dispatch({ type: 'SET_RATES_MISC', key: 'dripPanSource', value: k })}
            style={{
              flex: 1, minHeight: 40, borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              border: `1px solid ${source === k ? colors.green : colors.border}`,
              background: source === k ? colors.greenFaint : 'transparent',
              color: source === k ? colors.green : colors.textDim,
            }}
          >{label}</button>
        ))}
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
            <span>{fabricating ? 'Sheet metal' : 'Pans to buy'}</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
              {fabricating
                ? `${layout.sheets} sheet(s) at ${layout.perSheet} per`
                : `${layout.pans} ea`}
            </span>
          </div>
          {fabricating && (
            <div style={{ fontSize: 10.5, color: colors.textMuted, marginTop: 6 }}>
              Blank is the {opts.widthIn}" floor plus two {opts.lipIn}" lips and two {opts.foldIn}" hems —{' '}
              {Number.isInteger(blank) ? blank : Math.round(blank * 100) / 100}" into a{' '}
              {opts.sheetWidthIn}" sheet. Shop time to brake them is labor, not material.
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: colors.textMuted, marginBottom: 12 }}>
          Enter the covered feet to work out the pans.
        </div>
      )}

      <Btn variant="green" onClick={add} disabled={!(layout.pans > 0)} style={{ width: '100%', justifyContent: 'center' }}>
        + Add {layout.pans > 0
          ? `${layout.pans} pan(s)${fabricating ? ` — ${layout.sheets} sheet(s)` : ''}`
          : 'drip pans'}
      </Btn>
    </div>
  );
}
