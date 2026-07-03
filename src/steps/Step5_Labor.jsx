import { useState } from 'react';
import { useStore, uid, fmt, calcLaborPeriodCost, calcTotalLabor, calcFieldTaskCost, calcFieldTasksTotal, primaryCrew, avgCrewRate, estimateCircuitLabor, DEFAULT_LABOR_UNITS } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Row, Col, Divider, TblInput, EmptyState } from '../components/UI.jsx';
import CrewBuilder from '../components/CrewBuilder.jsx';
import ScheduleRackReference from '../components/ScheduleRackReference.jsx';

const DEFAULT_PERIOD_NAMES = [
  'Rack Prep', 'Medium Temp Cases', 'Frozen Food Nights',
  'Dairy Cases', 'Case Startup', 'Punch List / Day Tech',
];

// Preset crews for the quick-add buttons — a starting point so you don't build
// each crew from scratch. Frozen-food case-move nights run a bigger crew (6),
// other case nights ~4, rack/startup a small crew, day-tech punch just one.
// Roles/rates/days stay fully editable after adding; days start at 0 so you set
// them from the schedule (which the reference panel above shows).
const T = { role: 'Technician', rate: 150 };
const H = { role: 'Helper', rate: 100 };
const F = { role: 'Foreman', rate: 175 };
// Case-move crews run 1 foreman + 1 tech + the rest helpers — the skilled
// disconnect/reconnect is a couple of guys; the extra hands move cases fast.
const PERIOD_PRESETS = {
  'Rack Prep':             { crew: [T, H], isNight: false },        // small skilled crew
  'Medium Temp Cases':     { crew: [F, T, H, H], isNight: true },   // 4: 1F 1T 2H
  'Frozen Food Nights':    { crew: [F, T, H, H, H, H], isNight: true }, // 6: 1F 1T 4H
  'Dairy Cases':           { crew: [F, T, H, H], isNight: true },   // 4: 1F 1T 2H
  'Case Startup':          { crew: [T, H], isNight: false },
  'Punch List / Day Tech': { crew: [T], isNight: false },
};

// A period counts as "already set up" once it has a name, any crew, or days
// entered — used to decide whether a card should default open or collapsed.
// A brand new blank period still opens automatically so you can fill it in
// right away; once it has real data, later visits to this screen default it
// to collapsed so a page with several periods doesn't open as a wall of
// expanded cards every time.
function periodHasData(period) {
  return !!(period.name || (period.crew && period.crew.length > 0) || (parseFloat(period.days) || 0) > 0);
}

