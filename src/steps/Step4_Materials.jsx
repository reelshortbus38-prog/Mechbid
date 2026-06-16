import { useState, useCallback } from 'react';
import { useStore, uid, fmt, fmtDec, normalizePipeSize } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Select, Row, TblInput, EmptyState } from '../components/UI.jsx';
import { searchSupplier } from '../api/ai.js';

const PIPE_SIZES = ['1/4', '3/8', '1/2', '5/8', '7/8', '1-1/8', '1-3/8', '1-5/8', '2-1/8', '2-5/8', '3-1/8'];
const FITTING_TYPES = ['Coupling', 'Elbow 90°', 'Elbow 45°', 'Tee', 'Bushing', 'Reducer', 'P-Trap', 'Wye', 'Cap', 'Union', 'Street Ell', 'Sweat Adapter'];

// ── BID MATERIALS TAB ─────────────────────────────────────────────────────────
function BidMaterials({ onGenerate }) {
  const { state, dispatch } = useStore();
  const [showFittingPicker, setShowFittingPicker] = useState(false);
  const [fittingSize, setFittingSize] = useState('');
  const [fittingSize2, setFittingSize2] = useState('');
  const [fittingType, setFittingType] = useState('');

  const sections = [...new Set(state.lineItems.map(i => i.section))];
  const sectionTotals = {};
  sections.forEach(s => {
    sectionTotals[s] = state.lineItems.filter(i => i.section === s).reduce((t, i) => t + (i.total || 0), 0);
  });
  const grandTotal = state.lineItems.reduce((t, i) => t + (i.total || 0), 0);

  function updateItem(id, field, value) {
    const items = state.lineItems.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: field === 'qty' || field === 'unitCost' ? parseFloat(value) || 0 : value };
      if (field === 'qty' || field === 'unitCost') updated.total = (updated.qty || 0) * (updated.unitCost || 0);
      return updated;
    });
    dispatch({ type: 'SET', key: 'lineItems', value: items });
  }

  function removeItem(id) {
    dispatch({ type: 'SET', key: 'lineItems', value: state.lineItems.filter(i => i.id !== id) });
  }

  function addFitting() {
    const needsSecond = fittingType.match(/Bushing|Reducer|Street/i);
    if (!fittingSize || !fittingType || (needsSecond && !fittingSize2)) return;
    const desc = needsSecond ? `${fittingSize}" × ${fittingSize2}" ${fittingType}` : `${fittingSize}" ${fittingType}`;
    dispatch({ type: 'SET', key: 'lineItems', value: [...state.lineItems, { id: uid(), section: 'Fittings', desc, qty: 0, unit: 'ea', unitCost: 0, total: 0 }] });
    setShowFittingPicker(false); setFittingSize(''); setFittingSize2(''); setFittingType('');
  }

  function addMiscItem() {
    dispatch({ type: 'SET', key: 'lineItems', value: [...state.lineItems, { id: uid(), section: 'Misc', desc: '', qty: 1, unit: 'ea', unitCost: 0, total: 0 }] });
  }

  return (
    <div>
      <Row style={{ justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <SLabel>Bid Materials</SLabel>
          <div style={{ fontSize: 12, color: colors.textDim }}>Auto-generated from circuits — copper, insulation, fittings allowance, hangers, consumables</div>
        </div>
        <Row style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={() => setShowFittingPicker(true)}>+ Add Fitting</Btn>
          <Btn variant="ghost" size="sm" onClick={addMiscItem}>+ Add Item</Btn>
          <Btn variant="green" size="sm" onClick={onGenerate}>⚙️ Generate from Circuits</Btn>
        </Row>
      </Row>

      {/* Fitting picker modal */}
      {showFittingPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowFittingPicker(false)}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 20, width: '100%', maxWidth: 400 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <SLabel>Add Fitting</SLabel>
              <button onClick={() => setShowFittingPicker(false)} style={{ background: 'transparent', border: 'none', color: colors.textDim, fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 8 }}>Pipe Size</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {PIPE_SIZES.map(s => (
                  <button key={s} onClick={() => setFittingSize(s)}
                    style={{ padding: '8px 4px', borderRadius: 7, border: `1px solid ${fittingSize === s ? colors.green : colors.border}`, background: fittingSize === s ? colors.green : colors.surface, color: fittingSize === s ? '#000' : colors.textDim, fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: 'pointer' }}>
                    {s}"
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 8 }}>Fitting Type</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                {FITTING_TYPES.map(t => (
                  <button key={t} onClick={() => setFittingType(t)}
                    style={{ padding: '8px 4px', borderRadius: 7, border: `1px solid ${fittingType === t ? colors.green : colors.border}`, background: fittingType === t ? colors.greenFaint : colors.surface, color: fittingType === t ? colors.green : colors.textDim, fontSize: 11, cursor: 'pointer' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {fittingType.match(/Bushing|Reducer|Street/i) && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 8 }}>Second Size</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                  {PIPE_SIZES.map(s => (
                    <button key={s} onClick={() => setFittingSize2(s)}
                      style={{ padding: '8px 4px', borderRadius: 7, border: `1px solid ${fittingSize2 === s ? colors.green : colors.border}`, background: fittingSize2 === s ? colors.green : colors.surface, color: fittingSize2 === s ? '#000' : colors.textDim, fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: 'pointer' }}>
                      {s}"
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Btn variant="green" onClick={addFitting} style={{ width: '100%', justifyContent: 'center' }}>+ Add to Materials</Btn>
          </div>
        </div>
      )}

      {state.lineItems.length === 0 ? (
        <Card><EmptyState icon="🔧" title="No materials yet" subtitle="Click Generate from Circuits to auto-build the materials list" /></Card>
      ) : (
        sections.map(section => (
          <div key={section} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', background: colors.surface, borderRadius: '8px 8px 0 0', border: `1px solid ${colors.border}`, borderBottom: 'none' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.green, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{section}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: colors.text }}>{fmt(sectionTotals[section])}</span>
            </div>
            <div style={{ border: `1px solid ${colors.border}`, borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: colors.card2 }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: colors.textDim, textTransform: 'uppercase', borderBottom: `1px solid ${colors.border}` }}>Description</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 10, color: colors.textDim, textTransform: 'uppercase', borderBottom: `1px solid ${colors.border}`, width: 70 }}>Qty</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 10, color: colors.textDim, textTransform: 'uppercase', borderBottom: `1px solid ${colors.border}`, width: 50 }}>Unit</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 10, color: colors.textDim, textTransform: 'uppercase', borderBottom: `1px solid ${colors.border}`, width: 90 }}>Unit Cost</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 10, color: colors.textDim, textTransform: 'uppercase', borderBottom: `1px solid ${colors.border}`, width: 90 }}>Total</th>
                    <th style={{ width: 32, borderBottom: `1px solid ${colors.border}` }}></th>
                  </tr>
                </thead>
                <tbody>
                  {state.lineItems.filter(i => i.section === section).map((item, idx) => (
                    <tr key={item.id} style={{ background: idx % 2 === 0 ? 'transparent' : colors.surface + '30' }}>
                      <td style={{ padding: '7px 12px', borderBottom: `1px solid ${colors.border}` }}>
                        <TblInput value={item.desc} onChange={e => updateItem(item.id, 'desc', e.target.value)} />
                      </td>
                      <td style={{ padding: '7px 12px', borderBottom: `1px solid ${colors.border}`, textAlign: 'center' }}>
                        <TblInput type="number" value={item.qty} onChange={e => updateItem(item.id, 'qty', e.target.value)} style={{ width: 55, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
                      </td>
                      <td style={{ padding: '7px 12px', borderBottom: `1px solid ${colors.border}`, textAlign: 'center', color: colors.textDim }}>{item.unit}</td>
                      <td style={{ padding: '7px 12px', borderBottom: `1px solid ${colors.border}`, textAlign: 'right' }}>
                        <TblInput type="number" value={item.unitCost || 0} onChange={e => updateItem(item.id, 'unitCost', e.target.value)} style={{ width: 75, textAlign: 'right', fontFamily: "'DM Mono', monospace" }} />
                      </td>
                      <td style={{ padding: '7px 12px', borderBottom: `1px solid ${colors.border}`, textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 700, color: colors.green }}>{fmtDec(item.total)}</td>
                      <td style={{ padding: '7px 8px', borderBottom: `1px solid ${colors.border}`, textAlign: 'center' }}>
                        <button onClick={() => removeItem(item.id)} style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 4, width: 20, height: 20, cursor: 'pointer', fontSize: 11 }}>×</button>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 0' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 4 }}>Materials Subtotal</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color: colors.green }}>{fmt(grandTotal)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SUPPLY HOUSE TAB ──────────────────────────────────────────────────────────
function SupplyHouseList() {
  const { state, dispatch } = useStore();
  const [searchQuery, setSearchQuery] = useState('');

  function addItem(prefill = {}) {
    dispatch({ type: 'ADD_SUPPLY_ITEM', item: { id: uid(), partId: '', desc: '', qty: 0, unit: 'ea', unitCost: 0, total: 0, category: 'Misc', ...prefill } });
  }

  function updateItem(id, field, value) {
    const items = state.supplyItems.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: field === 'qty' || field === 'unitCost' ? parseFloat(value) || 0 : value };
      if (field === 'qty' || field === 'unitCost') updated.total = (updated.qty || 0) * (updated.unitCost || 0);
      return updated;
    });
    dispatch({ type: 'SET', key: 'supplyItems', value: items });
  }

  function autoFill() {
    const items = [];
    // Copper from circuits
    const copperBySize = {};
    const wasteFactor = 1 + ((state.rates?.wasteFactor || 10) / 100);
    state.circuits.forEach(c => {
      const run = (parseFloat(c.runLength) || 0) + (parseFloat(c.riserLength) || 0);
      [c.sucHoriz, c.sucRiser, c.liqHoriz].forEach(size => {
        if (!size || run <= 0) return;
        const key = normalizePipeSize(size);
        copperBySize[key] = (copperBySize[key] || 0) + run;
      });
    });
    Object.entries(copperBySize).forEach(([size, footage]) => {
      items.push({ id: uid(), partId: '', desc: `${size}" ACR Copper Lineset`, qty: Math.ceil(footage * wasteFactor), unit: 'ft', unitCost: 0, total: 0, category: 'Copper' });
    });

    // Insulation from circuits
    let medSucFt = 0, lowSucFt = 0, lowLiqFt = 0;
    state.circuits.forEach(c => {
      const run = (parseFloat(c.runLength) || 0) + (parseFloat(c.riserLength) || 0);
      if (c.tempType === 'low') { lowSucFt += run; lowLiqFt += run; }
      else medSucFt += run;
    });
    if (medSucFt > 0) items.push({ id: uid(), partId: '', desc: 'Rubber Insulation 3/4" wall — Med Temp Suction', qty: Math.ceil(medSucFt * wasteFactor), unit: 'ft', unitCost: 0, total: 0, category: 'Insulation' });
    if (lowSucFt > 0) items.push({ id: uid(), partId: '', desc: 'Rubber Insulation 1" wall — Low Temp Suction', qty: Math.ceil(lowSucFt * wasteFactor), unit: 'ft', unitCost: 0, total: 0, category: 'Insulation' });
    if (lowLiqFt > 0) items.push({ id: uid(), partId: '', desc: 'Rubber Insulation 1/2" wall — Low Temp Liquid', qty: Math.ceil(lowLiqFt * wasteFactor), unit: 'ft', unitCost: 0, total: 0, category: 'Insulation' });

    // Rack parts (contractor supplied)
    state.rackParts.filter(p => !p.storeSupplied).forEach(p => {
      items.push({ id: uid(), partId: p.partId, desc: p.desc, qty: p.qty, unit: p.unit, unitCost: p.unitCost, total: p.total, category: 'Rack Parts' });
    });

    // Default consumables
    items.push({ id: uid(), partId: '', desc: 'Nitrogen — pressure test & purge', qty: 0, unit: 'cylinder', unitCost: 0, total: 0, category: 'Consumables' });
    items.push({ id: uid(), partId: '', desc: 'Brazing rod (15% silver)', qty: 0, unit: 'lb', unitCost: 0, total: 0, category: 'Consumables' });

    // Merge with existing (don't duplicate)
    const existingDescs = new Set(state.supplyItems.map(i => i.desc));
    const newItems = items.filter(i => !existingDescs.has(i.desc));
    dispatch({ type: 'SET', key: 'supplyItems', value: [...state.supplyItems, ...newItems] });
  }

  function exportCSV() {
    if (!state.supplyItems.length) return;
    let csv = 'Category,Part Number,Description,Qty,Unit,Unit Cost,Total\n';
    state.supplyItems.forEach(i => {
      csv += `"${i.category}","${i.partId}","${i.desc}",${i.qty},"${i.unit}","${i.unitCost || ''}","${i.total || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.projName || 'project') + '_supply_house.csv';
    a.click();
  }

  const categories = [...new Set(state.supplyItems.map(i => i.category))];
  const total = state.supplyItems.reduce((s, i) => s + (i.total || 0), 0);
  const supplierName = state.preferredSupplier || 'RE Michel';

  return (
    <div>
      <Row style={{ justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <SLabel>Supply House List</SLabel>
          <div style={{ fontSize: 12, color: colors.textDim }}>Auto-filled from circuits and rack parts — add fittings and extras manually</div>
        </div>
        <Row style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={() => addItem()}>+ Add Item</Btn>
          <Btn variant="surface" size="sm" onClick={autoFill}>⚡ Auto-Fill from Circuits</Btn>
          <Btn variant="blue" size="sm" onClick={exportCSV}>📥 Export to {supplierName}</Btn>
        </Row>
      </Row>

      {/* Supplier search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.blue, flexShrink: 0 }}>🔍</span>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchSupplier(searchQuery, supplierName)}
          placeholder={`Search ${supplierName}...`}
          style={{ flex: 1, background: 'transparent', border: 'none', color: colors.text, fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
        />
        <Btn variant="blue" size="sm" onClick={() => searchSupplier(searchQuery, supplierName)}>Search</Btn>
      </div>

      {state.supplyItems.length === 0 ? (
        <Card><EmptyState icon="📋" title="Supply house list is empty" subtitle="Click Auto-Fill to populate from your circuits and rack parts, then add fittings manually" /></Card>
      ) : (
        categories.map(cat => (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.green, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '6px 0', borderBottom: `1px solid ${colors.border}`, marginBottom: 8 }}>{cat}</div>
            {state.supplyItems.filter(i => i.category === cat).map((item, idx) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px solid ${colors.border + '60'}` }}>
                <TblInput value={item.partId} onChange={e => updateItem(item.id, 'partId', e.target.value)} placeholder="Part #" style={{ width: 80, fontFamily: "'DM Mono', monospace", flexShrink: 0 }} />
                <TblInput value={item.desc} onChange={e => updateItem(item.id, 'desc', e.target.value)} placeholder="Description" style={{ flex: 1 }} />
                <TblInput type="number" value={item.qty} onChange={e => updateItem(item.id, 'qty', e.target.value)} placeholder="Qty" style={{ width: 50, textAlign: 'center', fontFamily: "'DM Mono', monospace", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: colors.textDim, flexShrink: 0 }}>{item.unit}</span>
                <TblInput type="number" value={item.unitCost || ''} onChange={e => updateItem(item.id, 'unitCost', e.target.value)} placeholder="$0.00" style={{ width: 70, textAlign: 'right', fontFamily: "'DM Mono', monospace", flexShrink: 0 }} />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: colors.green, minWidth: 70, textAlign: 'right', flexShrink: 0 }}>{item.total > 0 ? fmt(item.total) : '—'}</span>
                <button onClick={() => searchSupplier(item.partId || item.desc, supplierName)} style={{ background: colors.blue, border: 'none', color: '#fff', borderRadius: 5, padding: '3px 8px', fontSize: 10, cursor: 'pointer', flexShrink: 0 }}>🔍</button>
                <button onClick={() => dispatch({ type: 'REMOVE_SUPPLY_ITEM', id: item.id })} style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>×</button>
              </div>
            ))}
          </div>
        ))
      )}

      {total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: `2px solid ${colors.green}` }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Supply House Total (quoted)</span>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: colors.green }}>{fmt(total)}</span>
        </div>
      )}
    </div>
  );
}

