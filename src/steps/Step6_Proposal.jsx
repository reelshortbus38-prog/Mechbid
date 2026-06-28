import { useState } from 'react';
import { useStore, fmt, uid, calcTotalLabor, calcRackLaborTotal, calcFieldTasksTotal, primaryCrew, loadCompanyProfile, saveCompanyProfile } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Row, Input } from '../components/UI.jsx';
import JobInfo from '../components/JobInfo.jsx';

// ── COMPANY PROFILE (your letterhead) ────────────────────────────────────────
function CompanyProfileCard({ company, onChange }) {
  const [open, setOpen] = useState(!company.name);
  const set = (k, v) => { const next = { ...company, [k]: v }; onChange(next); saveCompanyProfile(next); };
  const FIELDS = [
    { k: 'name', label: 'Company Name', ph: 'Acme Refrigeration & HVAC' },
    { k: 'license', label: 'License #', ph: 'NC #12345' },
    { k: 'phone', label: 'Phone', ph: '(555) 123-4567' },
    { k: 'email', label: 'Email', ph: 'bids@acme.com' },
    { k: 'address', label: 'Address', ph: '123 Main St, City, ST' },
    { k: 'website', label: 'Website', ph: 'acmerefrig.com' },
  ];
  return (
    <Card>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
        <div>
          <SLabel style={{ margin: 0 }}>🏢 Your Company (appears on the proposal)</SLabel>
          {!open && <div style={{ fontSize: 12, color: colors.textDim, marginTop: 4 }}>{company.name ? company.name : 'Not set — tap to add your letterhead'}</div>}
        </div>
        <span style={{ color: colors.textDim, fontSize: 13 }}>{open ? '▲' : '▼ Edit'}</span>
      </div>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginTop: 12 }}>
          {FIELDS.map(f => (
            <div key={f.k}>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>{f.label}</div>
              <Input value={company[f.k] || ''} onChange={e => set(f.k, e.target.value)} placeholder={f.ph} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── EQUIPMENT MARKUP & SUBCONTRACTORS ─────────────────────────────────────────
function MarkupAndSubs() {
  const { state, dispatch } = useStore();
  const hasEquipment = state.mode !== 'Commercial Refrigeration';
  const subs = state.subcontractors || [];

  const addSub = () => dispatch({ type: 'SET', key: 'subcontractors', value: [...subs, { id: uid(), desc: '', cost: 0 }] });
  const updateSub = (id, field, value) => dispatch({
    type: 'SET', key: 'subcontractors',
    value: subs.map(s => s.id === id ? { ...s, [field]: field === 'cost' ? parseFloat(value) || 0 : value } : s),
  });
  const removeSub = id => dispatch({ type: 'SET', key: 'subcontractors', value: subs.filter(s => s.id !== id) });

  const subsBase = subs.reduce((s, x) => s + (parseFloat(x.cost) || 0), 0);

  return (
    <Card>
      <SLabel>Equipment Markup & Subcontractors</SLabel>

      {hasEquipment && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 4px' }}>
          <span style={{ fontSize: 12, color: colors.textDim, flex: 1 }}>
            Equipment markup % <span style={{ color: colors.textDim, opacity: 0.7 }}>— blank = same as material markup</span>
          </span>
          <Input
            type="number"
            value={state.equipMarkupPct ?? ''}
            onChange={e => dispatch({ type: 'SET', key: 'equipMarkupPct', value: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0) })}
            placeholder="—"
            style={{ width: 70, fontFamily: "'DM Mono', monospace", textAlign: 'center' }}
          />
          <span style={{ fontSize: 11, color: colors.textDim }}>%</span>
        </div>
      )}

      <Row style={{ justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 8px', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Subcontractors</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Markup on subs</span>
          <Input
            type="number"
            value={state.subMarkupPct ?? 0}
            onChange={e => dispatch({ type: 'SET', key: 'subMarkupPct', value: parseFloat(e.target.value) || 0 })}
            style={{ width: 60, fontFamily: "'DM Mono', monospace", textAlign: 'center' }}
          />
          <span style={{ fontSize: 11, color: colors.textDim }}>%</span>
        </div>
      </Row>
      <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 10 }}>
        Electrical, crane/rigging, controls/BMS, insulation, demo, roofing/curbs — pass-through cost, optionally marked up. Not taxed as materials.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {subs.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input value={s.desc} onChange={e => updateSub(s.id, 'desc', e.target.value)} style={{ flex: 1 }} placeholder="Subcontractor / scope (e.g. Electrical hookup)" />
            <span style={{ color: colors.textDim, fontSize: 12 }}>$</span>
            <Input type="number" value={s.cost || ''} onChange={e => updateSub(s.id, 'cost', e.target.value)} placeholder="0" style={{ width: 90, fontFamily: "'DM Mono', monospace", textAlign: 'right' }} />
            <button onClick={() => removeSub(s.id)} style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 5, width: 24, height: 24, cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>×</button>
          </div>
        ))}
      </div>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <Btn variant="ghost" size="sm" onClick={addSub}>+ Add Subcontractor</Btn>
        {subsBase > 0 && (
          <span style={{ fontSize: 12, color: colors.textDim }}>
            Subs cost <span style={{ fontFamily: "'DM Mono', monospace", color: colors.text }}>{fmt(subsBase)}</span>
            {(parseFloat(state.subMarkupPct) || 0) > 0 ? ` → ${fmt(subsBase * (1 + (parseFloat(state.subMarkupPct) || 0) / 100))} w/ markup` : ''}
          </span>
        )}
      </Row>
    </Card>
  );
}

