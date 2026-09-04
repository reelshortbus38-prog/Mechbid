import { useState } from 'react';
import { useStore, uid, normalizePipeSize } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Select, Row, EmptyState } from '../components/UI.jsx';
import { newHeader, headerSanityNote, HOME_RUN, SHARED_HEADER } from '../components/headers.js';

// Stops at 3-1/8 no longer: a loop system's shared suction header runs 3-5/8,
// 4-1/8 and larger, and a size the dropdown does not offer is a size the
// estimator cannot enter at all.
const PIPE_SIZES = ['', '1/4"', '3/8"', '1/2"', '5/8"', '7/8"', '1-1/8"', '1-3/8"', '1-5/8"', '2-1/8"', '2-5/8"', '3-1/8"', '3-5/8"', '4-1/8"', '5-1/8"', '6-1/8"'];
const TEMP_TYPES = ['medium', 'low'];

function CircuitRow({ circuit, onUpdate, onRemove }) {
  return (
    <div style={{
      background: colors.card2, border: `1px solid ${colors.border}`,
      borderRadius: 10, padding: '14px 16px', marginBottom: 10,
    }}>
      <Row style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        {/* Circuit ID */}
        <div style={{ flex: '0 0 80px' }}>
          <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Circuit ID</div>
          <Input
            value={circuit.circuitId || ''}
            onChange={e => onUpdate('circuitId', e.target.value)}
            placeholder="A6"
            style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}
          />
        </div>

        {/* Application */}
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Application / Location</div>
          <Input value={circuit.application || ''} onChange={e => onUpdate('application', e.target.value)} placeholder="MD Produce 2-4, N71" />
        </div>

        {/* Temp type */}
        <div style={{ flex: '0 0 110px' }}>
          <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Temp Type</div>
          <Select value={circuit.tempType || 'medium'} onChange={e => onUpdate('tempType', e.target.value)}>
            <option value="medium">Medium Temp</option>
            <option value="low">Low Temp</option>
          </Select>
        </div>
      </Row>

      {/* Riser only toggle */}
      <Row style={{ marginBottom: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: colors.text }}>
          <input
            type="checkbox"
            checked={circuit.isRiserOnly || false}
            onChange={e => onUpdate('isRiserOnly', e.target.checked)}
            style={{ accentColor: colors.green }}
          />
          Riser only (no horizontal run)
        </label>
      </Row>

      <Row style={{ flexWrap: 'wrap', gap: 8 }}>
        {/* Run length */}
        {!circuit.isRiserOnly && (
          <div style={{ flex: '0 0 90px' }}>
            <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Run (ft)</div>
            <Input type="number" value={circuit.runLength || ''} onChange={e => onUpdate('runLength', e.target.value)} placeholder="0" />
          </div>
        )}

        {/* Riser length */}
        <div style={{ flex: '0 0 90px' }}>
          <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Riser (ft)</div>
          <Input type="number" value={circuit.riserLength || ''} onChange={e => onUpdate('riserLength', e.target.value)} placeholder="20" />
        </div>

        {/* Suc Horiz */}
        {!circuit.isRiserOnly && (
          <div style={{ flex: '0 0 100px' }}>
            <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Suc Horiz</div>
            <Select value={circuit.sucHoriz || ''} onChange={e => onUpdate('sucHoriz', e.target.value)}>
              {PIPE_SIZES.map(s => <option key={s} value={s}>{s || '--'}</option>)}
            </Select>
          </div>
        )}

        {/* Suc Riser */}
        <div style={{ flex: '0 0 100px' }}>
          <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Suc Riser</div>
          <Select value={circuit.sucRiser || ''} onChange={e => onUpdate('sucRiser', e.target.value)}>
            {PIPE_SIZES.map(s => <option key={s} value={s}>{s || '--'}</option>)}
          </Select>
        </div>

        {/* Liq Horiz — riser-only circuits deliberately have NO liquid field:
            per the estimator, a riser-only drop is the suction line only;
            the liquid doesn't get a riser. */}
        {!circuit.isRiserOnly && (
          <div style={{ flex: '0 0 100px' }}>
            <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Liq Horiz</div>
            <Select value={circuit.liqHoriz || ''} onChange={e => onUpdate('liqHoriz', e.target.value)}>
              {PIPE_SIZES.map(s => <option key={s} value={s}>{s || '--'}</option>)}
            </Select>
          </div>
        )}
      </Row>

      {/* Notes */}
      {circuit.notes && (
        <div style={{ marginTop: 8, fontSize: 11, color: colors.textDim, padding: '6px 10px', background: colors.surface, borderRadius: 6 }}>
          {circuit.notes}
        </div>
      )}

      <Row style={{ marginTop: 10, justifyContent: 'flex-end' }}>
        <Btn variant="red" size="sm" onClick={onRemove}>Remove Circuit</Btn>
      </Row>
    </div>
  );
}

