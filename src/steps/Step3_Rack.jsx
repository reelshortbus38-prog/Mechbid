import { useState } from 'react';
import { useStore, uid, fmt, calcRackTaskCost, primaryCrew } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Row, EmptyState, TblInput, TblArea } from '../components/UI.jsx';
import { searchSupplier } from '../api/ai.js';
import { PriceMatchChip } from '../components/PriceBook.jsx';

// Rack tasks group by which rack they're on. Newer extractions carry a rack
// field; earlier ones baked a "[Rack A]" prefix into the description instead —
// read either, so existing saved jobs group correctly too.
const RACK_PREFIX_RE = /^\[Rack\s+([A-Z]\d?)\]\s*/i;
function taskRack(t) {
  if (t.rack) return String(t.rack).toUpperCase();
  const m = String(t.desc || '').match(RACK_PREFIX_RE);
  return m ? m[1].toUpperCase() : '';
}
function taskDisplayDesc(t) {
  return String(t.desc || '').replace(RACK_PREFIX_RE, '');
}

export default function Step3_Rack({ onNext, onBack }) {
  const { state, dispatch } = useStore();
  const [uriSearch, setUriSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState({});

  // ── Rack Parts ──────────────────────────────────────────────────────────────
  function addRackPart() {
    dispatch({ type: 'ADD_RACK_PART', part: { id: uid(), partId: '', desc: '', qty: 0, unit: 'ea', storeSupplied: true, unitCost: 0, total: 0 } });
  }

  function updateRackPart(id, field, value) {
    const updates = { [field]: field === 'storeSupplied' ? value : (field === 'qty' || field === 'unitCost' ? parseFloat(value) || 0 : value) };
    if (field === 'qty' || field === 'unitCost') {
      const part = state.rackParts.find(p => p.id === id);
      const qty = field === 'qty' ? parseFloat(value) || 0 : part?.qty || 0;
      const cost = field === 'unitCost' ? parseFloat(value) || 0 : part?.unitCost || 0;
      updates.total = qty * cost;
    }
    dispatch({ type: 'UPDATE_RACK_PART', id, updates });
  }

  // ── Rack Tasks ──────────────────────────────────────────────────────────────
  function addRackTask() {
    dispatch({ type: 'ADD_RACK_TASK', task: { id: uid(), desc: '', hrs: 0, notes: '', crewAssignment: {} } });
  }

  function updateRackTask(id, field, value) {
    dispatch({ type: 'UPDATE_RACK_TASK', id, updates: { [field]: field === 'hrs' ? parseFloat(value) || 0 : value } });
  }

  // Editing a description saves what's typed (prefix-free) and, for legacy
  // items whose rack lived only in the "[Rack A]" desc prefix, moves that rack
  // into its own field so the task stays in its group after the edit.
  function updateRackTaskDesc(t, value) {
    const updates = { desc: value };
    if (!t.rack) { const k = taskRack(t); if (k) updates.rack = k; }
    dispatch({ type: 'UPDATE_RACK_TASK', id: t.id, updates });
  }

  // Group tasks by rack — racks alphabetically, ungrouped general work last.
  const taskGroups = (() => {
    const map = new Map();
    state.rackTasks.forEach(t => {
      const k = taskRack(t);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    });
    return [...map.keys()]
      .sort((a, b) => (a === '') - (b === '') || a.localeCompare(b))
      .map(k => ({ key: k || 'general', label: k ? `Rack ${k}` : 'General Rack Work', tasks: map.get(k) }));
  })();

  // ── Crew for tasks ──────────────────────────────────────────────────────────
  // Use global crew from the first labor period if available, otherwise the
  // shared helper falls back to an average/placeholder man-hour rate. Costing
  // lives in store.js so this on-screen number matches the proposal exactly.
  const globalCrew = primaryCrew(state.laborPeriods);
  const calcTaskCost = task => calcRackTaskCost(task, globalCrew);

  const contractorPartsTotal = state.rackParts.filter(p => !p.storeSupplied).reduce((s, p) => s + (p.total || 0), 0);
  const rackLaborTotal = state.rackTasks.reduce((s, t) => s + calcTaskCost(t), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── RACK PARTS ── */}
      <div>
        <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <SLabel>Rack Parts</SLabel>
            <div style={{ fontSize: 12, color: colors.textDim }}>Toggle Store Supplied ($0) or Contractor Supplied (adds to bid)</div>
          </div>
          <Row style={{ gap: 8 }}>
            <Btn variant="ghost" size="sm" onClick={addRackPart}>+ Add Part</Btn>
            <Btn variant="surface" size="sm" onClick={() => exportPartsCSV(state)}>📋 Export CSV</Btn>
          </Row>
        </Row>

        {/* URI Search */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, background: 'rgba(232,93,20,0.06)', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e85d14', flexShrink: 0 }}>🔍 URI</span>
          <input
            value={uriSearch}
            onChange={e => setUriSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchSupplier(uriSearch, 'URI')}
            placeholder="Search URI by part # or description..."
            style={{ flex: 1, background: 'transparent', border: 'none', color: colors.text, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
          />
          <Btn variant="orange" size="sm" onClick={() => searchSupplier(uriSearch, 'URI')}>Open URI</Btn>
        </div>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {state.rackParts.length === 0 ? (
            <EmptyState icon="🔩" title="No rack parts" subtitle="Upload a parts list on the Documents step, or add manually" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: colors.surface }}>
                    {['Part #', 'Description', 'Qty', 'Supplied By', 'Unit Cost', 'Total', ''].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${colors.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.rackParts.map((p, i) => (
                    <tr key={p.id} style={{ opacity: p.storeSupplied ? 0.6 : 1, background: i % 2 === 0 ? 'transparent' : colors.surface + '40' }}>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
                        <TblInput value={p.partId} onChange={e => updateRackPart(p.id, 'partId', e.target.value)} style={{ fontFamily: "'DM Mono', monospace", width: 80 }} />
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
                        <TblInput value={p.desc} onChange={e => updateRackPart(p.id, 'desc', e.target.value)} />
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
                        <TblInput type="number" value={p.qty} onChange={e => updateRackPart(p.id, 'qty', e.target.value)} style={{ width: 50, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
                        <select
                          value={p.storeSupplied ? 'store' : 'contractor'}
                          onChange={e => updateRackPart(p.id, 'storeSupplied', e.target.value === 'store')}
                          style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 5, padding: '4px 8px', fontSize: 11, color: colors.text, cursor: 'pointer', outline: 'none' }}
                        >
                          <option value="store">🏪 Store</option>
                          <option value="contractor">🔧 Contractor</option>
                        </select>
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
                        {!p.storeSupplied && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <TblInput type="number" value={p.unitCost || 0} onChange={e => updateRackPart(p.id, 'unitCost', e.target.value)} style={{ width: 70, fontFamily: "'DM Mono', monospace" }} />
                            {!p.unitCost && (
                              <PriceMatchChip
                                desc={p.desc}
                                partId={p.partId}
                                onFill={price => updateRackPart(p.id, 'unitCost', price)}
                              />
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, fontFamily: "'DM Mono', monospace", fontWeight: 700, color: p.storeSupplied ? colors.textDim : colors.green }}>
                        {p.storeSupplied ? 'Store' : fmt(p.total)}
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
                        <Row style={{ gap: 6 }}>
                          <button onClick={() => searchSupplier(p.partId || p.desc, 'URI')} style={{ background: '#e85d14', border: 'none', color: '#fff', borderRadius: 5, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}>URI</button>
                          <button onClick={() => dispatch({ type: 'REMOVE_RACK_PART', id: p.id })} style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}>×</button>
                        </Row>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ padding: '10px 16px', borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: colors.textDim }}>Contractor-Supplied Parts Total</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: colors.green }}>{fmt(contractorPartsTotal)}</span>
          </div>
        </Card>
      </div>

      {/* ── RACK WORK TASKS ── */}
      <div>
        <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <SLabel>Rack Work Tasks</SLabel>
            <div style={{ fontSize: 12, color: colors.textDim }}>Contractor fills in men and hours — rates from Labor step</div>
          </div>
          <Btn variant="green" size="sm" onClick={addRackTask}>+ Add Task</Btn>
        </Row>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {state.rackTasks.length === 0 ? (
            <EmptyState icon="🔧" title="No rack tasks" subtitle="Upload a scope doc to auto-populate, or add manually" />
          ) : (
            <>
              {taskGroups.map(group => {
                const collapsed = !!collapsedGroups[group.key];
                const subtotal = group.tasks.reduce((s, t) => s + calcTaskCost(t), 0);
                return (
                  <div key={group.key}>
                    {/* Group header — click to collapse/expand */}
                    <div
                      onClick={() => setCollapsedGroups(c => ({ ...c, [group.key]: !c[group.key] }))}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 14px', background: colors.surface, cursor: 'pointer', userSelect: 'none',
                        borderBottom: `1px solid ${colors.border}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 800 }}>
                          🔩 {group.label}
                        </span>
                        <span style={{ fontSize: 11, color: colors.textDim }}>
                          {group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: subtotal > 0 ? colors.green : colors.textDim }}>{fmt(subtotal)}</span>
                        <span style={{ color: colors.textDim, fontSize: 11 }}>{collapsed ? '▼' : '▲'}</span>
                      </div>
                    </div>

                    {!collapsed && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: '40%' }} />
                          <col style={{ width: 60 }} />
                          <col style={{ width: 66 }} />
                          <col style={{ width: 84 }} />
                          <col />
                          <col style={{ width: 46 }} />
                        </colgroup>
                        <thead>
                          <tr>
                            {['Task', 'Men', 'Hrs', 'Cost', 'Notes', ''].map(h => (
                              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${colors.border}` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {group.tasks.map((t, i) => (
                            <tr key={t.id} style={{ background: i % 2 === 0 ? 'transparent' : colors.surface + '40' }}>
                              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, verticalAlign: 'top' }}>
                                <TblArea value={taskDisplayDesc(t)} onChange={e => updateRackTaskDesc(t, e.target.value)} placeholder="Task description" />
                              </td>
                              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, verticalAlign: 'top' }}>
                                <TblInput type="number" value={t.men || 1} onChange={e => updateRackTask(t.id, 'men', e.target.value)} style={{ textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
                              </td>
                              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, verticalAlign: 'top' }}>
                                <TblInput type="number" value={t.hrs} onChange={e => updateRackTask(t.id, 'hrs', e.target.value)} style={{ textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
                              </td>
                              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, fontFamily: "'DM Mono', monospace", fontWeight: 700, color: colors.green, verticalAlign: 'top' }}>
                                {fmt(calcTaskCost(t))}
                              </td>
                              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, verticalAlign: 'top' }}>
                                <TblArea value={t.notes} onChange={e => updateRackTask(t.id, 'notes', e.target.value)} placeholder="Notes" />
                              </td>
                              <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, verticalAlign: 'top' }}>
                                <button onClick={() => dispatch({ type: 'REMOVE_RACK_TASK', id: t.id })} style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}>×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
              <div style={{ padding: '10px 16px', borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: colors.textDim }}>Rack Labor Total</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: colors.yellow }}>{fmt(rackLaborTotal)}</span>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {[
          { label: 'Parts (Contractor)', value: fmt(contractorPartsTotal), color: colors.green },
          { label: 'Rack Labor', value: fmt(rackLaborTotal), color: colors.yellow },
          { label: 'Total Rack', value: fmt(contractorPartsTotal + rackLaborTotal), color: colors.orange },
        ].map(s => (
          <div key={s.label} style={{ background: colors.card2, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Nav */}
      <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <Btn variant="ghost" onClick={onBack}>← Back</Btn>
        <Btn variant="green" onClick={onNext}>Next: Materials →</Btn>
      </Row>
    </div>
  );
}

function exportPartsCSV(state) {
  const contractor = state.rackParts.filter(p => !p.storeSupplied);
  if (!contractor.length) return;
  let csv = 'Part Number,Description,Qty,Unit,Unit Cost\n';
  contractor.forEach(p => { csv += `"${p.partId}","${p.desc}",${p.qty},"${p.unit}","${p.unitCost || ''}"\n`; });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.projName || 'project') + '_parts.csv';
  a.click();
}