// ── TAX & EXCLUSIONS EDITOR ───────────────────────────────────────────────────
function TaxAndExclusions() {
  const { state, dispatch } = useStore();
  const exclusions = state.exclusions || [];

  const setExclusion = (i, val) => {
    const next = exclusions.slice();
    next[i] = val;
    dispatch({ type: 'SET', key: 'exclusions', value: next });
  };
  const addExclusion = () => dispatch({ type: 'SET', key: 'exclusions', value: [...exclusions, ''] });
  const removeExclusion = i => dispatch({ type: 'SET', key: 'exclusions', value: exclusions.filter((_, idx) => idx !== i) });

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <SLabel style={{ margin: 0 }}>Tax, Bond, Permits & Exclusions</SLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Materials Sales Tax</span>
          <Input
            type="number"
            value={state.materialsTaxPct ?? 0}
            onChange={e => dispatch({ type: 'SET', key: 'materialsTaxPct', value: parseFloat(e.target.value) || 0 })}
            style={{ width: 64, fontFamily: "'DM Mono', monospace", textAlign: 'center' }}
          />
          <span style={{ fontSize: 11, color: colors.textDim }}>%</span>
        </div>
      </Row>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Bond %</div>
          <Input type="number" value={state.bondPct ?? 0} onChange={e => dispatch({ type: 'SET', key: 'bondPct', value: parseFloat(e.target.value) || 0 })} style={{ fontFamily: "'DM Mono', monospace" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Permit / Fees ($)</div>
          <Input type="number" value={state.permitFee ?? 0} onChange={e => dispatch({ type: 'SET', key: 'permitFee', value: parseFloat(e.target.value) || 0 })} style={{ fontFamily: "'DM Mono', monospace" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Bid valid (days)</div>
          <Input type="number" value={state.bidValidDays ?? 30} onChange={e => dispatch({ type: 'SET', key: 'bidValidDays', value: parseFloat(e.target.value) || 0 })} style={{ fontFamily: "'DM Mono', monospace" }} />
        </div>
      </div>
      <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 10 }}>
        Exclusions print on the proposal — your scope fence. Edit, add, or remove lines.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {exclusions.map((x, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: colors.textDim, fontSize: 12, flexShrink: 0 }}>•</span>
            <Input value={x} onChange={e => setExclusion(i, e.target.value)} style={{ flex: 1 }} placeholder="Exclusion / qualification..." />
            <button onClick={() => removeExclusion(i)} style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 5, width: 24, height: 24, cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>×</button>
          </div>
        ))}
      </div>
      <Btn variant="ghost" size="sm" onClick={addExclusion} style={{ marginTop: 10 }}>+ Add Exclusion</Btn>
    </Card>
  );
}