export default function Step2_Circuits({ onNext, onBack }) {
  const { state, dispatch } = useStore();

  function addCircuit() {
    dispatch({
      type: 'ADD_CIRCUIT',
      circuit: { id: uid(), circuitId: '', rack: '', application: '', runLength: 0, riserLength: 20, sucHoriz: '', sucRiser: '', liqHoriz: '', tempType: 'medium', isRiserOnly: false, notes: '' }
    });
  }

  function updateCircuit(id, field, value) {
    dispatch({ type: 'UPDATE_CIRCUIT', id, updates: { [field]: value } });
  }

  function removeCircuit(id) {
    dispatch({ type: 'REMOVE_CIRCUIT', id });
  }

  const totalRun = state.circuits.reduce((s, c) => s + (parseFloat(c.runLength) || 0), 0);
  const totalRiser = state.circuits.reduce((s, c) => s + (parseFloat(c.riserLength) || 0), 0);
  const lowTemp = state.circuits.filter(c => c.tempType === 'low').length;
  const medTemp = state.circuits.filter(c => c.tempType === 'medium').length;

  const headers = state.headers || [];
  const setHeaders = v => dispatch({ type: 'SET', key: 'headers', value: v });
  const addHeader = () => setHeaders([...headers, newHeader(uid())]);
  const updHeader = (id, k, v) => setHeaders(headers.map(h => h.id === id ? { ...h, [k]: v } : h));
  const delHeader = id => setHeaders(headers.filter(h => h.id !== id));
  const headerFt = headers.reduce((a, h) => a + (Number(h.lengthFt) || 0), 0);
  // The note has to know what the JOB says. Handed only circuits and headers it
  // could not tell "no header because home run" from "no header yet", and told
  // an estimator on a correct home-run job that he was missing pipe.
  const layout = state.pipingLayout || '';
  const sanity = headerSanityNote(state.circuits, headers, {
    secondaryLoop: state.secondaryLoop, pipingLayout: layout,
  });
  const setLayout = v => dispatch({ type: 'SET', key: 'pipingLayout', value: layout === v ? '' : v });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Shared suction header, or home run ──────────────────────────────
          Deliberately NOT called a "loop" any more. Setup already has a
          SECONDARY LOOP setting — glycol or water pumped to case coils — and
          two different things both called a loop in one app is how a correct
          warning came to read as the app ignoring a setting somebody had
          already given it. */}
      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <SLabel>🔁 Suction Header / Main</SLabel>
          <Btn variant="ghost" size="sm" onClick={addHeader}>+ Add header</Btn>
        </Row>
        <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.6, marginBottom: 10 }}>
          Where a store runs a <strong>shared suction header</strong>, it leaves the rack, circles the sales floor,
          and every lineup taps into it. It is <strong>one pipe</strong> — enter it here once, and let each circuit
          below carry only the <strong>branch from its tap to the case</strong>. Rolled into the circuits instead, a
          thirty-circuit job buys thirty headers. On a <strong>home run</strong> store there is no header and every
          circuit pipes back to the rack on its own.
        </div>

        {/* Answer it once. Nothing is assumed from silence: leave it unset and
            the check below still speaks up on a job that looks like it is
            double-counting a header. */}
        <Row style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>This store is</span>
          {[[SHARED_HEADER, 'Shared header'], [HOME_RUN, 'Home run']].map(([k, label]) => (
            <button key={k} onClick={() => setLayout(k)}
              style={{ padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                border: `1px solid ${layout === k ? colors.green : colors.border}`,
                background: layout === k ? colors.green : colors.surface,
                color: layout === k ? '#000' : colors.textDim }}>{label}</button>
          ))}
          {!layout && <span style={{ fontSize: 11, color: colors.textDim }}>— not set</span>}
        </Row>

        {sanity && (
          <div style={{ fontSize: 12, marginBottom: 10, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(234,179,8,0.08)', border: `1px solid ${colors.yellow}40`, color: colors.yellow }}>
            ⚠ {sanity}
          </div>
        )}

        {headers.map(h => (
          <Row key={h.id} style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Input value={h.label} onChange={e => updHeader(h.id, 'label', e.target.value)}
              placeholder="MT header / rack A loop" style={{ flex: 1, minWidth: 150 }} />
            <Select value={h.size} onChange={e => updHeader(h.id, 'size', e.target.value)} style={{ width: 100 }}>
              {PIPE_SIZES.map(x => <option key={x} value={x}>{x || '--'}</option>)}
            </Select>
            <Input type="number" value={h.lengthFt} onChange={e => updHeader(h.id, 'lengthFt', e.target.value)}
              placeholder="ft" style={{ width: 90, textAlign: 'center', fontFamily: "'DM Mono',monospace" }} />
            <Select value={h.lineType} onChange={e => updHeader(h.id, 'lineType', e.target.value)} style={{ width: 110 }}>
              <option value="suction">Suction</option><option value="liquid">Liquid</option>
            </Select>
            <Select value={h.tempType} onChange={e => updHeader(h.id, 'tempType', e.target.value)} style={{ width: 110 }}>
              <option value="medium">Med temp</option><option value="low">Low temp</option>
            </Select>
            <button onClick={() => delHeader(h.id)}
              style={{ background: 'transparent', border: 'none', color: colors.red, cursor: 'pointer', fontSize: 16 }}>×</button>
          </Row>
        ))}

        {headers.length === 0
          ? <div style={{ fontSize: 12, color: colors.textDim }}>No shared header — correct for a home-run layout where every circuit pipes back to the rack on its own.</div>
          : <div style={{ fontSize: 12, color: colors.textDim, fontFamily: "'DM Mono',monospace" }}>{headers.length} header(s) · {headerFt} ft — counted ONCE in materials</div>}
      </Card>

      {/* Stats */}
      {state.circuits.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            { label: 'Circuits', value: state.circuits.length, color: colors.green },
            { label: 'Total Run', value: `${totalRun}ft`, color: colors.text },
            { label: 'Med Temp', value: medTemp, color: colors.blue },
            { label: 'Low Temp', value: lowTemp, color: colors.cyan },
          ].map(s => (
            <div key={s.label} style={{ background: colors.card2, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <SLabel>{(state.projectType || 'remodel') === 'new' ? 'Circuits — All New (New Store)' : 'Circuits — New Work Only'}</SLabel>
          <div style={{ fontSize: 12, color: colors.textDim }}>
            {state.circuits.length > 0 ? `${state.circuits.length} circuit${state.circuits.length !== 1 ? 's' : ''} — verify run lengths and line sizes` : 'Add circuits manually or upload a BPR schedule'}
          </div>
        </div>
        <Btn variant="green" size="sm" onClick={addCircuit}>+ Add Circuit</Btn>
      </Row>

      {/* Circuit list */}
      {state.circuits.length === 0 ? (
        <Card>
          <EmptyState icon="⚡" title="No circuits yet" subtitle="Upload a BPR Excel file on the previous step, or add circuits manually" />
        </Card>
      ) : (
        state.circuits.map(c => (
          <CircuitRow
            key={c.id}
            circuit={c}
            onUpdate={(field, value) => updateCircuit(c.id, field, value)}
            onRemove={() => removeCircuit(c.id)}
          />
        ))
      )}

      {/* Nav */}
      <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <Btn variant="ghost" onClick={onBack}>← Back</Btn>
        <Btn variant="green" onClick={onNext}>Next: Rack Work →</Btn>
      </Row>
    </div>
  );
}