function LaborPeriodCard({ period, onUpdate, onRemove, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
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

  // Cost field tasks from the primary crew's average man-hour rate (shared with
  // the proposal so what's shown here is exactly what lands in the bid).
  const crew = primaryCrew(state.laborPeriods);

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
                  const cost = calcFieldTaskCost(t, crew);
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
                {fmt(calcFieldTasksTotal(fieldTasks, crew))}
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ── CIRCUIT LABOR ESTIMATOR ─────────────────────────────────────────────────
// Derives man-hours from the circuit list using the labor-unit library, so
// labor starts from a consistent takeoff instead of a blank guess. The estimate
// can be turned into per-circuit field tasks (which flow into the bid).
function CircuitLaborEstimator() {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const circuits = state.circuits || [];
  if (circuits.length === 0) return null;

  const units = { ...DEFAULT_LABOR_UNITS, ...(state.laborUnits || {}) };
  const crew = primaryCrew(state.laborPeriods);
  const rate = avgCrewRate(crew) || 100;
  const est = estimateCircuitLabor(circuits, units);
  const cost = est.totalHours * rate;

  const setUnit = (key, val) => dispatch({ type: 'SET', key: 'laborUnits', value: { ...units, [key]: parseFloat(val) || 0 } });

  function generateFieldTasks() {
    const idOf = desc => (String(desc).match(/^Run & connect (\S+)/) || [])[1];
    const existing = state.fieldTasks || [];
    const have = new Set(existing.map(t => idOf(t.desc)).filter(Boolean));
    const fresh = est.perCircuit
      .filter(pc => !have.has(pc.circuitId))
      .map(pc => ({
        id: uid(),
        desc: `Run & connect ${pc.circuitId}${pc.application ? ` — ${pc.application}` : ''} (${pc.ft}ft)`,
        men: 1, hrs: pc.hours, notes: 'Auto-estimated from circuit labor units', crewAssignment: {},
      }));
    if (fresh.length) dispatch({ type: 'SET', key: 'fieldTasks', value: [...existing, ...fresh] });
  }

  const UNIT_FIELDS = [
    { key: 'perFtSmall', label: 'Run/ft ≤7/8"' }, { key: 'perFtMed', label: 'Run/ft 1⅛–1⅜"' }, { key: 'perFtLarge', label: 'Run/ft ≥1⅝"' },
    { key: 'perJointSmall', label: 'Joint ≤7/8"' }, { key: 'perJointMed', label: 'Joint 1⅛–1⅜"' }, { key: 'perJointLarge', label: 'Joint ≥1⅝"' },
    { key: 'perCase', label: 'Case hookup' }, { key: 'perRackTie', label: 'Rack tie-in' }, { key: 'stickLength', label: 'Stick len (ft)' },
  ];

  return (
    <Card style={{ background: colors.greenFaint, border: `1px solid ${colors.green}40` }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <SLabel style={{ margin: 0 }}>⚙️ Labor Estimator (from circuits)</SLabel>
          <div style={{ fontSize: 12, color: colors.textDim, marginTop: 4 }}>
            {circuits.length} circuit{circuits.length !== 1 ? 's' : ''} → <strong style={{ color: colors.green }}>{est.totalHours} hrs</strong> · ~{fmt(cost)} at {fmt(rate)}/hr blended
          </div>
        </div>
        <Btn variant="green" size="sm" onClick={generateFieldTasks}>+ Generate Field Tasks</Btn>
      </Row>
      <div onClick={() => setOpen(o => !o)} style={{ marginTop: 10, fontSize: 11, color: colors.textDim, cursor: 'pointer', userSelect: 'none' }}>
        {open ? '▲ Hide assumptions' : '▼ Adjust labor-unit assumptions (hrs)'}
      </div>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10 }}>
          {UNIT_FIELDS.map(f => (
            <div key={f.key}>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>{f.label}</div>
              <Input type="number" value={units[f.key]} step="0.05" onChange={e => setUnit(f.key, e.target.value)} style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── MAIN STEP 5 ───────────────────────────────────────────────────────────────
export default function Step5_Labor({ onNext, onBack }) {
  const { state, dispatch } = useStore();

  function addPeriod(name = '') {
    const preset = PERIOD_PRESETS[name];
    dispatch({
      type: 'ADD_LABOR_PERIOD',
      period: {
        id: uid(),
        name: name || '',
        crew: preset ? preset.crew.map(m => ({ id: uid(), role: m.role, rate: m.rate, hrsPerDay: 8 })) : [],
        days: 0,
        isNight: preset ? preset.isNight : false,
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

      {/* Schedule + rack work reference, so crews can be sized against the
          actual nights (frozen-food vs other) without leaving the Labor step.
          Refrigeration-only — the RC/case-move schedule doesn't apply to HVAC. */}
      {state.mode === 'Commercial Refrigeration' && <ScheduleRackReference />}

      {/* Derive labor from the circuit takeoff */}
      <CircuitLaborEstimator />

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
              // A period that already has a name/crew/days starts collapsed — only
              // a freshly-added blank period opens automatically, so the page
              // doesn't default to a wall of expanded cards once you've got
              // several periods set up. Each card can still be tapped open/closed
              // freely after that; this only controls the INITIAL state.
              defaultExpanded={!periodHasData(period)}
            />
          ))
        )}
      </div>

      <Divider />

      {/* Field tasks */}
      <FieldTasksSection />

      {/* Summary stats — moved down here next to the total, so the top of the
          page isn't cluttered with tiles before you've even looked at a period */}
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
