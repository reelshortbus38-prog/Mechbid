import { useState } from 'react';
import { useStore, uid, normalizePipeSize } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Select, Row, EmptyState } from '../components/UI.jsx';

const PIPE_SIZES = ['', '1/4"', '3/8"', '1/2"', '5/8"', '7/8"', '1-1/8"', '1-3/8"', '1-5/8"', '2-1/8"', '2-5/8"', '3-1/8"'];
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

        {/* Liquid line — a riser-only drop still needs its liquid line down
            the same chase (suction alone feeds nothing). Same field either
            way; the label says which geometry it rides. */}
        {circuit.isRiserOnly && (
          <div style={{ flex: '0 0 100px' }}>
            <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Liq Riser</div>
            <Select value={circuit.liqHoriz || ''} onChange={e => onUpdate('liqHoriz', e.target.value)}>
              {PIPE_SIZES.map(s => <option key={s} value={s}>{s || '--'}</option>)}
            </Select>
          </div>
        )}
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

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
          <SLabel>Circuits — New Work Only</SLabel>
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
