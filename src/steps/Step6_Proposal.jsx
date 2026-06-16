import { useStore, fmt, calcTotalLabor, calcBidTotal } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Row, Divider } from '../components/UI.jsx';

function ScenarioCard({ scenarioKey, scenario, isActive, onSelect, onUpdateMarkup }) {
  const { state } = useStore();

  // Calculate total for this scenario's markup
  const matsTotal = state.lineItems.reduce((s, i) => s + (i.total || 0), 0);
  const rackPartsContractor = (state.rackParts || []).filter(p => !p.storeSupplied).reduce((s, p) => s + (p.total || 0), 0);
  const markupBase = matsTotal + rackPartsContractor;
  const markup = markupBase * (scenario.markupPct / 100);
  const laborTotal = calcTotalLabor(state.laborPeriods || []);
  const fieldWork = (state.fieldTasks || []).reduce((s, t) => s + (t.cost || 0), 0);
  const rackLabor = (state.rackTasks || []).reduce((s, t) => s + (t.laborCost || 0), 0);
  const total = markupBase + markup + laborTotal + fieldWork + rackLabor;

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

function ProposalView() {
  const { state } = useStore();

  const scenario = state.scenarios[state.scenarios.active];
  const matsTotal = state.lineItems.reduce((s, i) => s + (i.total || 0), 0);
  const rackPartsContractor = (state.rackParts || []).filter(p => !p.storeSupplied).reduce((s, p) => s + (p.total || 0), 0);
  const markupBase = matsTotal + rackPartsContractor;
  const markupAmt = markupBase * (scenario.markupPct / 100);
  const markedUpMats = markupBase + markupAmt;
  const laborTotal = calcTotalLabor(state.laborPeriods || []);
  const rackLaborTotal = state.rackTasks.reduce((s, t) => s + (t.laborCost || 0), 0);
  const total = markedUpMats + laborTotal + rackLaborTotal;

  const circuits = state.circuits;
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  function printProposal() {
    const sections = [...new Set(state.lineItems.map(i => i.section))];
    const matRows = sections.map(s => {
      const items = state.lineItems.filter(i => i.section === s);
      const sTotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
      return `<tr style="background:#f3f4f6"><td colspan="4" style="padding:6px 10px;font-weight:700;color:#1f4e79;font-size:11px;text-transform:uppercase">${s} — ${fmt(sTotal)}</td></tr>` +
        items.map(i => `<tr><td style="padding:5px 10px">${i.desc}</td><td style="padding:5px 10px;text-align:center">${i.qty}</td><td style="padding:5px 10px">${i.unit}</td><td style="padding:5px 10px;text-align:right">${fmt(i.total)}</td></tr>`).join('');
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bid — ${state.projName}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:0;padding:28px}
    .logo{font-size:22px;font-weight:900;letter-spacing:-0.02em}.logo span{color:#22c55e}
    table{width:100%;border-collapse:collapse}th{background:#1f4e79;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
    td{padding:5px 10px;border-bottom:1px solid #e5e7eb}tr:nth-child(even) td{background:#f9fafb}
    .total{font-size:20px;font-weight:800;color:#22c55e}.header{display:flex;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #22c55e}
    h2{font-size:13px;color:#1f4e79;margin:16px 0 8px}
    @media print{body{padding:16px}}</style></head><body>
    <div class="header">
      <div><div class="logo">MECH<span>BID</span></div><div style="font-size:10px;color:#6b7280">Refrigeration & HVAC Estimating</div></div>
      <div style="text-align:right">
        <div style="font-size:16px;font-weight:700">${state.projName || 'Project'}</div>
        ${state.projAddr ? `<div style="color:#6b7280">${state.projAddr}</div>` : ''}
        ${state.projGC ? `<div style="color:#6b7280">GC: ${state.projGC}</div>` : ''}
        <div style="color:#6b7280;font-size:10px">${date}</div>
      </div>
    </div>
    ${circuits.length > 0 ? `<h2>Circuits — New Work</h2>
    <table><thead><tr><th>Circuit</th><th>Application</th><th>Run</th><th>Suction</th><th>Liquid</th></tr></thead><tbody>
    ${circuits.map(c => `<tr><td>${c.circuitId}</td><td>${c.application||''}</td><td>${c.isRiserOnly?'Riser only':c.runLength+'ft'}</td><td>${c.sucHoriz||'—'}</td><td>${c.liqHoriz||'—'}</td></tr>`).join('')}
    </tbody></table>` : ''}
    <h2>Materials</h2>
    <table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${matRows}</tbody></table>
    <h2>Bid Summary</h2>
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #e5e7eb"><span>Materials & Equipment (marked up ${scenario.markupPct}%)</span><span>${fmt(markedUpMats)}</span></div>
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #e5e7eb"><span>Labor</span><span>${fmt(laborTotal)}</span></div>
    ${rackLaborTotal > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #e5e7eb"><span>Rack Work</span><span>${fmt(rackLaborTotal)}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;padding:14px 0;border-top:3px solid #22c55e;margin-top:8px"><span style="font-size:18px;font-weight:700">TOTAL BID PRICE</span><span class="total">${fmt(total)}</span></div>
    <div style="margin-top:32px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px">Generated by MechBid · ${date} · Prices subject to change</div>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  }

  return (
    <Card style={{ background: colors.surface }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 16, borderBottom: `2px solid ${colors.green}` }}>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}>
            MECH<span style={{ color: colors.green }}>BID</span>
          </div>
          <div style={{ fontSize: 10, color: colors.textDim }}>Commercial Refrigeration & HVAC Estimating</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700 }}>{state.projName || 'Project Name'}</div>
          {state.projAddr && <div style={{ fontSize: 12, color: colors.textDim }}>{state.projAddr}</div>}
          {state.projGC && <div style={{ fontSize: 12, color: colors.textDim }}>GC: {state.projGC}</div>}
          <div style={{ fontSize: 11, color: colors.textDim }}>{date}</div>
        </div>
      </div>

      {/* Circuits summary */}
      {circuits.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.green, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Circuit Summary — New Work</div>
          {circuits.map(c => (
            <div key={c.id} style={{ fontSize: 11, color: colors.textDim, padding: '3px 0', borderBottom: `1px solid ${colors.border}40` }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: colors.text }}>{c.circuitId}</span>: {c.isRiserOnly ? `Riser only — ${c.sucRiser}` : `${c.runLength}ft — Suc: ${c.sucHoriz} / Liq: ${c.liqHoriz}`} — {c.application}
            </div>
          ))}
        </div>
      )}

      {/* Summary lines */}
      <div style={{ marginBottom: 20 }}>
        {[
          { label: 'Materials & Equipment', value: fmt(markupBase), dim: true },
          { label: `Markup (${scenario.markupPct}%)`, value: fmt(markupAmt), color: colors.green },
          { label: 'Materials Total (marked up)', value: fmt(markedUpMats), bold: true },
          { label: 'Labor', value: fmt(laborTotal), color: colors.yellow },
          rackLaborTotal > 0 && { label: 'Rack Work', value: fmt(rackLaborTotal), color: colors.yellow },
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

      {/* Export */}
      <Row style={{ marginTop: 16, gap: 10 }}>
        <Btn variant="green" onClick={printProposal} style={{ flex: 1, justifyContent: 'center' }}>🖨️ Print / Export PDF</Btn>
        <Btn variant="ghost" onClick={() => {
          const csv = `${state.projName || 'Project'},${date}\n` +
            `Total Bid,${fmt(total)}\nMaterials (marked up),${fmt(markedUpMats)}\nLabor,${fmt(laborTotal)}`;
          const blob = new Blob([csv], { type: 'text/csv' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
          a.download = (state.projName || 'bid') + '_summary.csv'; a.click();
        }} style={{ flex: 1, justifyContent: 'center' }}>📥 Export CSV</Btn>
      </Row>
    </Card>
  );
}

export default function Step6_Proposal({ onBack }) {
  const { state, dispatch } = useStore();

  const matsTotal = state.lineItems.reduce((s, i) => s + (i.total || 0), 0);
  const laborTotal = calcTotalLabor(state.laborPeriods || []);
  const rackPartsContractor = (state.rackParts || []).filter(p => !p.storeSupplied).reduce((s, p) => s + (p.total || 0), 0);
  const activeScenario = state.scenarios[state.scenarios.active];
  const markupBase = matsTotal + rackPartsContractor;
  const total = markupBase * (1 + activeScenario.markupPct / 100) + laborTotal;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Scenarios */}
      <div>
        <SLabel>Bid Scenarios</SLabel>
        <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 14 }}>Select a scenario to present to the customer — they only see the final number</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {['low', 'mid', 'high'].map(key => (
            <ScenarioCard
              key={key}
              scenarioKey={key}
              scenario={state.scenarios[key]}
              isActive={state.scenarios.active === key}
              onSelect={() => dispatch({ type: 'SELECT_SCENARIO', key })}
              onUpdateMarkup={pct => dispatch({ type: 'SET_SCENARIO_MARKUP', key, value: pct })}
            />
          ))}
        </div>
      </div>

      {/* Internal breakdown */}
      <Card style={{ border: `1px solid ${colors.green}40`, background: colors.greenFaint }}>
        <SLabel>Internal Breakdown (not shown to customer)</SLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginTop: 10 }}>
          {[
            { label: 'Materials Cost', value: fmt(matsTotal), color: colors.text },
            { label: `Markup (${activeScenario.markupPct}%)`, value: fmt(markupBase * activeScenario.markupPct / 100), color: colors.green },
            { label: 'Rack Parts (Contractor)', value: fmt(rackPartsContractor), color: colors.text },
            { label: 'Labor', value: fmt(laborTotal), color: colors.yellow },
          ].map(s => (
            <div key={s.label} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderTop: `2px solid ${colors.green}`, marginTop: 10 }}>
          <span style={{ fontWeight: 700 }}>Total Bid Price</span>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: colors.green }}>{fmt(total)}</span>
        </div>
      </Card>

      {/* Proposal preview */}
      <div>
        <SLabel>Bid Proposal Preview</SLabel>
        <ProposalView />
      </div>

      {/* Nav */}
      <Row style={{ justifyContent: 'flex-start', marginTop: 10 }}>
        <Btn variant="ghost" onClick={onBack}>← Back</Btn>
      </Row>
    </div>
  );
}
