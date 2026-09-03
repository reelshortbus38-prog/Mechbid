import { useState } from 'react';
import { useStore, uid, fmt, calcLaborPeriodCost, calcTotalLabor, calcFlatJobCost, jobLaborTotal, jobCrew, calcFieldTaskCost, calcFieldTasksTotal, avgCrewRate, estimateCircuitLabor, DEFAULT_LABOR_UNITS, ootOpts, jobOOTTotal, ootBasisComparison, crewTravelCount, otReview, otRuleConflict, calcRackLaborTotal, loadCompanyProfile, DAYS_PER_WEEK_OPTIONS, STANDARD_WEEK_HOURS } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Row, Col, Divider, TblInput, TblArea, EmptyState } from '../components/UI.jsx';
import CrewBuilder from '../components/CrewBuilder.jsx';
import ScheduleRackReference from '../components/ScheduleRackReference.jsx';
import { forMode } from '../state/tradeScope.js';
import { hasCompanyDefaults } from '../state/companyDefaults.js';
import { splitAcrossCrew, provenanceOf, PROVENANCE_MARK, unitsConfidence } from './laborUnits.js';
import { laborDoubleCount, countGeneratedTasks, unitReliability } from './laborMethod.js';
import { resolveBidMethod, billedLabor, METHOD_LABEL, METHOD_BLURB, MATERIALS_NOTE, escalationFit, LUMP_SUM, TIME_AND_MATERIALS, UNSET } from './bidMethod.js';

// Period-name chips and preset crews are TRADE-SPECIFIC — this step serves
// both Commercial Refrigeration and Commercial HVAC, and a rooftop-unit swap
// has no "Frozen Food Nights". Roles/rates/days stay fully editable after
// adding; days start at 0 so you set them from the schedule.
const REFRIG_PERIOD_NAMES = [
  'Rack Prep', 'Medium Temp Cases', 'Frozen Food Nights',
  'Dairy Cases', 'Case Startup', 'Punch List / Day Tech',
];
const HVAC_PERIOD_NAMES = [
  'Demo / Tear-Out', 'Equipment Set (Crane Day)', 'Ductwork',
  'Piping / Controls', 'Startup & Balance', 'Punch List / Day Tech',
];
function periodNamesForMode(mode) {
  return mode === 'Commercial HVAC' ? HVAC_PERIOD_NAMES : REFRIG_PERIOD_NAMES;
}