// ── MAIN STEP 4 ───────────────────────────────────────────────────────────────
export default function Step4_Materials({ onNext, onBack }) {
  const { state, dispatch } = useStore();
  const [activeTab, setActiveTab] = useState('bid');
  const [rateInputs, setRateInputs] = useState(state.rates || {});

  function getRateForSize(size) {
    const key = normalizePipeSize(size);
    return state.rates?.cu?.[key] || 0;
  }

  function updateCopperRate(size, value) {
    const newRates = { ...state.rates, cu: { ...(state.rates?.cu || {}), [normalizePipeSize(size)]: parseFloat(value) || 0 } };
    dispatch({ type: 'SET', key: 'rates', value: newRates });
    syncCopperRates(newRates);
  }

  function syncCopperRates(rates) {
    const wasteFactor = 1 + ((rates?.wasteFactor || 10) / 100);
    const items = state.lineItems.map(item => {
      if (item.section !== 'Copper') return item;
      const rate = rates?.cu?.[normalizePipeSize(item.pipeSize)] || 0;
      const qty = Math.ceil((item.baseQty || item.qty) * wasteFactor);
      return { ...item, unitCost: rate, qty, total: qty * rate };
    });
    // Update fittings allowance
    const copperTotal = items.filter(i => i.section === 'Copper').reduce((s, i) => s + (i.total || 0), 0);
    const fittingsPct = rates?.fittingsMarkupPct || 25;
    const updatedItems = items.map(i => i.isFittingsAllowance ? { ...i, desc: `Fittings Allowance (${fittingsPct}% of copper)`, unitCost: Math.round(copperTotal * fittingsPct / 100), total: Math.round(copperTotal * fittingsPct / 100) } : i);
    dispatch({ type: 'SET', key: 'lineItems', value: updatedItems });
  }

  function generateMaterials() {
    const items = [];
    const rates = state.rates || {};
    const wasteFactor = 1 + ((rates.wasteFactor || 10) / 100);

    // Copper
    const copperBySize = {};
    state.circuits.forEach(c => {
      const run = parseFloat(c.runLength) || 0;
      const riser = parseFloat(c.riserLength) || 0;
      const total = c.isRiserOnly ? riser : run + riser;
      if (c.isRiserOnly) {
        if (c.sucRiser) { const k = normalizePipeSize(c.sucRiser); copperBySize[k] = (copperBySize[k] || 0) + riser; }
      } else {
        if (c.sucHoriz && run > 0) { const k = normalizePipeSize(c.sucHoriz); copperBySize[k] = (copperBySize[k] || 0) + run; }
        if (c.sucRiser && riser > 0) { const k = normalizePipeSize(c.sucRiser); copperBySize[k] = (copperBySize[k] || 0) + riser; }
        if (c.liqHoriz && total > 0) { const k = normalizePipeSize(c.liqHoriz); copperBySize[k] = (copperBySize[k] || 0) + total; }
      }
    });

    Object.entries(copperBySize).forEach(([size, footage]) => {
      const rate = rates?.cu?.[size] || 0;
      const qty = Math.ceil(footage * wasteFactor);
      items.push({ id: uid(), section: 'Copper', desc: `${size}" ACR Copper`, qty, unit: 'ft', unitCost: rate, total: qty * rate, pipeSize: size, baseQty: footage });
    });

    // Fittings allowance
    const copperTotal = items.reduce((s, i) => s + (i.total || 0), 0);
    const fittingsPct = rates.fittingsMarkupPct || 25;
    const fittingsAmt = Math.round(copperTotal * fittingsPct / 100);
    items.push({ id: uid(), section: 'Fittings', desc: `Fittings Allowance (${fittingsPct}% of copper)`, qty: 1, unit: 'lot', unitCost: fittingsAmt, total: fittingsAmt, isFittingsAllowance: true });

    // Insulation
    let medSucFt = 0, lowSucFt = 0, lowLiqFt = 0;
    state.circuits.forEach(c => {
      if (c.isRiserOnly) return;
      const runFt = (parseFloat(c.runLength) || 0) + (parseFloat(c.riserLength) || 0);
      if (c.tempType === 'low') { lowSucFt += runFt; lowLiqFt += runFt; }
      else medSucFt += runFt;
    });
    if (medSucFt > 0) { const r = rates?.insul?.medSuction || 0; const q = Math.ceil(medSucFt * wasteFactor); items.push({ id: uid(), section: 'Insulation', desc: 'Suction Insulation — Med Temp (3/4" wall)', qty: q, unit: 'ft', unitCost: r, total: q * r, tempType: 'medium', lineType: 'suction', baseQty: medSucFt }); }
    if (lowSucFt > 0) { const r = rates?.insul?.lowSuction || 0; const q = Math.ceil(lowSucFt * wasteFactor); items.push({ id: uid(), section: 'Insulation', desc: 'Suction Insulation — Low Temp (1" wall)', qty: q, unit: 'ft', unitCost: r, total: q * r, tempType: 'low', lineType: 'suction', baseQty: lowSucFt }); }
    if (lowLiqFt > 0) { const r = rates?.insul?.lowLiquid || 0; const q = Math.ceil(lowLiqFt * wasteFactor); items.push({ id: uid(), section: 'Insulation', desc: 'Liquid Insulation — Low Temp (1/2" wall)', qty: q, unit: 'ft', unitCost: r, total: q * r, tempType: 'low', lineType: 'liquid', baseQty: lowLiqFt }); }

    // Hangers
    const longestRun = Math.max(...state.circuits.filter(c => !c.isRiserOnly).map(c => parseFloat(c.runLength) || 0), 0);
    if (longestRun > 0) {
      const hangerQty = Math.ceil(longestRun / 6);
      items.push({ id: uid(), section: 'Hardware', desc: 'Pipe Hangers @ 6ft spacing', qty: hangerQty, unit: 'ea', unitCost: 0, total: 0, isHangerItem: true });
    }

    // Consumables
    items.push({ id: uid(), section: 'Consumables', desc: 'Nitrogen — Pressure Testing & Purge', qty: 0, unit: 'cylinder', unitCost: 0, total: 0 });
    items.push({ id: uid(), section: 'Consumables', desc: 'Brazing Rod (15% silver)', qty: 0, unit: 'lb', unitCost: 0, total: 0 });
    items.push({ id: uid(), section: 'Consumables', desc: 'Foam & Insulation Adhesive', qty: 0, unit: 'can', unitCost: 0, total: 0 });

    dispatch({ type: 'SET', key: 'lineItems', value: items });
  }

  const PIPE_SIZE_LIST = ['1/4', '3/8', '1/2', '5/8', '7/8', '1-1/8', '1-3/8', '1-5/8', '2-1/8'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Rates panel */}
      <Card>
        <SLabel>Copper Rates ($/ft)</SLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
          {PIPE_SIZE_LIST.map(size => (
            <div key={size}>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>{size}"</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: colors.textDim, fontSize: 12 }}>$</span>
                <Input
                  type="number"
                  value={state.rates?.cu?.[size] || ''}
                  onChange={e => updateCopperRate(size, e.target.value)}
                  placeholder="0.00"
                  style={{ padding: '7px 8px', fontSize: 12, fontFamily: "'DM Mono', monospace" }}
                />
              </div>
            </div>
          ))}
        </div>

        <SLabel>Insulation ($/ft)</SLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          {[
            { key: 'medSuction', label: 'Med Temp Suction (3/4" wall)' },
            { key: 'lowSuction', label: 'Low Temp Suction (1" wall)' },
            { key: 'lowLiquid', label: 'Low Temp Liquid (1/2" wall)' },
          ].map(r => (
            <div key={r.key}>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>{r.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: colors.textDim, fontSize: 12 }}>$</span>
                <Input
                  type="number"
                  value={state.rates?.insul?.[r.key] || ''}
                  onChange={e => dispatch({ type: 'SET_INSUL_RATE', key: r.key, value: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  style={{ padding: '7px 8px', fontSize: 12, fontFamily: "'DM Mono', monospace" }}
                />
              </div>
            </div>
          ))}
        </div>

        <Row style={{ gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Fittings Allowance (%)</div>
            <Input
              type="number"
              value={state.rates?.fittingsMarkupPct || 25}
              onChange={e => dispatch({ type: 'SET_RATES_MISC', key: 'fittingsMarkupPct', value: parseFloat(e.target.value) || 25 })}
              style={{ fontFamily: "'DM Mono', monospace" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Waste Factor (%)</div>
            <Input
              type="number"
              value={state.rates?.wasteFactor || 10}
              onChange={e => dispatch({ type: 'SET_RATES_MISC', key: 'wasteFactor', value: parseFloat(e.target.value) || 10 })}
              style={{ fontFamily: "'DM Mono', monospace" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Materials Markup (%)</div>
            <Input
              type="number"
              value={state.markupPct || 20}
              onChange={e => dispatch({ type: 'SET', key: 'markupPct', value: parseFloat(e.target.value) || 20 })}
              style={{ fontFamily: "'DM Mono', monospace" }}
            />
          </div>
        </Row>
      </Card>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, background: colors.surface, padding: 4, borderRadius: 10, border: `1px solid ${colors.border}` }}>
        {[{ key: 'bid', label: '📋 Bid Materials' }, { key: 'supply', label: '🚚 Supply House List' }].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: activeTab === t.key ? colors.green : 'transparent',
              color: activeTab === t.key ? '#000' : colors.textDim,
              fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
            }}
          >{t.label}</button>
        ))}
      </div>

      {activeTab === 'bid' ? (
        <BidMaterials onGenerate={generateMaterials} />
      ) : (
        <SupplyHouseList />
      )}

      {/* Nav */}
      <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <Btn variant="ghost" onClick={onBack}>← Back</Btn>
        <Btn variant="green" onClick={onNext}>Next: Labor →</Btn>
      </Row>
    </div>
  );
}
