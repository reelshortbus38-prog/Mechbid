import { useState } from 'react';
import { useStore, uid, fmt } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Select, Row, TblInput, EmptyState } from '../components/UI.jsx';
import { searchSupplier } from '../api/ai.js';
import { PriceMatchChip } from '../components/PriceBook.jsx';

const HVAC_EQUIP_TYPES = [
  'Rooftop Unit (RTU)',
  'Split System — Condenser',
  'Split System — Air Handler',
  'Packaged Heat Pump',
  'Mini Split — Condenser',
  'Mini Split — Head Unit',
  'Air Handling Unit (AHU)',
  'Fan Coil Unit (FCU)',
  'VAV Box',
  'Heat Recovery Ventilator (HRV)',
  'Energy Recovery Ventilator (ERV)',
  'Chiller',
  'Boiler',
  'Cooling Tower',
  'Exhaust Fan',
  'Make-Up Air Unit (MAU)',
  'Other',
];

const REFRIGERANTS = ['R-410A', 'R-32', 'R-454B', 'R-407C', 'R-22 (existing)', 'R-134a', 'Other'];

const TASK_TYPES = [
  'New Installation',
  'Replacement',
  'Retrofit / Upgrade',
  'Startup & Commissioning',
  'Controls / BMS Wiring',
  'Ductwork Connection',
  'Electrical Rough-In',
  'Crane / Rigging',
  'Curb Adapter',
  'Disconnect / Decommission',
  'Other',
];