// ── SCENARIO CARD ──────────────────────────────────────────────────────────────
function ScenarioCard({ scenarioKey, scenario, isActive, onSelect, onUpdateMarkup, total }) {
  return (
    <div
      onClick={onSelect}
      style={{
        flex: 1, borderRadius: 12, padding: '18px 16px', cursor: 'pointer', transition: 'all 0.2s',
        border: `2px solid ${isActive ? colors.green : colors.border}`,
        background: isActive ? colors.greenFaint : colors.card2,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: isActive ? colors.green : colors.textDim, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
        {scenario.label}
      </div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 800, color: isActive ? colors.green : colors.text, marginBottom: 6 }}>
        {fmt(total)}
      </div>
      <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 12 }}>{scenario.desc}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          value={scenario.markupPct}
          onChange={e => { e.stopPropagation(); onUpdateMarkup(parseFloat(e.target.value) || 0); }}
          onClick={e => e.stopPropagation()}
          style={{ width: 50, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 5, padding: '4px 6px', fontSize: 12, color: colors.text, fontFamily: "'DM Mono', monospace", outline: 'none', textAlign: 'center' }}
        />
        <span style={{ fontSize: 11, color: colors.textDim }}>% markup</span>
      </div>
      {isActive && (
        <div style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: colors.green }}>✅ SELECTED FOR PROPOSAL</div>
      )}
    </div>
  );
}

// ── HELPERS: compute totals per mode ──────────────────────────────────────────
function useBidTotals(state, markupPct) {
  const mode = state.mode;
  const laborTotal = calcTotalLabor(state.laborPeriods || []);
  const crew = primaryCrew(state.laborPeriods);
  const fieldTasksTotal = calcFieldTasksTotal(state.fieldTasks, crew);
  // Sales/use tax is charged on the marked-up materials+equipment sell price,
  // not on labor. Defaults to 0 so it only appears once a rate is set.
  const taxPct = parseFloat(state.materialsTaxPct) || 0;
  const taxOf = sell => sell * (taxPct / 100);
  // Equipment markup falls back to the (scenario) material markup when unset.
  const equipMarkupPct = (state.equipMarkupPct === '' || state.equipMarkupPct == null)
    ? markupPct : (parseFloat(state.equipMarkupPct) || 0);
  // Subcontractors: pass-through cost with an optional blanket markup. Not taxed
  // (services), not subject to material markup.
  const subsBase = (state.subcontractors || []).reduce((s, x) => s + (parseFloat(x.cost) || 0), 0);
  const subMarkupPct = parseFloat(state.subMarkupPct) || 0;
  const subsTotal = subsBase * (1 + subMarkupPct / 100);
  // Bond is a % of the bid (P&P bonds run ~1–3%); permit is a flat fee. Both
  // default to 0 and are added last, on top of the rest of the bid.
  const bondPct = parseFloat(state.bondPct) || 0;
  const permitFee = parseFloat(state.permitFee) || 0;
  const finish = (subtotal, rest) => {
    const bondAmt = subtotal * (bondPct / 100);
    return { ...rest, subsBase, subMarkupPct, subsTotal, taxPct, bondPct, bondAmt, permitFee, total: subtotal + bondAmt + permitFee };
  };

  if (mode === 'Residential HVAC') {
    const equipTotal = (state.resEquipment || []).reduce((s, e) => s + (e.cost || 0), 0);
    const partsTotal = (state.resParts || []).reduce((s, p) => s + (p.total || 0), 0);
    const linesetTotal = parseFloat(state.resLinesetTotal) || 0;
    const markupBase = equipTotal + partsTotal + linesetTotal;
    // Equipment at its own rate; parts + lineset at the material rate.
    const markupAmt = equipTotal * (equipMarkupPct / 100) + (partsTotal + linesetTotal) * (markupPct / 100);
    const taxAmt = taxOf(markupBase + markupAmt);
    const subtotal = markupBase + markupAmt + taxAmt + subsTotal + laborTotal;
    return finish(subtotal, { markupBase, markupAmt, equipMarkupPct, taxAmt, laborTotal, fieldTasksTotal: 0, equipTotal, partsTotal, linesetTotal });
  }

  if (mode === 'Commercial HVAC') {
    const equipTotal = (state.hvacEquipment || []).reduce((s, e) => s + (e.cost || 0), 0);
    const partsTotal = (state.hvacParts || []).reduce((s, p) => s + (p.total || 0), 0);
    const markupBase = equipTotal + partsTotal;
    const markupAmt = equipTotal * (equipMarkupPct / 100) + partsTotal * (markupPct / 100);
    const taxAmt = taxOf(markupBase + markupAmt);
    const subtotal = markupBase + markupAmt + taxAmt + subsTotal + laborTotal + fieldTasksTotal;
    return finish(subtotal, { markupBase, markupAmt, equipMarkupPct, taxAmt, laborTotal, fieldTasksTotal, equipTotal, partsTotal });
  }

  // Commercial Refrigeration (no separate equipment line — all material markup)
  const matsTotal = (state.lineItems || []).reduce((s, i) => s + (i.total || 0), 0);
  const rackPartsContractor = (state.rackParts || []).filter(p => !p.storeSupplied).reduce((s, p) => s + (p.total || 0), 0);
  // Rack labor is computed from the rack tasks + primary crew (the field is not
  // persisted on the task, so it must be recomputed here — see calcRackLaborTotal).
  const rackLaborTotal = calcRackLaborTotal(state.rackTasks, crew);
  const markupBase = matsTotal + rackPartsContractor;
  const markupAmt = markupBase * (markupPct / 100);
  const taxAmt = taxOf(markupBase + markupAmt);
  const subtotal = markupBase + markupAmt + taxAmt + subsTotal + laborTotal + rackLaborTotal + fieldTasksTotal;
  return finish(subtotal, { markupBase, markupAmt, equipMarkupPct: markupPct, taxAmt, laborTotal, rackLaborTotal, fieldTasksTotal, matsTotal, rackPartsContractor });
}

