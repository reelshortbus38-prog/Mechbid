import { useState } from 'react';
import { useStore, uid, fmt, calcLaborPeriodCost, calcTotalLabor } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Row, Col, Divider, TblInput, EmptyState } from '../components/UI.jsx';
import CrewBuilder from '../components/CrewBuilder.jsx';

const DEFAULT_PERIOD_NAMES = [
  'Rack Prep', 'Medium Temp Cases', 'Frozen Food Nights',
  'Dairy Cases', 'Case Startup', 'Punch List / Day Tech',
];

function LaborPeriodCard({ period, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(true);
  const { labor, oot, total } = calcLaborPeriodCost(period);

  return (
    <Card style={{ marginBottom: 12 }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>{period.isNight ? '🌙' : '☀️'}</span>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: colors.text }}>{period.name || 'Labor Period'}</div>
            {period.isNight && <span style={{ fontSize: 10, background: 'rgba(234,179,8,0.15)', color: colors.yellow, padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>NIGHT</span>}
            {period.otMult > 1 && <span style={{ fontSize: 10, background: 'rgba(249,115,22,0.15)', color: colors.orange, padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>OT</span>}
          </div>
          <div style={{ fontSize: 12, color: colors.textDim, marginTop: 4 }}>
            {period.crew.length > 0 ? `${period.crew.length} people · ${period.days || 0} ${period.isNight ? 'nights' : 'days'}` : 'No crew set'}
            {total > 0 ? ` · ${fmt(total)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, color: colors.orange }}>{fmt(total)}</span>
          <span style={{ color: colors.textDim }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <>
          <Divider />

          {/* Period name */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Period Name</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {DEFAULT_PERIOD_NAMES.map(name => (
                <button
                  key={name}
                  onClick={() => onUpdate('name', name)}
                  style={{
                    padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                    border: `1px solid ${period.name === name ? colors.green : colors.border}`,
                    background: period.name === name ? colors.greenFaint : colors.surface,
                    color: period.name === name ? colors.green : colors.textDim,
                  }}
                >{name}</button>
              ))}
            </div>
            <Input
              value={period.name}
              onChange={e => onUpdate('name', e.target.value)}
              placeholder="Custom period name..."
            />
          </div>

          {/* Toggles */}
          <Row style={{ gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: colors.text }}>
              <input type="checkbox" checked={period.isNight} onChange={e => onUpdate('isNight', e.target.checked)} style={{ accentColor: colors.yellow, width: 16, height: 16 }} />
              🌙 Night Work
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: colors.text }}>
              <input type="checkbox" checked={period.otMult > 1} onChange={e => onUpdate('otMult', e.target.checked ? 1.5 : 1)} style={{ accentColor: colors.orange, width: 16, height: 16 }} />
              ⏰ Overtime
            </label>
          </Row>

          {/* Days/nights, multipliers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>{period.isNight ? 'Nights' : 'Days'} on Site</div>
              <Input type="number" value={period.days || ''} onChange={e => onUpdate('days', parseFloat(e.target.value) || 0)} placeholder="0" />
            </div>
            {period.isNight && (
              <div>
                <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Night Premium (×)</div>
                <Input type="number" value={period.nightMult || 1.5} onChange={e => onUpdate('nightMult', parseFloat(e.target.value) || 1)} step="0.1" placeholder="1.5" />
              </div>
            )}
            {period.otMult > 1 && (
              <div>
                <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>OT Multiplier (×)</div>
                <Input type="number" value={period.otMult} onChange={e => onUpdate('otMult', parseFloat(e.target.value) || 1)} step="0.1" placeholder="1.5" />
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Out of Town ($/day)</div>
              <Input type="number" value={period.ootPerDay || ''} onChange={e => onUpdate('ootPerDay', parseFloat(e.target.value) || 0)} placeholder="0" />
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Notes</div>
            <Input value={period.notes || ''} onChange={e => onUpdate('notes', e.target.value)} placeholder="e.g. Minimum 6 people required, frozen food aisles" />
          </div>

          {/* Crew builder */}
          <div>
            <SLabel>Crew for This Period</SLabel>
            <CrewBuilder
              crew={period.crew}
              onChange={crew => onUpdate('crew', crew)}
            />
          </div>

          {/* Cost breakdown */}
          {total > 0 && (
            <>
              <Divider />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {[
                  { label: 'Labor', value: fmt(labor), color: colors.yellow },
                  { label: 'Out of Town', value: fmt(oot), color: colors.blue },
                  { label: 'Period Total', value: fmt(total), color: colors.orange },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <Row style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <Btn variant="red" size="sm" onClick={onRemove}>Remove Period</Btn>
          </Row>
        </>
      )}
    </Card>
  );
}

// ── FIELD TASKS TABLE ─────────────────────────────────────────────────────────
function FieldTasksSection() {
  const { state, dispatch } = useStore();
  const fieldTasks = state.fieldTasks || [];

  function addTask() {
    dispatch({ type: 'SET', key: 'fieldTasks', value: [...fieldTasks, { id: uid(), desc: '', men: 1, hrs: 0, notes: '' }] });
  }

  function updateTask(id, field, value) {
    dispatch({ type: 'SET', key: 'fieldTasks', value: fieldTasks.map(t => t.id === id ? { ...t, [field]: field === 'men' || field === 'hrs' ? parseFloat(value) || 0 : value } : t) });
  }

  function removeTask(id) {
    dispatch({ type: 'SET', key: 'fieldTasks', value: fieldTasks.filter(t => t.id !== id) });
  }

  // Get blended crew rate from first labor period
  const blendedRate = state.laborPeriods?.[0]?.crew?.reduce((s, m) => s + (parseFloat(m.rate) || 0), 0) || 100;

  return (
    <div>
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <SLabel>Field Work Tasks</SLabel>
          <div style={{ fontSize: 12, color: colors.textDim }}>Auto-populated from documents — enter hours per task</div>
        </div>
        <Btn variant="ghost" size="sm" onClick={addTask}>+ Add Task</Btn>
      </Row>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {fieldTasks.length === 0 ? (
          <EmptyState icon="🔨" title="No field tasks" subtitle="Upload scope docs or blueprints to auto-populate" />
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: colors.surface }}>
                  {['Task', 'Men', 'Hrs', 'Cost', 'Notes', ''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${colors.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fieldTasks.map((t, i) => {
                  const cost = t.men * t.hrs * (blendedRate / Math.max(state.laborPeriods?.[0]?.crew?.length || 1, 1));
                  return (
                    <tr key={t.id} style={{ background: i % 2 === 0 ? 'transparent' : colors.surface + '40' }}>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, width: '40%' }}>
                        <TblInput value={t.desc} onChange={e => updateTask(t.id, 'desc', e.target.value)} placeholder="Task description" />
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
                        <TblInput type="number" value={t.men} onChange={e => updateTask(t.id, 'men', e.target.value)} style={{ width: 44, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
                        <TblInput type="number" value={t.hrs} onChange={e => updateTask(t.id, 'hrs', e.target.value)} step="0.5" style={{ width: 52, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, fontFamily: "'DM Mono', monospace", fontWeight: 700, color: colors.green }}>{fmt(cost)}</td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
                        <TblInput value={t.notes || ''} onChange={e => updateTask(t.id, 'notes', e.target.value)} placeholder="Notes" />
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
                        <button onClick={() => removeTask(t.id)} style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding: '10px 16px', borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: colors.textDim }}>Field Work Total</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: colors.green }}>
                {fmt(fieldTasks.reduce((s, t) => s + t.men * t.hrs * (blendedRate / Math.max(state.laborPeriods?.[0]?.crew?.length || 1, 1)), 0))}
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ── MAIN STEP 5 ───────────────────────────────────────────────────────────────
export default function Step5_Labor({ onNext, onBack }) {
  const { state, dispatch } = useStore();

  function addPeriod(name = '') {
    dispatch({
      type: 'ADD_LABOR_PERIOD',
      period: {
        id: uid(),
        name: name || '',
        crew: [],
        days: 0,
        isNight: false,
        otMult: 1,
        nightMult: 1.5,
        ootPerDay: 0,
        notes: '',
      }
    });
  }

  function updatePeriod(id, field, value) {
    dispatch({ type: 'UPDATE_LABOR_PERIOD', id, updates: { [field]: value } });
  }

  const totalLabor = calcTotalLabor(state.laborPeriods);
  const totalDays = state.laborPeriods.reduce((s, p) => s + (parseFloat(p.days) || 0), 0);
  const totalOOT = state.laborPeriods.reduce((s, p) => s + (parseFloat(p.ootPerDay) || 0) * (parseFloat(p.days) || 0), 0);
  const totalPeople = Math.max(...state.laborPeriods.map(p => p.crew.length), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Summary stats */}
      {state.laborPeriods.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            { label: 'Labor Periods', value: state.laborPeriods.length, color: colors.text },
            { label: 'Total Days', value: totalDays, color: colors.text },
            { label: 'Max Crew', value: totalPeople, color: colors.text },
            { label: 'Total Labor', value: fmt(totalLabor), color: colors.orange },
          ].map(s => (
            <div key={s.label} style={{ background: colors.card2, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Quick add */}
      <div>
        <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <SLabel>Labor Periods</SLabel>
            <div style={{ fontSize: 12, color: colors.textDim }}>Each period has its own crew, days, and multipliers — add as many as needed</div>
          </div>
          <Btn variant="green" size="sm" onClick={() => addPeriod()}>+ Add Period</Btn>
        </Row>

        {/* Quick add common periods */}
        {state.laborPeriods.length === 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {DEFAULT_PERIOD_NAMES.map(name => (
              <Btn key={name} variant="surface" size="sm" onClick={() => addPeriod(name)}>+ {name}</Btn>
            ))}
          </div>
        )}

        {state.laborPeriods.length === 0 ? (
          <Card><EmptyState icon="👷" title="No labor periods yet" subtitle="Add periods for each phase of the job — rack prep, case moves, startup, etc." /></Card>
        ) : (
          state.laborPeriods.map(period => (
            <LaborPeriodCard
              key={period.id}
              period={period}
              onUpdate={(field, value) => updatePeriod(period.id, field, value)}
              onRemove={() => dispatch({ type: 'REMOVE_LABOR_PERIOD', id: period.id })}
            />
          ))
        )}
      </div>

      <Divider />

      {/* Field tasks */}
      <FieldTasksSection />

      {/* Total */}
      {totalLabor > 0 && (
        <Card style={{ background: colors.greenFaint, border: `1px solid ${colors.green}40` }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 4 }}>Total Labor Cost</div>
              <div style={{ fontSize: 11, color: colors.textDim }}>{totalDays} days · {fmt(totalOOT)} out of town</div>
            </div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, color: colors.green }}>{fmt(totalLabor)}</div>
          </Row>
        </Card>
      )}

      {/* Nav */}
      <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <Btn variant="ghost" onClick={onBack}>← Back</Btn>
        <Btn variant="green" onClick={onNext}>Next: Estimate & Proposal →</Btn>
      </Row>
    </div>
  );
}
