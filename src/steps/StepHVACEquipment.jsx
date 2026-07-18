import { useState } from 'react';
import { useStore, uid, fmt, defaultHvacPrice } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Select, Row, TblInput, EmptyState } from '../components/UI.jsx';
import { searchSupplier } from '../api/ai.js';
import { PriceMatchChip, SupplierSwitcher, loadPriceBook, savePriceBook, findPriceMatch } from '../components/PriceBook.jsx';
import { parseDuctDesc, ductPurchase } from '../components/ductwork.js';
import ChargeAdderCalc from '../components/ChargeCalc.jsx';

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
    // Same learning loop as the refrigeration materials table: a unit cost
    // typed here goes into the price book, so the next job autofills it.
    if (field === 'unitCost') {
      const it = parts.find(p => p.id === id);
      const price = parseFloat(value) || 0;
      if (it && price > 0 && it.desc) {
        const book = loadPriceBook();
        const norm = it.desc.trim().toLowerCase();
        const existing = book.find(e => (e.desc || '').trim().toLowerCase() === norm);
        if (existing) {
          if (existing.price !== price) savePriceBook(book.map(e => e === existing ? { ...e, price } : e));
        } else {
          savePriceBook([...book, { id: uid(), desc: it.desc, partId: '', category: 'HVAC', unit: 'ea', price }]);
        }
      }
    }
  }

  const partsTotal = parts.reduce((s, p) => s + (p.total || 0), 0);

  // Common commercial-HVAC install items that are easy to leave off a bid —
  // one tap adds the line so the estimator just fills qty/cost.
  const COMMON = [
    'Curb adapter', 'Roof curb / rails', 'Crane / rigging', 'Disconnect & whip',
    'Programmable / BMS thermostat', 'Economizer', 'Low-ambient kit', 'Hail guards',
    'Condensate trap & drain (PVC)', 'Duct smoke detector', 'Vibration isolation',
    'Filter rack & filters', 'Duct connection / flex / transitions',
    'Refrigerant (R-410A / R-454B) by lb', 'Lineset (split)', 'Refrigerant line insulation',
  ];
  const addNamed = desc => {
    const uc = defaultHvacPrice(desc);
    dispatch({ type: 'SET', key: 'hvacParts', value: [...parts, { id: uid(), desc, qty: 1, unitCost: uc, total: uc }] });
  };

  // Backfill ballpark prices onto any line still at $0 — the takeoff's air
  // devices land unpriced, and one tap gets a close number on all of them.
  // Duct FOOTAGE lines are left alone (priced by the Duct calculator); their
  // generated purchase lines and everything else get a default.
  function fillDefaults() {
    let filled = 0;
    const next = parts.map(p => {
      if ((p.unitCost || 0) > 0) return p;
      const uc = defaultHvacPrice(p.desc);
      if (!uc) return p;
      filled++;
      return { ...p, unitCost: uc, total: (p.qty || 0) * uc };
    });
    if (filled) dispatch({ type: 'SET', key: 'hvacParts', value: next });
  }
  const unpricedCount = parts.filter(p => (p.unitCost || 0) === 0 && defaultHvacPrice(p.desc) > 0).length;

  return (
    <div>
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <SLabel>Parts & Misc Materials</SLabel>
        <Row style={{ gap: 8 }}>
          {unpricedCount > 0 && <Btn variant="green" size="sm" onClick={fillDefaults}>💲 Fill default prices ({unpricedCount})</Btn>}
          <Btn variant="ghost" size="sm" onClick={addPart}>+ Add Part</Btn>
        </Row>
      </Row>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {COMMON.map(c => (
          <button key={c} onClick={() => addNamed(c)} style={{ padding: '5px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textDim }}>+ {c}</button>
        ))}
      </div>
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

// ── DUCT PURCHASE CALCULATOR ───────────────────────────────────────────────────
// Duct isn't bought the way it's measured. The takeoff is in feet per size,
// but rectangular sheet metal is custom-fabricated and priced BY THE POUND,
// spiral comes in 10' joints, flex in 25' boxes, and wrap insulation by the
// ~100 sq ft roll. This card reads the "Ductwork — …" lines above (their Qty
// column = linear feet scaled off the plan), shows the conversion live, and
// one button adds the purchase lines — priced from the price book when it
// knows the item, industry-ballpark defaults otherwise (always editable, and
// edits are remembered).
function DuctCalculator() {
  const { state, dispatch } = useStore();
  const parts = state.hvacParts || [];
  const [wastePct, setWastePct] = useState(15);
  const [insulate, setInsulate] = useState('supply');
  const [added, setAdded] = useState(false);

  const ductLines = parts.filter(p => !p.dgen && parseDuctDesc(p.desc));
  if (ductLines.length === 0) return null;

  const runs = ductLines.map(p => ({ desc: p.desc, lf: Number(p.qty) || 0 }));
  const { lines } = ductPurchase(runs, { wastePct: Number(wastePct) || 0, insulate });
  const missingFootage = ductLines.filter(p => !(Number(p.qty) > 0));

  function addPurchaseLines() {
    const book = loadPriceBook();
    const newLines = lines.map(l => {
      const match = findPriceMatch(book, { desc: l.desc });
      const unitCost = match ? Number(match.entry.price) || 0 : (l.defaultPrice || 0);
      return {
        id: uid(), desc: `${l.desc}${l.notes ? ` (${l.notes})` : ''}`,
        qty: l.qty, unitCost, total: l.qty * unitCost, dgen: true,
      };
    });
    // Regenerating replaces the previously generated purchase lines, so
    // changing footage or options never stacks duplicates.
    dispatch({ type: 'SET', key: 'hvacParts', value: [...parts.filter(p => !p.dgen), ...newLines] });
    setAdded(true);
  }

  return (
    <Card style={{ background: colors.surface }}>
      <SLabel>📐 Duct → Purchase Units</SLabel>
      <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.6, marginBottom: 10 }}>
        Enter each Ductwork line's <strong>linear feet</strong> in its Qty box above (scale it off the plan), then convert here.
        Rectangular sheet metal is bought <strong>by the pound</strong> (fabricated — gauge set by duct size per SMACNA),
        spiral in 10' joints, flex in 25' boxes, wrap insulation by the roll. Leave the $ on the footage lines at 0 —
        the price belongs on the purchase lines this adds.
      </div>

      {missingFootage.length > 0 && (
        <div style={{ fontSize: 11, color: colors.yellow, marginBottom: 10 }}>
          ⚠ {missingFootage.length} duct line{missingFootage.length > 1 ? 's' : ''} still ha{missingFootage.length > 1 ? 've' : 's'} no footage entered — {missingFootage.map(p => (p.desc.match(/[\d"x×]+\s*(?:round|duct)?/i) || [p.desc])[0].trim()).join(', ')}
        </div>
      )}

      <Row style={{ gap: 14, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Waste/seams %</span>
          <Input type="number" value={wastePct} onChange={e => { setWastePct(e.target.value); setAdded(false); }} style={{ width: 60, textAlign: 'center' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Insulate</span>
          <Select value={insulate} onChange={e => { setInsulate(e.target.value); setAdded(false); }} style={{ width: 200 }}>
            <option value="supply">Supply + OA duct (typical)</option>
            <option value="all">All duct</option>
            <option value="none">None</option>
          </Select>
        </div>
      </Row>

      {lines.length === 0 ? (
        <div style={{ fontSize: 12, color: colors.textDim }}>Nothing to convert yet — enter footage on the duct lines above.</div>
      ) : (
        <>
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            {lines.map((l, i) => (
              <div key={l.desc} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderBottom: i < lines.length - 1 ? `1px solid ${colors.border}` : 'none', fontSize: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{l.desc}</div>
                  {l.notes && <div style={{ fontSize: 10, color: colors.textDim }}>{l.notes}</div>}
                </div>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, whiteSpace: 'nowrap' }}>{l.qty.toLocaleString()} {l.unit}</span>
              </div>
            ))}
          </div>
          <Row style={{ gap: 10, alignItems: 'center' }}>
            <Btn variant="green" size="sm" onClick={addPurchaseLines}>↓ Add purchase lines to Parts</Btn>
            {added && <span style={{ fontSize: 11, color: colors.green }}>✓ Added — prices came from your price book where known, industry ballpark otherwise. Edit any $ and MechBid remembers it.</span>}
          </Row>
        </>
      )}
    </Card>
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
        <Row style={{ justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <SLabel style={{ margin: 0 }}>🔍 Equipment Lookup</SLabel>
          <SupplierSwitcher compact value={supplier} onChange={s => dispatch({ type: 'SET', key: 'preferredSupplier', value: s })} />
        </Row>
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

      {/* Duct footage → pounds / joints / rolls (only shows when duct lines exist) */}
      <DuctCalculator />

      {/* Split-system charge adder — run once per split/mini-split; each Add
          appends its own line to the parts table above. */}
      <ChargeAdderCalc
        onAdd={line => dispatch({ type: 'SET', key: 'hvacParts', value: [...parts, { id: uid(), ...line }] })}
      />

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