// ── EQUIPMENT CARD ─────────────────────────────────────────────────────────────
function EquipmentCard({ equip, onUpdate, onRemove, supplier }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card style={{ marginBottom: 12 }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>🌀</span>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700 }}>
              {equip.tag ? `[${equip.tag}] ` : ''}{equip.type || 'HVAC Unit'}
            </div>
            {equip.tons && (
              <span style={{ fontSize: 10, background: colors.surface, color: colors.textDim, padding: '2px 8px', borderRadius: 4, fontFamily: "'DM Mono', monospace" }}>
                {equip.tons}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: colors.textDim, marginTop: 4 }}>
            {[equip.brand, equip.model].filter(Boolean).join(' · ') || 'No brand/model set'}
            {equip.cost > 0 ? ` · ${fmt(equip.cost)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {equip.cost > 0 && (
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, color: colors.green }}>{fmt(equip.cost)}</span>
          )}
          <span style={{ color: colors.textDim }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <>
          <div style={{ height: 1, background: colors.border, margin: '14px 0' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            {/* Equipment Tag */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Equipment Tag / ID</div>
              <Input value={equip.tag || ''} onChange={e => onUpdate('tag', e.target.value)} placeholder="AHU-1, RTU-3..." />
            </div>

            {/* Type */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Equipment Type</div>
              <Select value={equip.type} onChange={e => onUpdate('type', e.target.value)}>
                {HVAC_EQUIP_TYPES.map(t => <option key={t}>{t}</option>)}
              </Select>
            </div>

            {/* Capacity */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Capacity (Tons / BTU / CFM)</div>
              <Input value={equip.tons || ''} onChange={e => onUpdate('tons', e.target.value)} placeholder="5T or 60,000 BTU or 2000 CFM" />
            </div>

            {/* Brand */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Brand</div>
              <Input value={equip.brand || ''} onChange={e => onUpdate('brand', e.target.value)} placeholder="Carrier, Trane, Daikin..." />
            </div>

            {/* Model */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Model #</div>
              <Input value={equip.model || ''} onChange={e => onUpdate('model', e.target.value)} placeholder="Model number" />
            </div>

            {/* Refrigerant */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Refrigerant</div>
              <Select value={equip.refrigerant || 'R-410A'} onChange={e => onUpdate('refrigerant', e.target.value)}>
                {REFRIGERANTS.map(r => <option key={r}>{r}</option>)}
              </Select>
            </div>

            {/* MCA */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>MCA (Amps)</div>
              <Input type="number" value={equip.mca || ''} onChange={e => onUpdate('mca', e.target.value)} placeholder="0" />
            </div>

            {/* MOP */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>MOP / Breaker (Amps)</div>
              <Input type="number" value={equip.mop || ''} onChange={e => onUpdate('mop', e.target.value)} placeholder="0" />
            </div>

            {/* Voltage */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Voltage</div>
              <Select value={equip.voltage || ''} onChange={e => onUpdate('voltage', e.target.value)}>
                <option value="">Select</option>
                <option>208/230V 1-Phase</option>
                <option>208/230V 3-Phase</option>
                <option>460V 3-Phase</option>
                <option>115V 1-Phase</option>
                <option>277/480V 3-Phase</option>
              </Select>
            </div>

            {/* Location */}
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Location / Zone</div>
              <Input value={equip.location || ''} onChange={e => onUpdate('location', e.target.value)} placeholder="Roof Zone A, Suite 102..." />
            </div>
          </div>

          {/* Cost */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Equipment Cost</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: colors.textDim }}>$</span>
                <Input type="number" value={equip.cost || ''} onChange={e => onUpdate('cost', parseFloat(e.target.value) || 0)} placeholder="0.00" />
                {!equip.cost && (
                  <PriceMatchChip
                    desc={[equip.type, equip.brand, equip.model].filter(Boolean).join(' ')}
                    onFill={price => onUpdate('cost', price)}
                  />
                )}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Install Task</div>
              <Select value={equip.task || 'New Installation'} onChange={e => onUpdate('task', e.target.value)}>
                {TASK_TYPES.map(t => <option key={t}>{t}</option>)}
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Notes</div>
            <Input value={equip.notes || ''} onChange={e => onUpdate('notes', e.target.value)} placeholder="Crane required, existing curb, controls scope..." />
          </div>

          {/* Actions */}
          <Row style={{ justifyContent: 'space-between' }}>
            <Btn variant="blue" size="sm" onClick={() => searchSupplier(`${equip.type} ${equip.tons || ''} ${equip.brand || ''} ${equip.model || ''}`.trim(), supplier)}>
              🔍 Search {supplier}
            </Btn>
            <Btn variant="red" size="sm" onClick={onRemove}>Remove</Btn>
          </Row>
        </>
      )}
    </Card>
  );
}

// ── MISC PARTS ─────────────────────────────────────────────────────────────────
function MiscParts() {
  const { state, dispatch } = useStore();
  const supplier = state.preferredSupplier || 'RE Michel';
  const parts = state.hvacParts || [];

  function addPart() {
    dispatch({ type: 'SET', key: 'hvacParts', value: [...parts, { id: uid(), desc: '', qty: 1, unitCost: 0, total: 0 }] });
  }

  function updatePart(id, field, value) {
    dispatch({ type: 'SET', key: 'hvacParts', value: parts.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: field === 'qty' || field === 'unitCost' ? parseFloat(value) || 0 : value };
      updated.total = (updated.qty || 0) * (updated.unitCost || 0);
      return updated;
    })});
  }

  const partsTotal = parts.reduce((s, p) => s + (p.total || 0), 0);

  return (
    <div>
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <SLabel>Parts & Misc Materials</SLabel>
        <Btn variant="ghost" size="sm" onClick={addPart}>+ Add Part</Btn>
      </Row>
      {parts.length === 0 ? (
        <Card><EmptyState icon="🔧" title="No parts yet" subtitle="Add thermostats, controls, refrigerant, filters, curb adapters, etc." /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {parts.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${colors.border}`, background: i % 2 === 0 ? 'transparent' : colors.surface + '30' }}>
              <TblInput value={p.desc} onChange={e => updatePart(p.id, 'desc', e.target.value)} placeholder="Description" style={{ flex: 1 }} />
              {!p.unitCost && <PriceMatchChip desc={p.desc} onFill={price => updatePart(p.id, 'unitCost', price)} />}
              <TblInput type="number" value={p.qty} onChange={e => updatePart(p.id, 'qty', e.target.value)} placeholder="Qty" style={{ width: 45, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
              <TblInput type="number" value={p.unitCost || ''} onChange={e => updatePart(p.id, 'unitCost', e.target.value)} placeholder="$" style={{ width: 70, textAlign: 'right', fontFamily: "'DM Mono', monospace" }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: colors.green, minWidth: 60, textAlign: 'right' }}>{fmt(p.total)}</span>
              <button onClick={() => searchSupplier(p.desc, supplier)} style={{ background: colors.blue, border: 'none', color: '#fff', borderRadius: 5, padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>🔍</button>
              <button onClick={() => dispatch({ type: 'SET', key: 'hvacParts', value: parts.filter(x => x.id !== p.id) })} style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}>×</button>
            </div>
          ))}
          <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: colors.textDim }}>Parts Total</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: colors.green }}>{fmt(partsTotal)}</span>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function StepHVACEquipment({ onNext, onBack }) {
  const { state, dispatch } = useStore();
  const [supplierSearch, setSupplierSearch] = useState('');
  const supplier = state.preferredSupplier || 'RE Michel';

  const equipment = state.hvacEquipment || [];
  const parts = state.hvacParts || [];

  function addEquipment() {
    dispatch({
      type: 'SET', key: 'hvacEquipment', value: [...equipment, {
        id: uid(), type: 'Rooftop Unit (RTU)', tag: '', tons: '', brand: '', model: '',
        refrigerant: 'R-410A', mca: '', mop: '', voltage: '', location: '',
        cost: 0, task: 'New Installation', notes: '',
      }]
    });
  }

  function updateEquipment(id, field, value) {
    dispatch({
      type: 'SET', key: 'hvacEquipment', value: equipment.map(e =>
        e.id === id ? { ...e, [field]: field === 'cost' || field === 'mca' || field === 'mop' ? parseFloat(value) || 0 : value } : e
      )
    });
  }

  function removeEquipment(id) {
    dispatch({ type: 'SET', key: 'hvacEquipment', value: equipment.filter(e => e.id !== id) });
  }

  const equipTotal = equipment.reduce((s, e) => s + (e.cost || 0), 0);
  const partsTotal = parts.reduce((s, p) => s + (p.total || 0), 0);
  const markupPct = state.markupPct || 20;
  const markupBase = equipTotal + partsTotal;
  const markupAmt = markupBase * (markupPct / 100);

  // Equipment schedule summary for the header
  const unitCount = equipment.length;
  const totalTons = equipment.reduce((s, e) => {
    const match = String(e.tons || '').match(/[\d.]+/);
    return s + (match ? parseFloat(match[0]) : 0);
  }, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Summary stats */}
      {equipment.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { label: 'Units on Schedule', value: unitCount, color: colors.text },
            { label: 'Total Capacity', value: totalTons > 0 ? `${totalTons}T` : '—', color: colors.text },
            { label: 'Equipment Cost', value: fmt(equipTotal), color: colors.green },
          ].map(s => (
            <div key={s.label} style={{ background: colors.card2, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Supplier search */}
      <Card>
        <SLabel>🔍 Equipment Lookup — {supplier}</SLabel>
        <Row style={{ gap: 8 }}>
          <Input
            value={supplierSearch}
            onChange={e => setSupplierSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchSupplier(supplierSearch, supplier)}
            placeholder={`Search ${supplier} for RTU, split system, AHU, part #...`}
            style={{ flex: 1 }}
          />
          <Btn variant="green" size="sm" onClick={() => searchSupplier(supplierSearch, supplier)}>Search</Btn>
        </Row>
      </Card>

      {/* Equipment schedule */}
      <div>
        <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <SLabel>Equipment Schedule</SLabel>
            <div style={{ fontSize: 12, color: colors.textDim }}>Add each HVAC unit — RTUs, split systems, AHUs, fan coils</div>
          </div>
          <Btn variant="green" size="sm" onClick={addEquipment}>+ Add Unit</Btn>
        </Row>

        {equipment.length === 0 ? (
          <Card>
            <EmptyState
              icon="🌀"
              title="No equipment on schedule yet"
              subtitle="Add each HVAC unit to be installed or replaced — RTUs, split systems, AHUs, VAV boxes"
            />
          </Card>
        ) : (
          equipment.map(e => (
            <EquipmentCard
              key={e.id}
              equip={e}
              onUpdate={(field, value) => updateEquipment(e.id, field, value)}
              onRemove={() => removeEquipment(e.id)}
              supplier={supplier}
            />
          ))
        )}
      </div>

      {/* Misc parts */}
      <MiscParts />

      {/* Markup summary */}
      {(equipTotal + partsTotal) > 0 && (
        <Card style={{ background: colors.greenFaint, border: `1px solid ${colors.green}40` }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <SLabel>Equipment Summary</SLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: colors.textDim }}>Markup %</span>
              <Input
                type="number"
                value={markupPct}
                onChange={e => dispatch({ type: 'SET', key: 'markupPct', value: parseFloat(e.target.value) || 20 })}
                style={{ width: 65, fontFamily: "'DM Mono', monospace", textAlign: 'center' }}
              />
            </div>
          </Row>
          {[
            { label: 'Equipment Cost', value: fmt(equipTotal), color: colors.text },
            { label: 'Parts & Materials', value: fmt(partsTotal), color: colors.text },
            { label: `Markup (${markupPct}%)`, value: fmt(markupAmt), color: colors.green },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${colors.border}` }}>
              <span style={{ fontSize: 13, color: colors.textDim }}>{row.label}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: row.color }}>{row.value}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: `2px solid ${colors.green}`, marginTop: 6 }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14 }}>Equipment + Markup</span>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: colors.green }}>{fmt(markupBase + markupAmt)}</span>
          </div>
        </Card>
      )}

      <Row style={{ justifyContent: 'space-between' }}>
        <Btn variant="ghost" onClick={onBack}>← Back</Btn>
        <Btn variant="green" onClick={onNext}>Next: Labor →</Btn>
      </Row>
    </div>
  );
}