const T = { role: 'Technician', rate: 75 };
const H = { role: 'Helper', rate: 50 };
const F = { role: 'Foreman', rate: 100 };
// Refrigeration case-move crews run 1 foreman + 1 tech + the rest helpers —
// the skilled disconnect/reconnect is a couple of guys; the extra hands move
// cases fast. HVAC crews are day work: crane day runs heavy, balance runs lean.
const PERIOD_PRESETS = {
  'Rack Prep':             { crew: [T, H], isNight: false },        // small skilled crew
  'Medium Temp Cases':     { crew: [F, T, H, H], isNight: true },   // 4: 1F 1T 2H
  'Frozen Food Nights':    { crew: [F, T, H, H, H, H], isNight: true }, // 6: 1F 1T 4H
  'Dairy Cases':           { crew: [F, T, H, H], isNight: true },   // 4: 1F 1T 2H
  'Case Startup':          { crew: [T, H], isNight: false },
  'Punch List / Day Tech': { crew: [T], isNight: false },
  'Demo / Tear-Out':          { crew: [F, H, H], isNight: false },
  'Equipment Set (Crane Day)': { crew: [F, T, H, H], isNight: false },
  'Ductwork':                 { crew: [T, H, H], isNight: false },
  'Piping / Controls':        { crew: [T, H], isNight: false },
  'Startup & Balance':        { crew: [T], isNight: false },
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

function LaborPeriodCard({ period, onUpdate, onRemove, defaultExpanded, periodNames = REFRIG_PERIOD_NAMES }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // Costed on the JOB's out-of-town basis, so this card and the bid total
  // cannot disagree about what a per-day figure means.
  const { state: jobState } = useStore();
  const { labor, oot, total } = calcLaborPeriodCost(period, ootOpts(jobState));

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
              {periodNames.map(name => (
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
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>OT after (hrs/day)</div>
              <Input type="number" value={period.otAfterHours || ''}
                onChange={e => onUpdate('otAfterHours', parseFloat(e.target.value) || 0)}
                placeholder="whole shift" />
            </div>
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
              showTravel={jobState.outOfTown !== false && (jobState.ootBasis || 'crew') === 'person'}
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
  // allTasks is what gets WRITTEN back — a job can hold tasks from a mode it is
  // no longer in, and saving the filtered list would silently delete them.
  // fieldTasks is what gets SHOWN and COSTED: this trade's only, matching what
  // computeBidTotals bills.
  const allTasks = state.fieldTasks || [];
  const fieldTasks = forMode(allTasks, state.mode);

  function addTask() {
    dispatch({ type: 'SET', key: 'fieldTasks', value: [...allTasks, { id: uid(), desc: '', men: 1, hrs: 0, notes: '', mode: state.mode }] });
  }

  function updateTask(id, field, value) {
    dispatch({ type: 'SET', key: 'fieldTasks', value: allTasks.map(t => t.id === id ? { ...t, [field]: field === 'men' || field === 'hrs' ? parseFloat(value) || 0 : value } : t) });
  }

  function removeTask(id) {
    dispatch({ type: 'SET', key: 'fieldTasks', value: allTasks.filter(t => t.id !== id) });
  }

  // Cost field tasks from the bid crew's average man-hour rate (flat crew or
  // first period, whichever mode is active — shared with the proposal so
  // what's shown here is exactly what lands in the bid).
  const crew = jobCrew(state);

  return (
    <div>
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <SLabel>Field Work Tasks</SLabel>
          {/* "Hrs" alone read as the duration of the task, so a four-man job
              looked like one man for three days — and putting 4 in the Men box
              to fix it QUADRUPLED the cost instead of splitting it. Saying
              what the column is, and how the cost is worked out, is the fix. */}
          <div style={{ fontSize: 12, color: colors.textDim }}>
            Auto-populated from documents. Hours are <strong>per man</strong> — cost is men × hours each × crew rate.
          </div>
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
                  {['Task', 'Men', 'Hrs ea', 'Cost', 'Notes', ''].map(h => (
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
                        <TblArea value={t.desc} onChange={e => updateTask(t.id, 'desc', e.target.value)} placeholder="Task description" />
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
                        <TblInput type="number" value={t.men} onChange={e => updateTask(t.id, 'men', e.target.value)} style={{ width: 44, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
                        <TblInput type="number" value={t.hrs} onChange={e => updateTask(t.id, 'hrs', e.target.value)} step="0.5" style={{ width: 52, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, fontFamily: "'DM Mono', monospace", fontWeight: 700, color: colors.green }}>{fmt(cost)}</td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
                        <TblArea value={t.notes || ''} onChange={e => updateTask(t.id, 'notes', e.target.value)} placeholder="Notes" />
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
  const crew = jobCrew(state);
  const rate = avgCrewRate(crew) || 100;
  const est = estimateCircuitLabor(circuits, units);
  const cost = est.totalHours * rate;
  // How many men go on a circuit. Not an hour rate — it never enters the
  // arithmetic, only how the man-hours are written down. Stored per job so it
  // rides the save and the sync like every other assumption.
  const crewSize = Math.max(1, Math.round(parseFloat(state.circuitCrewSize) || 2));
  const reliability = unitReliability(state.projectType);

  const setUnit = (key, val) => dispatch({ type: 'SET', key: 'laborUnits', value: { ...units, [key]: parseFloat(val) || 0 } });

  function generateFieldTasks() {
    const idOf = desc => (String(desc).match(/^Run & connect (\S+)/) || [])[1];
    const existing = state.fieldTasks || [];
    // Dedupe against THIS trade's tasks only, so an HVAC job does not consider
    // a refrigeration circuit already covered.
    const have = new Set(forMode(existing, state.mode).map(t => idOf(t.desc)).filter(Boolean));
    const fresh = est.perCircuit
      .filter(pc => !have.has(pc.circuitId))
      .map(pc => {
        // The units produce MAN-hours. Emitting them as `men: 1` said one
        // person runs 150 ft of copper over three days, which nobody does —
        // and the natural correction (typing 4 into Men) billed four times the
        // labor instead of splitting it. Split it here so the row is true and
        // the total is untouched.
        const { men, hrs } = splitAcrossCrew(pc.hours, crewSize);
        return {
          id: uid(),
          desc: `Run & connect ${pc.circuitId}${pc.application ? ` — ${pc.application}` : ''} (${pc.ft}ft)`,
          men, hrs,
          notes: `Auto-estimated — ${pc.hours} man-hours over ${men} ${men === 1 ? 'man' : 'men'}`,
          crewAssignment: {},
          mode: state.mode,
        };
      });
    if (fresh.length) dispatch({ type: 'SET', key: 'fieldTasks', value: [...existing, ...fresh] });
  }

  const UNIT_FIELDS = [
    { key: 'perFtSmall', label: 'Run/ft ≤7/8"' }, { key: 'perFtMed', label: 'Run/ft 1⅛–1⅜"' }, { key: 'perFtLarge', label: 'Run/ft ≥1⅝"' },
    { key: 'perJointSmall', label: 'Joint ≤7/8"' }, { key: 'perJointMed', label: 'Joint 1⅛–1⅜"' }, { key: 'perJointLarge', label: 'Joint ≥1⅝"' },
    { key: 'perCase', label: 'Case hookup' }, { key: 'perRackTie', label: 'Rack tie-in' }, { key: 'stickLength', label: 'Stick len (ft)' },
    { key: 'jointsPerCircuit', label: 'Fittings/circuit' }, { key: 'jointsPerRiser', label: 'Fittings/riser' },
  ];
  const confidence = unitsConfidence(UNIT_FIELDS.map(f => f.key));

  return (
    <Card style={{ background: colors.greenFaint, border: `1px solid ${colors.green}40` }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <SLabel style={{ margin: 0 }}>⚙️ Labor Estimator (from circuits)</SLabel>
          <div style={{ fontSize: 12, color: colors.textDim, marginTop: 4 }}>
            {circuits.length} circuit{circuits.length !== 1 ? 's' : ''} → <strong style={{ color: colors.green }}>{est.totalHours} man-hours</strong> · ~{fmt(cost)} at {fmt(rate)}/hr per man
          </div>
        </div>
        <Btn variant="green" size="sm" onClick={generateFieldTasks}>+ Generate Field Tasks</Btn>
      </Row>

      {/* Crew size is presentation, not arithmetic: it decides whether a
          circuit is written down as one man for 24 hours or three men for 8.
          The cost is the same either way — the point is that the row says
          something true about how the work gets done. */}
      <Row style={{ marginTop: 10, alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: colors.textDim }}>Men on a circuit</span>
        <Input type="number" min="1" step="1" value={crewSize}
          onChange={e => dispatch({ type: 'SET', key: 'circuitCrewSize', value: Math.max(1, Math.round(parseFloat(e.target.value) || 1)) })}
          style={{ width: 56, textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 12 }} />
        <span style={{ fontSize: 11, color: colors.textDim }}>
            — generated tasks split the man-hours across them. Same cost, real crew.
        </span>
      </Row>

      {/* A ground-up store is a clean run through an empty building — the job
          these units actually describe, and the one worth checking them
          against. A remodel is existing pipe, cases still running, and a store
          open until close, and no per-foot rate captures the difference. */}
      <div style={{ marginTop: 10, fontSize: 11, color: colors.textDim, lineHeight: 1.6 }}>
        <strong style={{ color: reliability.level === 'better' ? colors.green : colors.yellow }}>
          {reliability.level === 'better' ? '✓' : '~'}
        </strong>{' '}
        {reliability.note}
      </div>

      {/* The fittings count is the one number in here that cannot be worked out
          from a drawing. A run leaves the motor room, ells down the back hall,
          ells again onto the sales floor, maybe up and over, then down to the
          case — and which of those a given circuit does is something you find
          out by walking it. Saying so is more use than a confident number. */}
      {est.assumedFittings > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: colors.textDim, lineHeight: 1.6,
          padding: '8px 10px', borderRadius: 6, border: `1px solid ${colors.yellow}40`, background: `${colors.yellow}0D` }}>
          <strong style={{ color: colors.yellow }}>{est.assumedFittings} of {est.perCircuit.length} circuit{est.perCircuit.length !== 1 ? 's' : ''}</strong>{' '}
          {est.assumedFittings === 1 ? 'is' : 'are'} using the fittings allowance below, not a counted one.
          Two runs of the same length are different jobs depending on where they turn, and you don't
          know where a circuit ells up until you walk it. Put the real count on a circuit once you have it
          and this estimate uses that instead.
        </div>
      )}

      <div onClick={() => setOpen(o => !o)} style={{ marginTop: 10, fontSize: 11, color: colors.textDim, cursor: 'pointer', userSelect: 'none' }}>
        {open ? '▲ Hide assumptions' : `▼ Adjust labor-unit assumptions (man-hours) — ${confidence.confirmed} confirmed, ${confidence.unconfirmed + confidence.varies} not`}
      </div>
      {open && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10 }}>
            {UNIT_FIELDS.map(f => {
              const p = provenanceOf(f.key);
              const tone = p.state === 'confirmed' ? colors.green : p.state === 'varies' ? colors.yellow : colors.textDim;
              return (
                <div key={f.key}>
                  <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }} title={p.note}>
                    <span style={{ color: tone, fontWeight: 700 }}>{PROVENANCE_MARK[p.state]}</span> {f.label}
                  </div>
                  <Input type="number" value={units[f.key]} step="0.05" onChange={e => setUnit(f.key, e.target.value)}
                    style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }} />
                </div>
              );
            })}
          </div>
          {/* Which numbers this estimate is standing on. A guess and a checked
              number look identical in a box, and the estimator is the one who
              has to defend the total. */}
          <div style={{ fontSize: 11, color: colors.textDim, marginTop: 10, lineHeight: 1.6 }}>
            <span style={{ color: colors.green, fontWeight: 700 }}>✓</span> confirmed by a working estimator ·{' '}
            <span style={{ color: colors.yellow, fontWeight: 700 }}>~</span> varies too much for one number ·{' '}
            <span style={{ fontWeight: 700 }}>?</span> not yet checked against a finished job.
            <br />
            {provenanceOf('perCase').note}
          </div>
        </>
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
        // The SHOP's night premium, not the app's. Still editable per period —
        // a Sunday changeover is not a Tuesday night.
        nightMult: parseFloat(state.nightPremium) || 1.5,
        ootPerDay: 0,
        notes: '',
      }
    });
  }

  function updatePeriod(id, field, value) {
    dispatch({ type: 'UPDATE_LABOR_PERIOD', id, updates: { [field]: value } });
  }

  const laborMode = state.laborMode || 'periods';
  const flat = state.flatJob || { crew: [], weeks: 0, daysPerWeek: 5, ootPerDay: 0 };
  const ootO = ootOpts(state);
  const flatCost = calcFlatJobCost(flat, ootO);
  const totalLabor = jobLaborTotal(state);
  const totalDays = laborMode === 'flat' ? flatCost.days : state.laborPeriods.reduce((s, p) => s + (parseFloat(p.days) || 0), 0);
  // Was recomputing per-day x days inline and so ignored both the basis and the
  // in-town switch — the header read one number while the bid carried another.
  const totalOOT = jobOOTTotal(state);
  const ootCompare = ootBasisComparison(state);
  const otWarn = otReview(state);
  // ── WHICH METHOD IS PRICING THIS JOB ───────────────────────────────────────
  const bidMethod = resolveBidMethod(state.bidMethod);
  const billed = billedLabor(state.bidMethod);
  const escFit = escalationFit(state.bidMethod, state.escalationPct);
  // Read once per render — cheap, and it must reflect a profile saved on the
  // Proposal step without a reload.
  const shopHasOwnNumbers = hasCompanyDefaults(loadCompanyProfile());
  const modeFieldTasks = forMode(state.fieldTasks, state.mode);
  const taskLabor = calcFieldTasksTotal(modeFieldTasks, jobCrew(state))
    + (state.mode === 'Commercial Refrigeration' ? calcRackLaborTotal(state.rackTasks, jobCrew(state)) : 0);
  // The double-count is only reachable while no method has been chosen — once
  // one is, the arithmetic makes it impossible rather than merely warned about.
  const doubleCount = bidMethod === UNSET ? laborDoubleCount({
    periodsTotal: totalLabor,
    fieldTasksTotal: calcFieldTasksTotal(modeFieldTasks, jobCrew(state)),
    rackLaborTotal: state.mode === 'Commercial Refrigeration'
      ? calcRackLaborTotal(state.rackTasks, jobCrew(state)) : 0,
    autoGeneratedCount: countGeneratedTasks(modeFieldTasks),
  }) : null;
  // Only flat mode knows its own week; a period stores total days.
  const otClash = laborMode === 'flat'
    ? otRuleConflict(flat.crew, {
      daysPerWeek: flat.daysPerWeek,
      otAfterHours: flat.otAfterHours,
      weeklyOtHours: STANDARD_WEEK_HOURS,
    })
    : null;

  // One click rather than opening every period. A multiplier already set is
  // left alone; only a missing one gets the standard 1.5.
  function applyOtThreshold() {
    const fix = u => ({
      ...u,
      weeklyOtHours: parseFloat(u.weeklyOtHours) > 0 ? u.weeklyOtHours : STANDARD_WEEK_HOURS,
      daysPerWeek: parseFloat(u.daysPerWeek) > 0 ? u.daysPerWeek : 5,
      otMult: parseFloat(u.otMult) > 1 ? u.otMult : 1.5,
    });
    if (laborMode === 'flat') dispatch({ type: 'SET', key: 'flatJob', value: fix(state.flatJob || {}) });
    else dispatch({ type: 'SET', key: 'laborPeriods', value: (state.laborPeriods || []).map(fix) });
  }
  const totalPeople = laborMode === 'flat' ? flat.crew.length : Math.max(...state.laborPeriods.map(p => p.crew.length), 0);

  function setFlat(updates) {
    dispatch({ type: 'SET', key: 'flatJob', value: { ...flat, ...updates } });
  }

  function switchLaborMode(mode) {
    // First switch to flat: seed the standard 4-man crew (1F 1T 2H) and pull
    // the job length off the schedule ("27 weeks") so the estimate is one
    // rate-check away from done.
    if (mode === 'flat' && !(state.flatJob?.crew?.length)) {
      const weeks = parseInt((String(state.jobLength || '').match(/(\d+)/) || [])[1], 10) || 0;
      dispatch({ type: 'SET', key: 'flatJob', value: {
        crew: [F, T, H, H].map(m => ({ id: uid(), ...m, hrsPerDay: 8 })),
        weeks, daysPerWeek: 5, ootPerDay: 0,
      }});
    }
    dispatch({ type: 'SET', key: 'laborMode', value: mode });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Schedule + rack work reference, so crews can be sized against the
          actual nights (frozen-food vs other) without leaving the Labor step.
          Refrigeration-only — the RC/case-move schedule doesn't apply to HVAC. */}
      {state.mode === 'Commercial Refrigeration' && <ScheduleRackReference />}

      {/* ── A SHOP THAT HAS NEVER SAVED ITS OWN NUMBERS ──
          Rates, night premium and labor units all seed from the company
          profile, and until a shop saves one they come from nobody — the
          app's placeholders. Those are fine to build a bid WITH and wrong to
          send a bid OUT on, and the only place that said so was a card on the
          last step, reached after the bid was already priced. */}
      {!shopHasOwnNumbers && (
        <Card style={{ borderColor: `${colors.yellow}55` }}>
          <SLabel style={{ margin: 0, color: colors.yellow }}>⚠ These are placeholder rates, not yours</SLabel>
          <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.65, marginTop: 6 }}>
            Nobody has saved this shop's numbers yet, so the crew rates, night premium and labor units
            below came from the app rather than from your company. They are reasonable for building a bid
            against — they are not what you charge.
            <br /><br />
            Set the crew and rates on this step the way your shop actually bills, then open the
            <strong> Proposal</strong> step and hit <strong>Save as my standard rates</strong>. Every new
            job starts from them after that, and this notice goes away.
          </div>
        </Card>
      )}

      {/* ── HOW IS THIS JOB BEING BID? ──
          Crew-and-calendar and per-circuit hours are two prices for the same
          work, and the app used to add them. Choosing here decides which one
          reaches the total; the other stays on screen and editable. */}
      <Card style={bidMethod === UNSET ? { borderColor: `${colors.yellow}55` } : undefined}>
        <SLabel style={{ margin: 0 }}>How this job's LABOR is bid</SLabel>
        <div style={{ fontSize: 11, color: colors.textDim, marginTop: 4, lineHeight: 1.6 }}>{MATERIALS_NOTE}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginTop: 10 }}>
          {[LUMP_SUM, TIME_AND_MATERIALS].map(m => (
            <div key={m} onClick={() => dispatch({ type: 'SET', key: 'bidMethod', value: m })}
              style={{
                border: `2px solid ${bidMethod === m ? colors.green : colors.border}`,
                background: bidMethod === m ? colors.greenFaint : colors.card2,
                borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s',
              }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 700, color: bidMethod === m ? colors.green : colors.text }}>
                {METHOD_LABEL[m]}
              </div>
              <div style={{ fontSize: 11, color: colors.textDim, marginTop: 5, lineHeight: 1.5 }}>{METHOD_BLURB[m]}</div>
            </div>
          ))}
        </div>
        {bidMethod === UNSET && (
          <div style={{ fontSize: 11, color: colors.yellow, marginTop: 10, lineHeight: 1.6 }}>
            ⚠ {METHOD_BLURB[UNSET]} Nothing has been changed on jobs saved before this setting existed — pick one and the total follows.
          </div>
        )}
        {bidMethod !== UNSET && (
          <div style={{ fontSize: 11, color: colors.textDim, marginTop: 10, lineHeight: 1.6 }}>
            {billed.periods
              ? `Task hours below are scope and cross-check only${taskLabor > 0 ? ` — ${fmt(taskLabor)} of them is NOT in this bid` : ''}.`
              : `Crew periods below are the schedule and per diem only${totalLabor > 0 ? ' — their labor is NOT in this bid' : ''}.`}
          </div>
        )}
        {escFit && (
          <div style={{ fontSize: 11, color: colors.textDim, marginTop: 8, lineHeight: 1.6,
            padding: '8px 10px', borderRadius: 6, border: `1px solid ${colors.yellow}40`, background: `${colors.yellow}0D` }}>
            <strong style={{ color: colors.yellow }}>⚠ Material escalation on a T&amp;M bid.</strong> {escFit.note}
          </div>
        )}
      </Card>

      {/* Derive labor from the circuit takeoff */}
      <CircuitLaborEstimator />

      {/* ── Crew-and-nights and per-circuit hours are the SAME labor ──
          Two methods of pricing one job: crew periods is how a lump-sum
          remodel gets bid, per-circuit hours is the time-and-materials way of
          reaching the same figure. bidTotals adds both, so a job with both
          filled in carries the running labor twice. */}
      {doubleCount && (
        <Card style={{ borderColor: doubleCount.severity === 'blocker' ? `${colors.red}66` : `${colors.yellow}55` }}>
          <SLabel style={{ color: doubleCount.severity === 'blocker' ? colors.red : colors.yellow }}>
            {doubleCount.severity === 'blocker' ? '⛔' : '⚠'} Labor is priced twice on this bid
          </SLabel>
          <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.65, marginTop: 6 }}>
            {doubleCount.message}
          </div>
        </Card>
      )}

      {/* ── The two overtime rules disagreeing on this schedule ── */}
      {otClash && (
        <Card style={{ borderColor: `${colors.yellow}55` }}>
          <SLabel>📅 The two overtime rules disagree on a {flat.daysPerWeek}-day week</SLabel>
          <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.6, marginTop: 6 }}>
            This crew works <strong style={{ color: colors.text }}>{otClash.hrsPerWeek} hours a week</strong>.
            Past eight in a day that is <strong>{otClash.dailyOtHours} overtime hours</strong>; past forty in a
            week it is <strong>{otClash.weeklyOtHours}</strong>.
            {otClash.dailyHigher ? (
              <>
                {' '}The bid is currently charging the higher one. A {flat.daysPerWeek}×
                {Math.round(otClash.hrsPerWeek / (parseFloat(flat.daysPerWeek) || 1))} lands on{' '}
                {otClash.hrsPerWeek} hours, so <strong style={{ color: colors.yellow }}>no overtime is owed
                federally</strong> — it is owed in states with a daily rule, and under agreements that carry one.
                Clear the daily threshold to bill it at forty.
              </>
            ) : (
              <>
                {' '}The daily threshold cannot see this — nobody passes eight in a day, but the week is over
                forty. <strong style={{ color: colors.yellow }}>Set the weekly threshold to 40</strong> or the
                bid is short those hours.
              </>
            )}
            <br />
            <span style={{ fontSize: 11 }}>
              Which applies is your jurisdiction and your agreement. Set both and the greater is used, which is
              how a state daily rule stacks on the federal weekly one.
            </span>
          </div>
          <Row style={{ gap: 8, marginTop: 10 }}>
            <Btn variant="green" size="sm" onClick={() => setFlat({ weeklyOtHours: STANDARD_WEEK_HOURS, otAfterHours: 0, otMult: flat.otMult > 1 ? flat.otMult : 1.5 })}>
              Bill at 40 hrs/week
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setFlat({ otAfterHours: 8, weeklyOtHours: 0, otMult: flat.otMult > 1 ? flat.otMult : 1.5 })}>
              Bill at 8 hrs/day
            </Btn>
          </Row>
        </Card>
      )}

      {/* ── Is overtime actually owed on this schedule? ── */}
      {otWarn && otWarn.owed === 'none' && (
        <Card>
          <SLabel>✓ Long days, but a {otWarn.hrsPerWeek}-hour week</SLabel>
          <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.6, marginTop: 6 }}>
            Nobody is owed overtime on this schedule. {otWarn.hrsPerWeek} hours a week is inside forty however
            the days are arranged, so a compressed week costs the same as a five-day one —{' '}
            <strong style={{ color: colors.text }}>{fmt(otWarn.current)}</strong> of labor either way.
            <br />
            <span style={{ fontSize: 11 }}>
              Set a daily threshold only if a state rule or your agreement pays overtime past eight in a day
              regardless of the week. That is a fact about the job, not about the hours.
            </span>
          </div>
        </Card>
      )}

      {otWarn && otWarn.owed !== 'none' && (
        <Card style={{ borderColor: `${colors.yellow}55` }}>
          <SLabel>
            ⏱️ {otWarn.owed === 'weekly'
              ? `${otWarn.hrsPerWeek} hours a week is billing straight through`
              : 'Long days, and the week is not known'}
          </SLabel>
          <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.6, marginTop: 6 }}>
            {otWarn.owed === 'weekly' ? (
              <>
                {otWarn.hrsPerWeek} hours a week is {otWarn.hrsPerWeek - 40} past forty, and no threshold is set —
                so those hours are priced at straight time.
              </>
            ) : (
              <>
                {otWarn.daysAffected} day(s) run past eight hours, but these periods carry no days-per-week, so
                whether the week clears forty cannot be worked out. Priced against a five-day week below.
              </>
            )}
            {' '}Labor is <strong style={{ color: colors.text }}>{fmt(otWarn.current)}</strong>; with overtime past
            forty at time-and-a-half it is <strong style={{ color: colors.green }}>{fmt(otWarn.corrected)}</strong> —{' '}
            <strong style={{ color: colors.red }}>{fmt(otWarn.delta)}</strong> the bid is short.
            {otWarn.blanketUsed && (
              <><br /><strong style={{ color: colors.yellow }}>A multiplier is set but no threshold</strong>, so it
              lands on the WHOLE shift rather than the hours past forty — which overshoots in the other direction.</>
            )}
            <br />
            <span style={{ fontSize: 11 }}>
              Leave it alone if these really are straight-time hours, or if the multiplier is meant as a
              whole-shift premium for a Saturday or a shutdown.
            </span>
          </div>
          <Btn variant="green" size="sm" style={{ marginTop: 10 }} onClick={applyOtThreshold}>
            Bill overtime past 40 hrs/week at 1.5×
          </Btn>
        </Card>
      )}

      {/* ── Out-of-town expense: is it a travelling job, and per what? ── */}
      <Card>
        <SLabel>✈️ Out-of-Town Expense</SLabel>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, marginBottom: 10 }}>
          {[
            { k: true, label: '✈️ Travelling job', desc: 'Per diem, lodging — carried as its own bid category' },
            { k: false, label: '🏠 In town', desc: 'No travel expense. The per-day figure is kept, just not charged' },
          ].map(o => (
            <button key={String(o.k)} onClick={() => dispatch({ type: 'SET', key: 'outOfTown', value: o.k })}
              style={{ flex: 1, padding: '12px 14px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                border: `2px solid ${(state.outOfTown !== false) === o.k ? colors.green : colors.border}`,
                background: (state.outOfTown !== false) === o.k ? colors.greenFaint : colors.card2 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: (state.outOfTown !== false) === o.k ? colors.green : colors.text }}>{o.label}</div>
              <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>{o.desc}</div>
            </button>
          ))}
        </div>

        {state.outOfTown !== false && (
          <>
            <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>The $/day figure is…</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {[
                { k: 'person', label: 'Per person, per day', desc: 'What per diem is. Four men do not share a room' },
                { k: 'crew', label: 'Per crew, per day', desc: 'A lump travel allowance, or one truck and one bill' },
              ].map(o => (
                <button key={o.k} onClick={() => dispatch({ type: 'SET', key: 'ootBasis', value: o.k })}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                    border: `2px solid ${(state.ootBasis || 'crew') === o.k ? colors.green : colors.border}`,
                    background: (state.ootBasis || 'crew') === o.k ? colors.greenFaint : colors.card2 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: (state.ootBasis || 'crew') === o.k ? colors.green : colors.text }}>{o.label}</div>
                  <div style={{ fontSize: 10, color: colors.textDim, marginTop: 2 }}>{o.desc}</div>
                </button>
              ))}
            </div>

            {ootCompare && (
              <div style={{ fontSize: 12, lineHeight: 1.6, padding: '10px 12px', borderRadius: 8,
                background: ootCompare.basis === 'crew' ? 'rgba(234,179,8,0.07)' : 'rgba(34,197,94,0.06)',
                border: `1px solid ${(ootCompare.basis === 'crew' ? colors.yellow : colors.green)}40`,
                color: colors.textDim }}>
                <strong style={{ color: ootCompare.basis === 'crew' ? colors.yellow : colors.green }}>
                  {ootCompare.basis === 'crew' ? '⚠' : '✓'} This job carries {fmt(ootCompare.current)} of out-of-town
                  {' '}— per {ootCompare.basis === 'crew' ? 'crew' : 'person'}, per day
                </strong>
                <br />
                On the other basis it is <strong>{fmt(ootCompare.asOther)}</strong>, a difference of{' '}
                <strong style={{ color: ootCompare.delta > 0 ? colors.red : colors.green }}>
                  {ootCompare.delta > 0 ? '+' : ''}{fmt(ootCompare.delta)}
                </strong>{' '}
                across {ootCompare.travelers} travelling of {ootCompare.crewSize} on the crew.
                {ootCompare.basis === 'crew' && (
                  <> Per diem is normally per person — if that figure is a hotel and meals rate, this bid is short.</>
                )}
              </div>
            )}

            {crewTravelCount(jobCrew(state)) < (jobCrew(state) || []).length && (
              <div style={{ fontSize: 11, color: colors.textDim, marginTop: 8 }}>
                {crewTravelCount(jobCrew(state))} of {(jobCrew(state) || []).length} on the crew are marked as
                travelling — untick a man in the crew list to leave him off per diem.
              </div>
            )}
          </>
        )}
      </Card>

      {/* How labor is bid: one crew for the whole job, or phase-by-phase. */}
      <div>
        <SLabel>How do you bid labor?</SLabel>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {[
            { k: 'flat', label: '👥 Whole-Job Crew', desc: 'One crew for the full job — e.g. 4 guys × 27 weeks' },
            { k: 'periods', label: '📅 Phased Periods', desc: 'Separate crews per phase — rack prep, case nights, startup' },
          ].map(o => (
            <button key={o.k} onClick={() => switchLaborMode(o.k)}
              style={{ flex: 1, padding: '12px 14px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                border: `2px solid ${laborMode === o.k ? colors.green : colors.border}`,
                background: laborMode === o.k ? colors.greenFaint : colors.card2 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: laborMode === o.k ? colors.green : colors.text }}>{o.label}</div>
              <div style={{ fontSize: 11, color: colors.textDim, marginTop: 3 }}>{o.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {laborMode === 'flat' && (
        /* ── WHOLE-JOB CREW ─────────────────────────────────────────────── */
        <Card>
          <SLabel>Whole-Job Crew</SLabel>
          <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 14 }}>
            This crew is carried for the full job length. Job length prefills from the schedule — adjust anything.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Job Length (weeks)</div>
              <Input type="number" value={flat.weeks || ''} onChange={e => setFlat({ weeks: parseFloat(e.target.value) || 0 })} placeholder="27" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Days / Week</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {DAYS_PER_WEEK_OPTIONS.map(d => (
                  <button key={d} onClick={() => setFlat({ daysPerWeek: d })}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                      fontFamily: "'DM Mono', monospace",
                      border: `2px solid ${Number(flat.daysPerWeek) === d ? colors.green : colors.border}`,
                      background: Number(flat.daysPerWeek) === d ? colors.greenFaint : colors.card2,
                      color: Number(flat.daysPerWeek) === d ? colors.green : colors.text }}>
                    {d}
                  </button>
                ))}
                <Input type="number" value={flat.daysPerWeek || ''}
                  onChange={e => setFlat({ daysPerWeek: parseFloat(e.target.value) || 0 })}
                  placeholder="5" style={{ width: 58, textAlign: 'center' }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Out of Town ($/day)</div>
              <Input type="number" value={flat.ootPerDay || ''} onChange={e => setFlat({ ootPerDay: parseFloat(e.target.value) || 0 })} placeholder="0" />
            </div>
            {/* Flat mode had no overtime inputs at all, which is why a whole-job
                crew on ten-hour days billed every hour straight. */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>OT after (hrs/day)</div>
              <Input type="number" value={flat.otAfterHours || ''}
                onChange={e => setFlat({ otAfterHours: parseFloat(e.target.value) || 0 })} placeholder="whole shift" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>OT Multiplier (×)</div>
              <Input type="number" value={flat.otMult || ''}
                onChange={e => setFlat({ otMult: parseFloat(e.target.value) || 1 })} step="0.1" placeholder="1.5" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>OT after (hrs/week)</div>
              <Input type="number" value={flat.weeklyOtHours || ''}
                onChange={e => setFlat({ weeklyOtHours: parseFloat(e.target.value) || 0 })} placeholder="40" />
            </div>
          </div>

          <SLabel>Crew ({flat.crew.length})</SLabel>
          <CrewBuilder crew={flat.crew} onChange={crew => setFlat({ crew })}
            showTravel={state.outOfTown !== false && (state.ootBasis || 'crew') === 'person'} />

          {flatCost.total > 0 && (
            <>
              <Divider />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {[
                  { label: 'On-Site Days', value: `${flatCost.days}`, color: colors.text },
                  { label: 'Labor', value: fmt(flatCost.labor), color: colors.yellow },
                  { label: 'Whole-Job Total', value: fmt(flatCost.total), color: colors.orange },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {/* Quick add */}
      {laborMode === 'periods' && (
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
            {periodNamesForMode(state.mode).map(name => (
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
              periodNames={periodNamesForMode(state.mode)}
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
      )}

      <Divider />

      {/* Field tasks */}
      <FieldTasksSection />

      {/* Summary stats — moved down here next to the total, so the top of the
          page isn't cluttered with tiles before you've even looked at a period */}
      {(laborMode === 'flat' ? flat.crew.length > 0 : state.laborPeriods.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            laborMode === 'flat'
              ? { label: 'Job Length', value: `${flat.weeks || 0} wks`, color: colors.text }
              : { label: 'Labor Periods', value: state.laborPeriods.length, color: colors.text },
            { label: 'Total Days', value: totalDays, color: colors.text },
            { label: laborMode === 'flat' ? 'Crew Size' : 'Max Crew', value: totalPeople, color: colors.text },
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
