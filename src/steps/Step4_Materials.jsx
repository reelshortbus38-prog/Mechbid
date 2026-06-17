import { useState } from 'react';
import { useStore, uid, fmt, fmtDec, normalizePipeSize, calcLaborPeriodCost, calcTotalLabor } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Select, Row, TblInput, EmptyState } from '../components/UI.jsx';
import { searchSupplier } from '../api/ai.js';
import CrewBuilder from '../components/CrewBuilder.jsx';

const PIPE_SIZES = ['1/4','3/8','1/2','5/8','7/8','1-1/8','1-3/8','1-5/8','2-1/8','2-5/8','3-1/8'];
const FITTING_TYPES = ['Coupling','Elbow 90°','Elbow 45°','Tee','Bushing','Reducer','P-Trap','Wye','Cap','Union','Street Ell','Sweat Adapter'];
const RES_EQUIP_TYPES = ['Heat Pump','Mini Split','Package Unit','Split System AC','Air Handler','Condenser','Gas Furnace','Heat Strip','ERV/HRV'];

const RES_LABOR_PERIOD_NAMES = ['Installation Day','Startup & Commissioning','Service Call','Warranty Return'];

// ── RESIDENTIAL LABOR ─────────────────────────────────────────────────────────
function ResLaborPeriodCard({ period, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(true);
  const { labor, oot, total } = calcLaborPeriodCost(period);

  return (
    <Card style={{ marginBottom: 12 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>{period.isNight ? '🌙' : '☀️'}</span>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700 }}>{period.name || 'Labor Period'}</div>
            {period.otMult > 1 && (
              <span style={{ fontSize: 10, background: 'rgba(249,115,22,0.15)', color: colors.orange, padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>OT</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: colors.textDim, marginTop: 4 }}>
            {period.crew.length > 0 ? `${period.crew.length} tech${period.crew.length > 1 ? 's' : ''} · ${period.days || 0} day${period.days !== 1 ? 's' : ''}` : 'No crew set'}
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
          <div style={{ height: 1, background: colors.border, margin: '14px 0' }} />

          {/* Quick name buttons */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Period Name</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {RES_LABOR_PERIOD_NAMES.map(name => (
                <button key={name} onClick={() => onUpdate('name', name)} style={{
                  padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                  border: `1px solid ${period.name === name ? colors.green : colors.border}`,
                  background: period.name === name ? colors.greenFaint : colors.surface,
                  color: period.name === name ? colors.green : colors.textDim,
                }}>{name}</button>
              ))}
            </div>
            <Input value={period.name} onChange={e => onUpdate('name', e.target.value)} placeholder="Custom name..." />
          </div>

          {/* Toggles */}
          <Row style={{ gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={period.otMult > 1} onChange={e => onUpdate('otMult', e.target.checked ? 1.5 : 1)} style={{ accentColor: colors.orange, width: 16, height: 16 }} />
              ⏰ Overtime
            </label>
          </Row>

          {/* Days & multipliers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Days on Site</div>
              <Input type="number" value={period.days || ''} onChange={e => onUpdate('days', parseFloat(e.target.value) || 0)} placeholder="1" />
            </div>
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

          {/* Crew */}
          <div style={{ marginBottom: 14 }}>
            <SLabel>Technicians</SLabel>
            <CrewBuilder crew={period.crew} onChange={crew => onUpdate('crew', crew)} />
          </div>

          {/* Cost breakdown */}
          {total > 0 && (
            <>
              <div style={{ height: 1, background: colors.border, margin: '14px 0' }} />
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

// ── RESIDENTIAL EQUIPMENT PAGE ────────────────────────────────────────────────
function ResidentialEquipment({ onNext, onBack }) {
  const { state, dispatch } = useStore();
  const [supplierSearch, setSupplierSearch] = useState('');
  const supplier = state.preferredSupplier || 'RE Michel';

  const equipment = state.resEquipment || [];
  const parts = state.resParts || [];

  function addEquipment() {
    dispatch({ type: 'SET', key: 'resEquipment', value: [...equipment, {
      id: uid(), type: 'Heat Pump', tons: '', seer: '', brand: '', model: '', cost: 0
    }]});
  }

  function updateEquipment(id, field, value) {
    dispatch({ type: 'SET', key: 'resEquipment', value: equipment.map(e =>
      e.id === id ? { ...e, [field]: field === 'cost' ? parseFloat(value)||0 : value } : e
    )});
  }

  function removeEquipment(id) {
    dispatch({ type: 'SET', key: 'resEquipment', value: equipment.filter(e => e.id !== id) });
  }

  function searchEquipment(e) {
    const q = [e.type, e.tons ? e.tons+'T' : '', e.brand, e.model].filter(Boolean).join(' ');
    searchSupplier(q, supplier);
  }

  function addPart() {
    dispatch({ type: 'SET', key: 'resParts', value: [...parts, { id: uid(), desc: '', qty: 1, unitCost: 0, total: 0 }]});
  }

  function updatePart(id, field, value) {
    dispatch({ type: 'SET', key: 'resParts', value: parts.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: field === 'qty' || field === 'unitCost' ? parseFloat(value)||0 : value };
      updated.total = (updated.qty||0) * (updated.unitCost||0);
      return updated;
    })});
  }

  // Lineset
  const linesetType = state.resLinesetType || 'preinsulated';
  const sucSize = state.resSucSize || '';
  const liqSize = state.resLiqSize || '';
  const lineLength = parseFloat(state.resLineLength)||0;
  const linesetTotal = parseFloat(state.resLinesetTotal)||0;

  // Labor
  const laborPeriods = state.laborPeriods || [];

  function addLaborPeriod(name = '') {
    dispatch({
      type: 'ADD_LABOR_PERIOD',
      period: { id: uid(), name: name || '', crew: [], days: 1, isNight: false, otMult: 1, nightMult: 1.5, ootPerDay: 0, notes: '' }
    });
  }

  function updateLaborPeriod(id, field, value) {
    dispatch({ type: 'UPDATE_LABOR_PERIOD', id, updates: { [field]: value } });
  }

  const equipTotal = equipment.reduce((s,e) => s+(e.cost||0), 0);
  const partsTotal = parts.reduce((s,p) => s+(p.total||0), 0);
  const markupPct = state.markupPct || 20;
  const markupBase = equipTotal + partsTotal + linesetTotal;
  const markupAmt = markupBase * (markupPct/100);
  const laborTotal = calcTotalLabor(laborPeriods);
  const bidTotal = markupBase + markupAmt + laborTotal;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Supplier search */}
      <Card>
        <SLabel>🔍 Equipment Lookup — {supplier}</SLabel>
        <Row style={{ gap: 8 }}>
          <Input
            value={supplierSearch}
            onChange={e => setSupplierSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchSupplier(supplierSearch, supplier)}
            placeholder={`Search ${supplier} for equipment, part #, model...`}
            style={{ flex: 1 }}
          />
          <Btn variant="green" size="sm" onClick={() => searchSupplier(supplierSearch, supplier)}>Search</Btn>
        </Row>
      </Card>

      {/* Equipment */}
      <div>
        <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <SLabel>Equipment</SLabel>
          <Btn variant="green" size="sm" onClick={addEquipment}>+ Add Equipment</Btn>
        </Row>
        {equipment.length === 0 ? (
          <Card><EmptyState icon="❄️" title="No equipment yet" subtitle="Add the units being installed — heat pumps, split systems, package units" /></Card>
        ) : (
          equipment.map(e => (
            <Card key={e.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Type</div>
                  <Select value={e.type} onChange={ev => updateEquipment(e.id, 'type', ev.target.value)}>
                    {RES_EQUIP_TYPES.map(t => <option key={t}>{t}</option>)}
                  </Select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Tonnage / BTU</div>
                  <Input value={e.tons} onChange={ev => updateEquipment(e.id, 'tons', ev.target.value)} placeholder="2.5T or 30k BTU" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Brand</div>
                  <Input value={e.brand} onChange={ev => updateEquipment(e.id, 'brand', ev.target.value)} placeholder="Carrier, Lennox..." />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Model #</div>
                  <Input value={e.model} onChange={ev => updateEquipment(e.id, 'model', ev.target.value)} placeholder="Model number" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>SEER</div>
                  <Input value={e.seer} onChange={ev => updateEquipment(e.id, 'seer', ev.target.value)} placeholder="16" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Cost</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: colors.textDim }}>$</span>
                    <Input type="number" value={e.cost||''} onChange={ev => updateEquipment(e.id, 'cost', ev.target.value)} placeholder="0.00" />
                  </div>
                </div>
              </div>
              <Row style={{ justifyContent: 'space-between' }}>
                <Btn variant="blue" size="sm" onClick={() => searchEquipment(e)}>🔍 Search {supplier}</Btn>
                <Row style={{ gap: 8 }}>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, color: colors.green }}>{fmt(e.cost)}</span>
                  <Btn variant="red" size="sm" onClick={() => removeEquipment(e.id)}>Remove</Btn>
                </Row>
              </Row>
            </Card>
          ))
        )}
      </div>

      {/* Lineset */}
      <div>
        <SLabel>Lineset</SLabel>
        <Card>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {['preinsulated','roll'].map(type => (
              <button key={type} onClick={() => dispatch({ type: 'SET', key: 'resLinesetType', value: type })}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: `2px solid ${linesetType===type?colors.green:colors.border}`, background: linesetType===type?colors.greenFaint:colors.card2, color: linesetType===type?colors.green:colors.textDim, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                {type === 'preinsulated' ? '✅ Pre-Insulated' : '🔧 Roll Copper'}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 14, padding: '8px 10px', background: colors.surface, borderRadius: 6 }}>
            {linesetType === 'preinsulated' ? 'Pre-insulated lineset — enter total cost from supplier quote' : 'Roll copper — price from copper rates, add insulation to parts'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Suction Size</div>
              <Select value={sucSize} onChange={e => dispatch({ type: 'SET', key: 'resSucSize', value: e.target.value })}>
                <option value="">Select</option>
                {PIPE_SIZES.map(s => <option key={s} value={s}>{s}"</option>)}
              </Select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Liquid Size</div>
              <Select value={liqSize} onChange={e => dispatch({ type: 'SET', key: 'resLiqSize', value: e.target.value })}>
                <option value="">Select</option>
                {PIPE_SIZES.map(s => <option key={s} value={s}>{s}"</option>)}
              </Select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Length (ft)</div>
              <Input type="number" value={state.resLineLength||''} onChange={e => dispatch({ type: 'SET', key: 'resLineLength', value: e.target.value })} placeholder="0" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Lineset Total</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: colors.textDim }}>$</span>
                <Input type="number" value={linesetTotal||''} onChange={e => dispatch({ type: 'SET', key: 'resLinesetTotal', value: parseFloat(e.target.value)||0 })} placeholder="0.00" />
              </div>
            </div>
          </div>
          <Btn variant="blue" size="sm" style={{ marginTop: 12 }}
            onClick={() => searchSupplier(`${sucSize}" ${liqSize}" lineset ${lineLength}ft ${linesetType==='preinsulated'?'pre-insulated':''}`, supplier)}>
            🔍 Search {supplier} for Lineset
          </Btn>
        </Card>
      </div>

      {/* Parts & misc */}
      <div>
        <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <SLabel>Parts & Misc Materials</SLabel>
          <Btn variant="ghost" size="sm" onClick={addPart}>+ Add Part</Btn>
        </Row>
        {parts.length === 0 ? (
          <Card><EmptyState icon="🔧" title="No parts yet" subtitle="Add disconnect boxes, thermostat, refrigerant, etc." /></Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {parts.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${colors.border}`, background: i%2===0?'transparent':colors.surface+'30' }}>
                <TblInput value={p.desc} onChange={e => updatePart(p.id, 'desc', e.target.value)} placeholder="Description" style={{ flex: 1 }} />
                <TblInput type="number" value={p.qty} onChange={e => updatePart(p.id, 'qty', e.target.value)} placeholder="Qty" style={{ width: 45, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
                <TblInput type="number" value={p.unitCost||''} onChange={e => updatePart(p.id, 'unitCost', e.target.value)} placeholder="$" style={{ width: 70, textAlign: 'right', fontFamily: "'DM Mono', monospace" }} />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: colors.green, minWidth: 60, textAlign: 'right' }}>{fmt(p.total)}</span>
                <button onClick={() => searchSupplier(p.desc, supplier)} style={{ background: colors.blue, border: 'none', color: '#fff', borderRadius: 5, padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>🔍</button>
                <button onClick={() => dispatch({ type: 'SET', key: 'resParts', value: parts.filter(x => x.id !== p.id) })} style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}>×</button>
              </div>
            ))}
            <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: colors.textDim }}>Parts Total</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: colors.green }}>{fmt(partsTotal)}</span>
            </div>
          </Card>
        )}
      </div>

      {/* ── LABOR ─────────────────────────────────────────────────────────── */}
      <div>
        <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <SLabel>Labor</SLabel>
            <div style={{ fontSize: 12, color: colors.textDim }}>Add technician time for installation & startup</div>
          </div>
          <Btn variant="green" size="sm" onClick={() => addLaborPeriod()}>+ Add Period</Btn>
        </Row>

        {/* Quick-add buttons when empty */}
        {laborPeriods.length === 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {RES_LABOR_PERIOD_NAMES.map(name => (
              <Btn key={name} variant="surface" size="sm" onClick={() => addLaborPeriod(name)}>+ {name}</Btn>
            ))}
          </div>
        )}

        {laborPeriods.length === 0 ? (
          <Card><EmptyState icon="👷" title="No labor added yet" subtitle="Add installation time, startup, or service calls" /></Card>
        ) : (
          laborPeriods.map(period => (
            <ResLaborPeriodCard
              key={period.id}
              period={period}
              onUpdate={(field, value) => updateLaborPeriod(period.id, field, value)}
              onRemove={() => dispatch({ type: 'REMOVE_LABOR_PERIOD', id: period.id })}
            />
          ))
        )}
      </div>

      {/* Markup & totals */}
      <Card style={{ background: colors.greenFaint, border: `1px solid ${colors.green}40` }}>
        <SLabel>Markup & Bid Summary</SLabel>
        <Row style={{ gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Materials Markup %</div>
            <Input type="number" value={markupPct} onChange={e => dispatch({ type: 'SET', key: 'markupPct', value: parseFloat(e.target.value)||20 })} style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
        </Row>
        {[
          { label: 'Equipment', value: fmt(equipTotal), color: colors.text },
          { label: 'Lineset', value: fmt(linesetTotal), color: colors.text },
          { label: 'Parts', value: fmt(partsTotal), color: colors.text },
          { label: `Markup (${markupPct}%)`, value: fmt(markupAmt), color: colors.green },
          { label: 'Labor', value: fmt(laborTotal), color: colors.yellow },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${colors.border}` }}>
            <span style={{ fontSize: 13, color: colors.textDim }}>{row.label}</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: row.color }}>{row.value}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: `2px solid ${colors.green}`, marginTop: 6 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14 }}>Total Bid</span>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color: colors.green }}>{fmt(bidTotal)}</span>
        </div>
      </Card>

      <Row style={{ justifyContent: 'space-between' }}>
        <Btn variant="ghost" onClick={onBack}>← Back</Btn>
        <Btn variant="green" onClick={onNext}>Next: Proposal →</Btn>
      </Row>
    </div>
  );
}

// ── BID MATERIALS (Commercial) ─────────────────────────────────────────────────
function BidMaterials({ onGenerate }) {
  const { state, dispatch } = useStore();
  const [showFittingPicker, setShowFittingPicker] = useState(false);
  const [fittingSize, setFittingSize] = useState('');
  const [fittingSize2, setFittingSize2] = useState('');
  const [fittingType, setFittingType] = useState('');

  const sections = [...new Set(state.lineItems.map(i => i.section))];
  const sectionTotals = {};
  sections.forEach(s => { sectionTotals[s] = state.lineItems.filter(i => i.section===s).reduce((t,i)=>t+(i.total||0),0); });
  const grandTotal = state.lineItems.reduce((t,i)=>t+(i.total||0),0);

  function updateItem(id, field, value) {
    const items = state.lineItems.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: field==='qty'||field==='unitCost' ? parseFloat(value)||0 : value };
      if (field==='qty'||field==='unitCost') updated.total = (updated.qty||0)*(updated.unitCost||0);
      return updated;
    });
    dispatch({ type: 'SET', key: 'lineItems', value: items });
  }

  function removeItem(id) {
    dispatch({ type: 'SET', key: 'lineItems', value: state.lineItems.filter(i=>i.id!==id) });
  }

  function addFitting() {
    const needsSecond = fittingType.match(/Bushing|Reducer|Street/i);
    if (!fittingSize || !fittingType || (needsSecond && !fittingSize2)) return;
    const desc = needsSecond ? `${fittingSize}" × ${fittingSize2}" ${fittingType}` : `${fittingSize}" ${fittingType}`;
    dispatch({ type: 'SET', key: 'lineItems', value: [...state.lineItems, { id: uid(), section:'Fittings', desc, qty:0, unit:'ea', unitCost:0, total:0 }] });
    setShowFittingPicker(false); setFittingSize(''); setFittingSize2(''); setFittingType('');
  }

  return (
    <div>
      <Row style={{ justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <div>
          <SLabel>Bid Materials</SLabel>
          <div style={{ fontSize:12, color:colors.textDim }}>Auto-generated from circuits</div>
        </div>
        <Row style={{ gap:8 }}>
          <Btn variant="ghost" size="sm" onClick={() => setShowFittingPicker(true)}>+ Add Fitting</Btn>
          <Btn variant="ghost" size="sm" onClick={() => dispatch({ type:'SET', key:'lineItems', value:[...state.lineItems,{id:uid(),section:'Misc',desc:'',qty:1,unit:'ea',unitCost:0,total:0}] })}>+ Add Item</Btn>
          <Btn variant="green" size="sm" onClick={onGenerate}>⚙️ Generate from Circuits</Btn>
        </Row>
      </Row>

      {showFittingPicker && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={() => setShowFittingPicker(false)}>
          <div style={{ background:colors.card, border:`1px solid ${colors.border}`, borderRadius:14, padding:20, width:'100%', maxWidth:400 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
              <SLabel>Add Fitting</SLabel>
              <button onClick={() => setShowFittingPicker(false)} style={{ background:'transparent', border:'none', color:colors.textDim, fontSize:20, cursor:'pointer' }}>×</button>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:colors.textDim, marginBottom:8 }}>Pipe Size</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
                {PIPE_SIZES.map(s => (
                  <button key={s} onClick={() => setFittingSize(s)} style={{ padding:'8px 4px', borderRadius:7, border:`1px solid ${fittingSize===s?colors.green:colors.border}`, background:fittingSize===s?colors.green:colors.surface, color:fittingSize===s?'#000':colors.textDim, fontFamily:"'DM Mono',monospace", fontSize:12, cursor:'pointer' }}>{s}"</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:colors.textDim, marginBottom:8 }}>Fitting Type</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
                {FITTING_TYPES.map(t => (
                  <button key={t} onClick={() => setFittingType(t)} style={{ padding:'8px 4px', borderRadius:7, border:`1px solid ${fittingType===t?colors.green:colors.border}`, background:fittingType===t?colors.greenFaint:colors.surface, color:fittingType===t?colors.green:colors.textDim, fontSize:11, cursor:'pointer' }}>{t}</button>
                ))}
              </div>
            </div>
            {fittingType.match(/Bushing|Reducer|Street/i) && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, color:colors.textDim, marginBottom:8 }}>Second Size</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
                  {PIPE_SIZES.map(s => (
                    <button key={s} onClick={() => setFittingSize2(s)} style={{ padding:'8px 4px', borderRadius:7, border:`1px solid ${fittingSize2===s?colors.green:colors.border}`, background:fittingSize2===s?colors.green:colors.surface, color:fittingSize2===s?'#000':colors.textDim, fontFamily:"'DM Mono',monospace", fontSize:12, cursor:'pointer' }}>{s}"</button>
                  ))}
                </div>
              </div>
            )}
            <Btn variant="green" onClick={addFitting} style={{ width:'100%', justifyContent:'center' }}>+ Add to Materials</Btn>
          </div>
        </div>
      )}

      {state.lineItems.length === 0 ? (
        <Card><EmptyState icon="🔧" title="No materials yet" subtitle="Click Generate from Circuits to auto-build the materials list" /></Card>
      ) : (
        sections.map(section => (
          <div key={section} style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 14px', background:colors.surface, borderRadius:'8px 8px 0 0', border:`1px solid ${colors.border}`, borderBottom:'none' }}>
              <span style={{ fontSize:11, fontWeight:700, color:colors.green, textTransform:'uppercase', letterSpacing:'0.1em' }}>{section}</span>
              <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:700 }}>{fmt(sectionTotals[section])}</span>
            </div>
            <div style={{ border:`1px solid ${colors.border}`, borderRadius:'0 0 8px 8px', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:colors.card2 }}>
                    {['Description','Qty','Unit','Unit Cost','Total',''].map(h => (
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, color:colors.textDim, textTransform:'uppercase', borderBottom:`1px solid ${colors.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.lineItems.filter(i=>i.section===section).map((item,idx) => (
                    <tr key={item.id} style={{ background:idx%2===0?'transparent':colors.surface+'30' }}>
                      <td style={{ padding:'7px 12px', borderBottom:`1px solid ${colors.border}` }}><TblInput value={item.desc} onChange={e=>updateItem(item.id,'desc',e.target.value)} /></td>
                      <td style={{ padding:'7px 12px', borderBottom:`1px solid ${colors.border}` }}><TblInput type="number" value={item.qty} onChange={e=>updateItem(item.id,'qty',e.target.value)} style={{ width:55, textAlign:'center', fontFamily:"'DM Mono',monospace" }} /></td>
                      <td style={{ padding:'7px 12px', borderBottom:`1px solid ${colors.border}`, color:colors.textDim }}>{item.unit}</td>
                      <td style={{ padding:'7px 12px', borderBottom:`1px solid ${colors.border}` }}><TblInput type="number" value={item.unitCost||0} onChange={e=>updateItem(item.id,'unitCost',e.target.value)} style={{ width:75, textAlign:'right', fontFamily:"'DM Mono',monospace" }} /></td>
                      <td style={{ padding:'7px 12px', borderBottom:`1px solid ${colors.border}`, fontFamily:"'DM Mono',monospace", fontWeight:700, color:colors.green }}>{fmtDec(item.total)}</td>
                      <td style={{ padding:'7px 8px', borderBottom:`1px solid ${colors.border}`, textAlign:'center' }}>
                        <button onClick={()=>removeItem(item.id)} style={{ background:colors.red, border:'none', color:'#fff', borderRadius:4, width:20, height:20, cursor:'pointer', fontSize:11 }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
      {grandTotal > 0 && (
        <div style={{ display:'flex', justifyContent:'flex-end', padding:'12px 0' }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:11, color:colors.textDim, marginBottom:4 }}>Materials Subtotal</div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:colors.green }}>{fmt(grandTotal)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SUPPLY HOUSE ───────────────────────────────────────────────────────────────
function SupplyHouseList() {
  const { state, dispatch } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const supplier = state.preferredSupplier || 'RE Michel';

  function addItem(prefill={}) {
    dispatch({ type:'ADD_SUPPLY_ITEM', item:{ id:uid(), partId:'', desc:'', qty:0, unit:'ea', unitCost:0, total:0, category:'Misc', ...prefill }});
  }

  function updateItem(id, field, value) {
    const items = state.supplyItems.map(item => {
      if (item.id!==id) return item;
      const updated = { ...item, [field]: field==='qty'||field==='unitCost' ? parseFloat(value)||0 : value };
      if (field==='qty'||field==='unitCost') updated.total=(updated.qty||0)*(updated.unitCost||0);
      return updated;
    });
    dispatch({ type:'SET', key:'supplyItems', value:items });
  }

  function autoFill() {
    const items = [];
    const wasteFactor = 1+((state.rates?.wasteFactor||10)/100);
    const copperBySize = {};
    state.circuits.forEach(c => {
      const run=(parseFloat(c.runLength)||0)+(parseFloat(c.riserLength)||0);
      [c.sucHoriz,c.sucRiser,c.liqHoriz].forEach(size => {
        if(!size||run<=0) return;
        const k=normalizePipeSize(size);
        copperBySize[k]=(copperBySize[k]||0)+run;
      });
    });
    Object.entries(copperBySize).forEach(([size,footage]) => {
      items.push({ id:uid(), partId:'', desc:`${size}" ACR Copper Lineset`, qty:Math.ceil(footage*wasteFactor), unit:'ft', unitCost:0, total:0, category:'Copper' });
    });
    state.rackParts.filter(p=>!p.storeSupplied).forEach(p => {
      items.push({ id:uid(), partId:p.partId, desc:p.desc, qty:p.qty, unit:p.unit, unitCost:p.unitCost, total:p.total, category:'Rack Parts' });
    });
    items.push({ id:uid(), partId:'', desc:'Nitrogen — pressure test & purge', qty:0, unit:'cylinder', unitCost:0, total:0, category:'Consumables' });
    items.push({ id:uid(), partId:'', desc:'Brazing rod (15% silver)', qty:0, unit:'lb', unitCost:0, total:0, category:'Consumables' });
    const existingDescs = new Set(state.supplyItems.map(i=>i.desc));
    const newItems = items.filter(i=>!existingDescs.has(i.desc));
    dispatch({ type:'SET', key:'supplyItems', value:[...state.supplyItems, ...newItems] });
  }

  function exportCSV() {
    if(!state.supplyItems.length) return;
    let csv='Category,Part Number,Description,Qty,Unit,Unit Cost,Total\n';
    state.supplyItems.forEach(i=>{csv+=`"${i.category}","${i.partId}","${i.desc}",${i.qty},"${i.unit}","${i.unitCost||''}","${i.total||''}"\n`;});
    const blob=new Blob([csv],{type:'text/csv'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=(state.projName||'project')+'_supply_house.csv'; a.click();
  }

  const categories=[...new Set(state.supplyItems.map(i=>i.category))];
  const total=state.supplyItems.reduce((s,i)=>s+(i.total||0),0);

  return (
    <div>
      <Row style={{ justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <div>
          <SLabel>Supply House List</SLabel>
          <div style={{ fontSize:12, color:colors.textDim }}>Auto-filled from circuits and rack parts</div>
        </div>
        <Row style={{ gap:8 }}>
          <Btn variant="ghost" size="sm" onClick={()=>addItem()}>+ Add Item</Btn>
          <Btn variant="surface" size="sm" onClick={autoFill}>⚡ Auto-Fill</Btn>
          <Btn variant="blue" size="sm" onClick={exportCSV}>📥 Export to {supplier}</Btn>
        </Row>
      </Row>
      <div style={{ display:'flex', gap:8, marginBottom:14, background:colors.surface, border:`1px solid ${colors.border}`, borderRadius:8, padding:'10px 12px' }}>
        <span style={{ fontSize:13, fontWeight:700, color:colors.blue }}>🔍</span>
        <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchSupplier(searchQuery,supplier)} placeholder={`Search ${supplier}...`}
          style={{ flex:1, background:'transparent', border:'none', color:colors.text, fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
        <Btn variant="blue" size="sm" onClick={()=>searchSupplier(searchQuery,supplier)}>Search</Btn>
      </div>
      {state.supplyItems.length===0 ? (
        <Card><EmptyState icon="📋" title="Supply house list is empty" subtitle="Click Auto-Fill to populate from circuits and rack parts, then add fittings manually" /></Card>
      ) : (
        categories.map(cat=>(
          <div key={cat} style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:colors.green, textTransform:'uppercase', letterSpacing:'0.1em', padding:'6px 0', borderBottom:`1px solid ${colors.border}`, marginBottom:8 }}>{cat}</div>
            {state.supplyItems.filter(i=>i.category===cat).map((item,idx)=>(
              <div key={item.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom:`1px solid ${colors.border+'60'}` }}>
                <TblInput value={item.partId} onChange={e=>updateItem(item.id,'partId',e.target.value)} placeholder="Part #" style={{ width:80, fontFamily:"'DM Mono',monospace", flexShrink:0 }} />
                <TblInput value={item.desc} onChange={e=>updateItem(item.id,'desc',e.target.value)} placeholder="Description" style={{ flex:1 }} />
                <TblInput type="number" value={item.qty} onChange={e=>updateItem(item.id,'qty',e.target.value)} placeholder="Qty" style={{ width:50, textAlign:'center', fontFamily:"'DM Mono',monospace", flexShrink:0 }} />
                <TblInput type="number" value={item.unitCost||''} onChange={e=>updateItem(item.id,'unitCost',e.target.value)} placeholder="$" style={{ width:70, textAlign:'right', fontFamily:"'DM Mono',monospace", flexShrink:0 }} />
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:700, color:colors.green, minWidth:60, textAlign:'right', flexShrink:0 }}>{item.total>0?fmt(item.total):'—'}</span>
                <button onClick={()=>searchSupplier(item.partId||item.desc,supplier)} style={{ background:colors.blue, border:'none', color:'#fff', borderRadius:5, padding:'3px 8px', fontSize:10, cursor:'pointer', flexShrink:0 }}>🔍</button>
                <button onClick={()=>dispatch({type:'REMOVE_SUPPLY_ITEM',id:item.id})} style={{ background:colors.red, border:'none', color:'#fff', borderRadius:5, width:22, height:22, cursor:'pointer', fontSize:12, flexShrink:0 }}>×</button>
              </div>
            ))}
          </div>
        ))
      )}
      {total>0&&(
        <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0', borderTop:`2px solid ${colors.green}` }}>
          <span style={{ fontSize:14, fontWeight:700 }}>Supply House Total (quoted)</span>
          <span style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:colors.green }}>{fmt(total)}</span>
        </div>
      )}
    </div>
  );
}

// ── MAIN STEP 4 ───────────────────────────────────────────────────────────────
export default function Step4_Materials({ onNext, onBack }) {
  const { state, dispatch } = useStore();
  const [activeTab, setActiveTab] = useState('bid');

  // Residential gets its own full page
  if (state.mode === 'Residential HVAC') {
    return <ResidentialEquipment onNext={onNext} onBack={onBack} />;
  }

  function updateCopperRate(size, value) {
    const newRates = { ...state.rates, cu: { ...(state.rates?.cu||{}), [normalizePipeSize(size)]: parseFloat(value)||0 } };
    dispatch({ type:'SET', key:'rates', value:newRates });
  }

  function generateMaterials() {
    const items = [];
    const rates = state.rates || {};
    const wasteFactor = 1+((rates.wasteFactor||10)/100);
    const copperBySize = {};
    state.circuits.forEach(c => {
      const run=parseFloat(c.runLength)||0, riser=parseFloat(c.riserLength)||0;
      const total=c.isRiserOnly?riser:run+riser;
      if(c.isRiserOnly){if(c.sucRiser){const k=normalizePipeSize(c.sucRiser);copperBySize[k]=(copperBySize[k]||0)+riser;}}
      else{
        if(c.sucHoriz&&run>0){const k=normalizePipeSize(c.sucHoriz);copperBySize[k]=(copperBySize[k]||0)+run;}
        if(c.sucRiser&&riser>0){const k=normalizePipeSize(c.sucRiser);copperBySize[k]=(copperBySize[k]||0)+riser;}
        if(c.liqHoriz&&total>0){const k=normalizePipeSize(c.liqHoriz);copperBySize[k]=(copperBySize[k]||0)+total;}
      }
    });
    Object.entries(copperBySize).forEach(([size,footage])=>{
      const rate=rates?.cu?.[size]||0; const qty=Math.ceil(footage*wasteFactor);
      items.push({id:uid(),section:'Copper',desc:`${size}" ACR Copper`,qty,unit:'ft',unitCost:rate,total:qty*rate,pipeSize:size,baseQty:footage});
    });
    const copperTotal=items.reduce((s,i)=>s+(i.total||0),0);
    const fittingsPct=rates.fittingsMarkupPct||25;
    const fittingsAmt=Math.round(copperTotal*fittingsPct/100);
    items.push({id:uid(),section:'Fittings',desc:`Fittings Allowance (${fittingsPct}% of copper)`,qty:1,unit:'lot',unitCost:fittingsAmt,total:fittingsAmt,isFittingsAllowance:true});
    let medSucFt=0,lowSucFt=0,lowLiqFt=0;
    state.circuits.forEach(c=>{
      if(c.isRiserOnly) return;
      const runFt=(parseFloat(c.runLength)||0)+(parseFloat(c.riserLength)||0);
      if(c.tempType==='low'){lowSucFt+=runFt;lowLiqFt+=runFt;}else{medSucFt+=runFt;}
    });
    if(medSucFt>0){const r=rates?.insul?.medSuction||0;const q=Math.ceil(medSucFt*wasteFactor);items.push({id:uid(),section:'Insulation',desc:'Suction Insulation — Med Temp (3/4" wall)',qty:q,unit:'ft',unitCost:r,total:q*r});}
    if(lowSucFt>0){const r=rates?.insul?.lowSuction||0;const q=Math.ceil(lowSucFt*wasteFactor);items.push({id:uid(),section:'Insulation',desc:'Suction Insulation — Low Temp (1" wall)',qty:q,unit:'ft',unitCost:r,total:q*r});}
    if(lowLiqFt>0){const r=rates?.insul?.lowLiquid||0;const q=Math.ceil(lowLiqFt*wasteFactor);items.push({id:uid(),section:'Insulation',desc:'Liquid Insulation — Low Temp (1/2" wall)',qty:q,unit:'ft',unitCost:r,total:q*r});}
    const longestRun=Math.max(...state.circuits.filter(c=>!c.isRiserOnly).map(c=>parseFloat(c.runLength)||0),0);
    if(longestRun>0) items.push({id:uid(),section:'Hardware',desc:'Pipe Hangers @ 6ft spacing',qty:Math.ceil(longestRun/6),unit:'ea',unitCost:0,total:0});
    items.push({id:uid(),section:'Consumables',desc:'Nitrogen — Pressure Testing & Purge',qty:0,unit:'cylinder',unitCost:0,total:0});
    items.push({id:uid(),section:'Consumables',desc:'Brazing Rod (15% silver)',qty:0,unit:'lb',unitCost:0,total:0});
    items.push({id:uid(),section:'Consumables',desc:'Foam & Insulation Adhesive',qty:0,unit:'can',unitCost:0,total:0});
    dispatch({ type:'SET', key:'lineItems', value:items });
  }

  const PIPE_SIZE_LIST=['1/4','3/8','1/2','5/8','7/8','1-1/8','1-3/8','1-5/8','2-1/8'];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <Card>
        <SLabel>Copper Rates ($/ft)</SLabel>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:14 }}>
          {PIPE_SIZE_LIST.map(size=>(
            <div key={size}>
              <div style={{ fontSize:10, color:colors.textDim, marginBottom:4 }}>{size}"</div>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ color:colors.textDim, fontSize:12 }}>$</span>
                <Input type="number" value={state.rates?.cu?.[size]||''} onChange={e=>updateCopperRate(size,e.target.value)} placeholder="0.00" style={{ padding:'7px 8px', fontSize:12, fontFamily:"'DM Mono',monospace" }} />
              </div>
            </div>
          ))}
        </div>
        <SLabel>Insulation ($/ft)</SLabel>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
          {[{key:'medSuction',label:'Med Temp Suction (3/4" wall)'},{key:'lowSuction',label:'Low Temp Suction (1" wall)'},{key:'lowLiquid',label:'Low Temp Liquid (1/2" wall)'}].map(r=>(
            <div key={r.key}>
              <div style={{ fontSize:10, color:colors.textDim, marginBottom:4 }}>{r.label}</div>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ color:colors.textDim, fontSize:12 }}>$</span>
                <Input type="number" value={state.rates?.insul?.[r.key]||''} onChange={e=>dispatch({type:'SET_INSUL_RATE',key:r.key,value:parseFloat(e.target.value)||0})} placeholder="0.00" style={{ padding:'7px 8px', fontSize:12, fontFamily:"'DM Mono',monospace" }} />
              </div>
            </div>
          ))}
        </div>
        <Row style={{ gap:20, flexWrap:'wrap' }}>
          {[{key:'fittingsMarkupPct',label:'Fittings Allowance (%)',default:25},{key:'wasteFactor',label:'Waste Factor (%)',default:10}].map(r=>(
            <div key={r.key} style={{ flex:1, minWidth:120 }}>
              <div style={{ fontSize:10, color:colors.textDim, marginBottom:4 }}>{r.label}</div>
              <Input type="number" value={state.rates?.[r.key]||r.default} onChange={e=>dispatch({type:'SET_RATES_MISC',key:r.key,value:parseFloat(e.target.value)||r.default})} style={{ fontFamily:"'DM Mono',monospace" }} />
            </div>
          ))}
          <div style={{ flex:1, minWidth:120 }}>
            <div style={{ fontSize:10, color:colors.textDim, marginBottom:4 }}>Materials Markup (%)</div>
            <Input type="number" value={state.markupPct||20} onChange={e=>dispatch({type:'SET',key:'markupPct',value:parseFloat(e.target.value)||20})} style={{ fontFamily:"'DM Mono',monospace" }} />
          </div>
        </Row>
      </Card>

      <div style={{ display:'flex', gap:4, background:colors.surface, padding:4, borderRadius:10, border:`1px solid ${colors.border}` }}>
        {[{key:'bid',label:'📋 Bid Materials'},{key:'supply',label:'🚚 Supply House List'}].map(t=>(
          <button key={t.key} onClick={()=>setActiveTab(t.key)} style={{ flex:1, padding:'10px', borderRadius:8, border:'none', cursor:'pointer', background:activeTab===t.key?colors.green:'transparent', color:activeTab===t.key?'#000':colors.textDim, fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:700, transition:'all 0.15s' }}>{t.label}</button>
        ))}
      </div>

      {activeTab==='bid' ? <BidMaterials onGenerate={generateMaterials} /> : <SupplyHouseList />}

      <Row style={{ justifyContent:'space-between', marginTop:10 }}>
        <Btn variant="ghost" onClick={onBack}>← Back</Btn>
        <Btn variant="green" onClick={onNext}>Next: Labor →</Btn>
      </Row>
    </div>
  );
}