// ── PROPOSAL VIEW (printable preview) ─────────────────────────────────────────
function ProposalView({ company = {} }) {
  const { state } = useStore();
  const mode = state.mode;
  const scenario = state.scenarios[state.scenarios.active];
  const totals = useBidTotals(state, scenario.markupPct);
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  function printProposal() {
    let scopeRows = '';

    if (mode === 'Residential HVAC') {
      const equip = state.resEquipment || [];
      if (equip.length > 0) {
        scopeRows += `<h2>Equipment</h2><table><thead><tr><th>Type</th><th>Brand/Model</th><th>Tonnage</th><th>Cost</th></tr></thead><tbody>`;
        equip.forEach(e => { scopeRows += `<tr><td>${e.type}</td><td>${[e.brand, e.model].filter(Boolean).join(' ') || '—'}</td><td>${e.tons || '—'}</td><td>${fmt(e.cost)}</td></tr>`; });
        scopeRows += `</tbody></table>`;
      }
    } else if (mode === 'Commercial HVAC') {
      const equip = state.hvacEquipment || [];
      if (equip.length > 0) {
        scopeRows += `<h2>Equipment Schedule</h2><table><thead><tr><th>Tag</th><th>Type</th><th>Brand/Model</th><th>Capacity</th><th>Task</th><th>Cost</th></tr></thead><tbody>`;
        equip.forEach(e => { scopeRows += `<tr><td>${e.tag || '—'}</td><td>${e.type}</td><td>${[e.brand, e.model].filter(Boolean).join(' ') || '—'}</td><td>${e.tons || '—'}</td><td>${e.task || '—'}</td><td>${fmt(e.cost)}</td></tr>`; });
        scopeRows += `</tbody></table>`;
      }
    } else {
      // Commercial Refrigeration
      const circuits = state.circuits || [];
      if (circuits.length > 0) {
        scopeRows += `<h2>Circuits — New Work</h2><table><thead><tr><th>Circuit</th><th>Application</th><th>Run</th><th>Suction</th><th>Liquid</th></tr></thead><tbody>`;
        circuits.forEach(c => { scopeRows += `<tr><td>${c.circuitId}</td><td>${c.application || ''}</td><td>${c.isRiserOnly ? 'Riser only' : c.runLength + 'ft'}</td><td>${c.sucHoriz || '—'}</td><td>${c.liqHoriz || '—'}</td></tr>`; });
        scopeRows += `</tbody></table>`;
      }
      const sections = [...new Set((state.lineItems || []).map(i => i.section))];
      if (sections.length > 0) {
        scopeRows += `<h2>Materials</h2><table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>`;
        sections.forEach(s => {
          const items = state.lineItems.filter(i => i.section === s);
          const sTotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
          scopeRows += `<tr style="background:#f3f4f6"><td colspan="4" style="padding:6px 10px;font-weight:700;color:#1f4e79;font-size:11px;text-transform:uppercase">${s} — ${fmt(sTotal)}</td></tr>`;
          items.forEach(i => { scopeRows += `<tr><td>${i.desc}</td><td style="text-align:center">${i.qty}</td><td>${i.unit}</td><td style="text-align:right">${fmt(i.total)}</td></tr>`; });
        });
        scopeRows += `</tbody></table>`;
      }
    }

    const { markupBase, markupAmt, equipMarkupPct = scenario.markupPct, taxPct = 0, taxAmt = 0, subsTotal = 0, bondPct = 0, bondAmt = 0, permitFee = 0, laborTotal, rackLaborTotal = 0, fieldTasksTotal = 0, total } = totals;
    const exclusions = (state.exclusions || []).filter(x => x && x.trim());
    const validDays = state.bidValidDays ?? 30;
    const markupLabel = equipMarkupPct !== scenario.markupPct
      ? `marked up: materials ${scenario.markupPct}% · equipment ${equipMarkupPct}%`
      : `marked up ${scenario.markupPct}%`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bid — ${state.projName}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:0;padding:28px}
    .logo{font-size:22px;font-weight:900;letter-spacing:-0.02em}.logo span{color:#22c55e}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#1f4e79;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
    td{padding:5px 10px;border-bottom:1px solid #e5e7eb}tr:nth-child(even) td{background:#f9fafb}
    .total{font-size:20px;font-weight:800;color:#22c55e}
    .header{display:flex;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #22c55e}
    h2{font-size:13px;color:#1f4e79;margin:16px 0 8px}
    @media print{body{padding:16px}}</style></head><body>
    <div class="header">
      <div>
        ${company.name
          ? `<div class="logo" style="color:#111">${company.name}</div>
             <div style="font-size:10px;color:#6b7280">${[company.license, company.phone, company.email, company.address, company.website].filter(Boolean).join(' · ')}</div>`
          : `<div class="logo">MECH<span>BID</span></div>`}
        <div style="font-size:10px;color:#6b7280">${mode}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:16px;font-weight:700">${state.projName || 'Project'}</div>
        ${state.projAddr ? `<div style="color:#6b7280">${state.projAddr}</div>` : ''}
        ${state.projGC ? `<div style="color:#6b7280">GC: ${state.projGC}</div>` : ''}
        <div style="color:#6b7280;font-size:10px">${date}</div>
      </div>
    </div>
    ${scopeRows}
    <h2>Bid Summary</h2>
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #e5e7eb"><span>Materials & Equipment (${markupLabel})</span><span>${fmt(markupBase + markupAmt)}</span></div>
    ${taxAmt > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #e5e7eb"><span>Sales Tax (${taxPct}%)</span><span>${fmt(taxAmt)}</span></div>` : ''}
    ${subsTotal > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #e5e7eb"><span>Subcontractors</span><span>${fmt(subsTotal)}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #e5e7eb"><span>Labor</span><span>${fmt(laborTotal)}</span></div>
    ${rackLaborTotal > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #e5e7eb"><span>Rack Work</span><span>${fmt(rackLaborTotal)}</span></div>` : ''}
    ${fieldTasksTotal > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #e5e7eb"><span>Field Work</span><span>${fmt(fieldTasksTotal)}</span></div>` : ''}
    ${bondAmt > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #e5e7eb"><span>P&amp;P Bond (${bondPct}%)</span><span>${fmt(bondAmt)}</span></div>` : ''}
    ${permitFee > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #e5e7eb"><span>Permits &amp; Fees</span><span>${fmt(permitFee)}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;padding:14px 0;border-top:3px solid #22c55e;margin-top:8px"><span style="font-size:18px;font-weight:700">TOTAL BID PRICE</span><span class="total">${fmt(total)}</span></div>
    ${mode === 'Residential HVAC' && (parseFloat(state.resRebate) || 0) > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:6px 0"><span>Less est. utility/mfr rebate</span><span>-${fmt(parseFloat(state.resRebate) || 0)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:700"><span>Estimated net cost to you</span><span>${fmt(total - (parseFloat(state.resRebate) || 0))}</span></div>` : ''}
    ${validDays > 0 ? `<div style="margin-top:8px;font-size:11px;color:#6b7280">This proposal is valid for ${validDays} days from ${date}. Pricing subject to material market changes.</div>` : ''}
    ${exclusions.length ? `<h2>Exclusions & Qualifications</h2><ul style="margin:0 0 16px;padding-left:18px;color:#374151;font-size:11px;line-height:1.7">${exclusions.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
    <div style="margin-top:32px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px">Generated by MechBid · ${date} · Prices subject to change</div>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  }

  const { markupBase, markupAmt, equipMarkupPct = scenario.markupPct, taxPct = 0, taxAmt = 0, subsTotal = 0, bondPct = 0, bondAmt = 0, permitFee = 0, laborTotal, rackLaborTotal = 0, fieldTasksTotal = 0, total } = totals;
  const markedUpMats = markupBase + markupAmt;
  const exclusions = (state.exclusions || []).filter(x => x && x.trim());
  const markupLabel = equipMarkupPct !== scenario.markupPct
    ? `Markup (mat ${scenario.markupPct}% · equip ${equipMarkupPct}%)`
    : `Markup (${scenario.markupPct}%)`;

  return (
    <Card style={{ background: colors.surface }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 16, borderBottom: `2px solid ${colors.green}` }}>
        <div>
          {company.name ? (
            <>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em' }}>{company.name}</div>
              <div style={{ fontSize: 10, color: colors.textDim, maxWidth: 260 }}>
                {[company.license, company.phone, company.email, company.address, company.website].filter(Boolean).join(' · ')}
              </div>
            </>
          ) : (
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}>
              MECH<span style={{ color: colors.green }}>BID</span>
            </div>
          )}
          <div style={{ fontSize: 10, color: colors.textDim }}>{mode}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700 }}>{state.projName || 'Project Name'}</div>
          {state.projAddr && <div style={{ fontSize: 12, color: colors.textDim }}>{state.projAddr}</div>}
          {state.projGC && <div style={{ fontSize: 12, color: colors.textDim }}>GC: {state.projGC}</div>}
          <div style={{ fontSize: 11, color: colors.textDim }}>{date}</div>
        </div>
      </div>

      {/* Scope summary — mode-specific */}
      {mode === 'Commercial Refrigeration' && (state.circuits || []).length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.green, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Circuit Summary</div>
          {state.circuits.map(c => (
            <div key={c.id} style={{ fontSize: 11, color: colors.textDim, padding: '3px 0', borderBottom: `1px solid ${colors.border}40` }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: colors.text }}>{c.circuitId}</span>: {c.isRiserOnly ? `Riser only — ${c.sucRiser}` : `${c.runLength}ft — Suc: ${c.sucHoriz} / Liq: ${c.liqHoriz}`} — {c.application}
            </div>
          ))}
        </div>
      )}

      {mode === 'Commercial HVAC' && (state.hvacEquipment || []).length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.green, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Equipment Schedule</div>
          {state.hvacEquipment.map(e => (
            <div key={e.id} style={{ fontSize: 11, color: colors.textDim, padding: '3px 0', borderBottom: `1px solid ${colors.border}40` }}>
              {e.tag && <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: colors.text }}>[{e.tag}] </span>}
              {e.type}{e.tons ? ` — ${e.tons}` : ''}{e.brand ? ` · ${e.brand}` : ''}{e.task ? ` · ${e.task}` : ''} — <span style={{ color: colors.green }}>{fmt(e.cost)}</span>
            </div>
          ))}
        </div>
      )}

      {mode === 'Residential HVAC' && (state.resEquipment || []).length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.green, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Equipment</div>
          {state.resEquipment.map(e => (
            <div key={e.id} style={{ fontSize: 11, color: colors.textDim, padding: '3px 0', borderBottom: `1px solid ${colors.border}40` }}>
              {e.type}{e.tons ? ` — ${e.tons}` : ''}{e.brand ? ` · ${e.brand}` : ''}{e.model ? ` ${e.model}` : ''} — <span style={{ color: colors.green }}>{fmt(e.cost)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary lines */}
      <div style={{ marginBottom: 20 }}>
        {[
          { label: 'Materials & Equipment', value: fmt(markupBase), dim: true },
          { label: markupLabel, value: fmt(markupAmt), color: colors.green },
          { label: 'Materials Total (marked up)', value: fmt(markedUpMats), bold: true },
          taxAmt > 0 && { label: `Sales Tax (${taxPct}%)`, value: fmt(taxAmt), color: colors.text },
          subsTotal > 0 && { label: 'Subcontractors', value: fmt(subsTotal), color: colors.text },
          { label: 'Labor', value: fmt(laborTotal), color: colors.yellow },
          rackLaborTotal > 0 && { label: 'Rack Work', value: fmt(rackLaborTotal), color: colors.yellow },
          fieldTasksTotal > 0 && { label: 'Field Work', value: fmt(fieldTasksTotal), color: colors.yellow },
          bondAmt > 0 && { label: `P&P Bond (${bondPct}%)`, value: fmt(bondAmt), color: colors.text },
          permitFee > 0 && { label: 'Permits & Fees', value: fmt(permitFee), color: colors.text },
        ].filter(Boolean).map((line, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${colors.border}` }}>
            <span style={{ fontSize: 13, color: line.dim ? colors.textDim : colors.text }}>{line.label}</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: line.bold ? 700 : 400, color: line.color || colors.text }}>{line.value}</span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderTop: `3px solid ${colors.green}` }}>
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700 }}>TOTAL BID PRICE</span>
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, color: colors.green }}>{fmt(total)}</span>
      </div>

      {/* Residential rebate → net to customer */}
      {mode === 'Residential HVAC' && (parseFloat(state.resRebate) || 0) > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ fontSize: 13, color: colors.textDim }}>Less est. utility/mfr rebate</span>
            <span style={{ fontFamily: "'DM Mono', monospace", color: colors.textDim }}>-{fmt(parseFloat(state.resRebate) || 0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{ fontWeight: 700 }}>Estimated net cost to you</span>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, color: colors.blue }}>{fmt(total - (parseFloat(state.resRebate) || 0))}</span>
          </div>
        </div>
      )}

      {/* Exclusions & qualifications */}
      {exclusions.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.green, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Exclusions & Qualifications</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: colors.textDim, fontSize: 11, lineHeight: 1.7 }}>
            {exclusions.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </div>
      )}

      {/* Export */}
      <Row style={{ marginTop: 16, gap: 10 }}>
        <Btn variant="green" onClick={printProposal} style={{ flex: 1, justifyContent: 'center' }}>🖨️ Print / Export PDF</Btn>
        <Btn variant="ghost" onClick={() => {
          const csv = `${state.projName || 'Project'},${date}\nMode,${mode}\n` +
            `Total Bid,${fmt(total)}\nMaterials (marked up),${fmt(markedUpMats)}\nLabor,${fmt(laborTotal)}`;
          const blob = new Blob([csv], { type: 'text/csv' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
          a.download = (state.projName || 'bid') + '_summary.csv'; a.click();
        }} style={{ flex: 1, justifyContent: 'center' }}>📥 Export CSV</Btn>
      </Row>
    </Card>
  );
}

// ── MAIN STEP 6 ────────────────────────────────────────────────────────────────
export default function Step6_Proposal({ onBack }) {
  const { state, dispatch } = useStore();
  const activeScenario = state.scenarios[state.scenarios.active];
  const totals = useBidTotals(state, activeScenario.markupPct);
  const [company, setCompany] = useState(loadCompanyProfile());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <JobInfo />

      {/* Your company letterhead (global, saved across jobs) */}
      <CompanyProfileCard company={company} onChange={setCompany} />

      {/* Scenarios */}
      <div>
        <SLabel>Bid Scenarios</SLabel>
        <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 14 }}>Select a scenario to present — customer only sees the final number</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {['low', 'mid', 'high'].map(key => {
            const scenario = state.scenarios[key];
            const scenarioTotals = useBidTotals(state, scenario.markupPct);
            return (
              <ScenarioCard
                key={key}
                scenarioKey={key}
                scenario={scenario}
                isActive={state.scenarios.active === key}
                total={scenarioTotals.total}
                onSelect={() => dispatch({ type: 'SELECT_SCENARIO', key })}
                onUpdateMarkup={pct => dispatch({ type: 'SET_SCENARIO_MARKUP', key, value: pct })}
              />
            );
          })}
        </div>
      </div>

      {/* Internal breakdown */}
      <Card style={{ border: `1px solid ${colors.green}40`, background: colors.greenFaint }}>
        <SLabel>Internal Breakdown (not shown to customer)</SLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginTop: 10 }}>
          {[
            { label: 'Materials & Equipment', value: fmt(totals.markupBase), color: colors.text },
            { label: totals.equipMarkupPct !== activeScenario.markupPct ? `Markup (mat ${activeScenario.markupPct}% · equip ${totals.equipMarkupPct}%)` : `Markup (${activeScenario.markupPct}%)`, value: fmt(totals.markupAmt), color: colors.green },
            totals.taxAmt > 0 && { label: `Sales Tax (${totals.taxPct}%)`, value: fmt(totals.taxAmt), color: colors.text },
            totals.subsTotal > 0 && { label: 'Subcontractors', value: fmt(totals.subsTotal), color: colors.text },
            { label: 'Labor', value: fmt(totals.laborTotal), color: colors.yellow },
            totals.rackLaborTotal > 0 && { label: 'Rack Work Labor', value: fmt(totals.rackLaborTotal), color: colors.yellow },
            totals.fieldTasksTotal > 0 && { label: 'Field Work Labor', value: fmt(totals.fieldTasksTotal), color: colors.yellow },
            totals.bondAmt > 0 && { label: `P&P Bond (${totals.bondPct}%)`, value: fmt(totals.bondAmt), color: colors.text },
            totals.permitFee > 0 && { label: 'Permits & Fees', value: fmt(totals.permitFee), color: colors.text },
          ].filter(Boolean).map(s => (
            <div key={s.label} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderTop: `2px solid ${colors.green}`, marginTop: 10 }}>
          <span style={{ fontWeight: 700 }}>Total Bid Price</span>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: colors.green }}>{fmt(totals.total)}</span>
        </div>
      </Card>

      {/* Equipment markup & subcontractors */}
      <MarkupAndSubs />

      {/* Tax & exclusions editor */}
      <TaxAndExclusions />

      {/* Proposal preview */}
      <div>
        <SLabel>Bid Proposal Preview</SLabel>
        <ProposalView company={company} />
      </div>

      <Row style={{ justifyContent: 'flex-start', marginTop: 10 }}>
        <Btn variant="ghost" onClick={onBack}>← Back</Btn>
      </Row>
    </div>
  );
}
