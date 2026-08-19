import { useState } from 'react';
import { useStore, uid, fmt } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Select, Row } from '../components/UI.jsx';
import { pipeMaterialPrice } from './pipePricing.js';
import {
  glycolMaterialLines, systemVolumeGal, glycolCharge, checkMix, pgFreezePoint,
} from './glycolSystem.js';
import { glycolHydraulics, glycolGpm } from './glycolHydraulics.js';
import { reviewGlycolInputs, reviewSummary } from './glycolAssumptions.js';
import {
  COMPONENT_TYPES, SERIES, BRANCH, componentType, newComponent, seedComponents,
  equipmentHead, naiveTotalFt, equipmentHeadSanity,
} from './equipmentHead.js';

// ── SECONDARY GLYCOL LOOP CALCULATOR ─────────────────────────────────────────
// A secondary system's materials do not come out of the circuit table the way a
// DX job's copper does — there is no suction or liquid line per case. What
// there IS: a header out to the floor and back, insulation on every foot of it,
// a valve set at each case, and several hundred gallons of fluid that no
// copper-and-fittings takeoff has anywhere to put.
//
// Fixture count seeds from the medium-temp circuits already entered, because on
// a secondary job that is exactly what a circuit is — one case or walk-in coil
// hanging off the loop.

const SIZES = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];
const label = d => (d === 0.5 ? '1/2"' : d === 0.75 ? '3/4"' : d === 1.25 ? '1-1/4"' : d === 1.5 ? '1-1/2"' : d === 2.5 ? '2-1/2"' : `${d}"`);

export default function GlycolCalc() {
  const { state, dispatch } = useStore();
  const items = state.lineItems || [];
  const circuits = state.circuits || [];
  const medTemp = circuits.filter(c => (c.tempType || 'medium') === 'medium').length;

  const [runs, setRuns] = useState([{ dia: 3, ft: 0 }, { dia: 2, ft: 0 }, { dia: 1, ft: 0 }, { dia: 0.75, ft: 0 }]);
  const [material, setMaterial] = useState('copper');
  // Driven by the Setup page's Secondary Loop choice rather than duplicated
  // here — two places to set the same thing is two places to set it wrong.
  const loopType = (state.secondaryLoop || 'none') === 'water' ? 'water' : 'chilled';
  const [freezeExposedFt, setFreezeExposedFt] = useState(0);
  const [pct, setPct] = useState(32);
  const [protectTo, setProtectTo] = useState(15);
  const [coilGal, setCoilGal] = useState(0);
  const [tankGal, setTankGal] = useState(0);
  const [fixtures, setFixtures] = useState(medTemp);
  const [fixtureSize, setFixtureSize] = useState(0.75);
  const [added, setAdded] = useState(false);
  // Hydraulics — what sizes the pump, and the check on whether the mains can
  // carry the flow the load needs.
  const [btuh, setBtuh] = useState(0);
  const [deltaT, setDeltaT] = useState(8);
  const [longestPathFt, setLongestPathFt] = useState(0);
  // Equipment head is itemised off the submittals and lives in the store rather
  // than in this card — it is looked-up paperwork data, and re-keying it because
  // a tab closed is the kind of thing that stops an estimator using a feature.
  const components = state.glycolComponents || [];
  const setComponents = v => { dispatch({ type: 'SET', key: 'glycolComponents', value: v }); setAdded(false); };

  const sized = runs.filter(r => Number(r.ft) > 0);
  const headerSize = sized.length ? Math.max(...sized.map(r => Number(r.dia))) : 2;
  const vol = systemVolumeGal(sized, { material, coilGal: Number(coilGal) || 0, tankGal: Number(tankGal) || 0 });
  const charge = glycolCharge(vol.totalGal, pct);
  const mix = checkMix(pct, protectTo);

  const lines = glycolMaterialLines({
    runs: sized, material, pct,
    coilGal: Number(coilGal) || 0, tankGal: Number(tankGal) || 0,
    fixtures: Number(fixtures) || 0, fixtureSize, headerSize,
    loopType, freezeExposedFt: Number(freezeExposedFt) || 0,
  }).map(l => {
    // Copper is priced by the shared table — the one scaled off the estimator's
    // own 3/4" quote — rather than a second number that could drift from it.
    if (l.priceFromCopperTable) {
      const hit = pipeMaterialPrice(l.priceFromCopperTable);
      return { ...l, defaultPrice: hit ? hit.pricePerFt : 0 };
    }
    return l;
  });
  const total = lines.reduce((s, l) => s + l.qty * (l.defaultPrice || 0), 0);

  // Inside diameter of the largest run, for the velocity check. Nominal size is
  // close enough to ID at these sizes for an estimating-grade check.
  const runFt = sized.reduce((a, r) => a + (Number(r.ft) || 0), 0);
  const mainId = sized.length ? Math.max(...sized.map(r => Number(r.dia))) : 0;

  // Flow first, on its own — a component's drop is corrected against the flow
  // actually going through it, so the head cannot be computed until the GPM is.
  const gpm = glycolGpm(Number(btuh) || 0, Number(deltaT) || 0, Number(pct) || 35) || 0;
  const eq = equipmentHead(components, { gpm, fixtures: Number(fixtures) || 0, pct: Number(pct) || 35 });
  const eqSanity = equipmentHeadSanity(components, eq, { fixtures: Number(fixtures) || 0, gpm });
  const naive = naiveTotalFt(eq, Number(fixtures) || 0);
  // Nothing itemised yet → the old flat placeholder, so the card still works on
  // a job where the submittals have not arrived.
  const componentHeadFt = components.length ? eq.totalFt : 25;

  const hyd = glycolHydraulics({
    btuh: Number(btuh) || 0, deltaT: Number(deltaT) || 0, pct: Number(pct) || 35,
    longestPathFt: Number(longestPathFt) || 0, idInches: mainId,
    componentHeadFt,
  });

  // What every number on this card is standing on. Placeholders and
  // submittal-only figures wear the same font as the computed ones, which is
  // exactly what makes them dangerous — so they get named.
  const review = reviewGlycolInputs({
    loopType, pct, protectTo, mix,
    coilGal: Number(coilGal) || 0, tankGal: Number(tankGal) || 0,
    fixtures: Number(fixtures) || 0,
    btuh: Number(btuh) || 0, deltaT: Number(deltaT) || 0,
    componentHeadFt,
    headFromSubmittal: eq.fromSubmittal, headTypical: eq.typical,
    longestPathFt: Number(longestPathFt) || 0, runFt,
    velocityVerdict: hyd.velocityVerdict,
  });
  const summary = reviewSummary(review);
  const TONE = { blocker: colors.red, verify: colors.yellow, fyi: colors.textDim, ok: colors.green };
  const SRC = { physics: 'PHYSICS', yours: 'YOUR QUOTE', placeholder: 'PLACEHOLDER', submittal: 'FROM SUBMITTALS' };

  const setRun = (i, field, v) => {
    setRuns(runs.map((r, j) => (j === i ? { ...r, [field]: field === 'dia' ? Number(v) : v } : r)));
    setAdded(false);
  };

  function addLines() {
    const newItems = lines.map(l => ({
      id: uid(), gen: 'glycol', section: l.section,
      desc: l.desc, qty: l.qty, unit: l.unit,
      unitCost: l.defaultPrice || 0, total: l.qty * (l.defaultPrice || 0),
      notes: [l.notes, 'default price is a PLACEHOLDER — correct it once and the price book remembers'].filter(Boolean).join(' · '),
    }));
    dispatch({ type: 'SET', key: 'lineItems', value: [...items.filter(p => p.gen !== 'glycol'), ...newItems] });
    setAdded(true);
  }

  const num = (v, set, w = 70) => (
    <Input type="number" value={v} onChange={e => { set(e.target.value); setAdded(false); }}
      style={{ width: w, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
  );

  return (
    <Card style={{ background: colors.surface }}>
      <SLabel>🧊 Secondary Loop — Glycol or Water</SLabel>
      <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.6, marginBottom: 12 }}>
        Set to <strong>{loopType === 'water' ? 'ambient water loop' : 'chilled glycol'}</strong> on the Setup step.
        A secondary loop has no suction or liquid line per case, so none of it comes out of the circuit table.
        What it does have: header out and back, <strong>insulation on every foot</strong>, a valve set at each case,
        and <strong>several hundred gallons of fluid</strong> that a copper takeoff has nowhere to put.
        <br />
        <strong style={{ color: colors.yellow }}>Prices here are placeholders</strong> except the copper, which uses
        the same table as the HVAC side. Correct one and the price book keeps it.
      </div>

      {/* ── Pipe runs ── */}
      <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Pipe runs — supply + return, as taken off</div>
      <div style={{ marginBottom: 12 }}>
        {runs.map((r, i) => (
          <Row key={i} style={{ gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <Select value={r.dia} onChange={e => setRun(i, 'dia', e.target.value)} style={{ width: 100 }}>
              {SIZES.map(d => <option key={d} value={d}>{label(d)}</option>)}
            </Select>
            <Input type="number" value={r.ft} onChange={e => setRun(i, 'ft', e.target.value)}
              placeholder="ft" style={{ width: 90, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
            <span style={{ fontSize: 11, color: colors.textDim }}>ft</span>
            {runs.length > 1 && (
              <button onClick={() => { setRuns(runs.filter((_, j) => j !== i)); setAdded(false); }}
                style={{ background: 'transparent', border: 'none', color: colors.red, cursor: 'pointer', fontSize: 14 }}>×</button>
            )}
          </Row>
        ))}
        <Btn variant="ghost" size="sm" onClick={() => { setRuns([...runs, { dia: 1, ft: 0 }]); setAdded(false); }}>+ Add size</Btn>
      </div>

      <Row style={{ gap: 14, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        {loopType === 'water' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: colors.textDim }}>Freeze-exposed</span>
            {num(freezeExposedFt, setFreezeExposedFt)}
            <span style={{ fontSize: 11, color: colors.textDim }}>ft</span>
          </div>
        )}
      </Row>

      {loopType === 'water' && (
        <div style={{ fontSize: 12, marginBottom: 10, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(59,130,246,0.06)', border: `1px solid ${colors.blue}40`, color: colors.textDim }}>
          A water loop runs at ambient and rejects heat — it does <strong>not</strong> get insulated, and the cases arrive
          with their refrigerant sealed inside, so you run no refrigerant piping at all. Glycol here is
          <strong> freeze protection for the outdoor run only</strong>, not the working fluid. The chiller barrel is
          replaced by a fluid cooler, which is quoted rather than estimated.
        </div>
      )}

      <Row style={{ gap: 14, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Material</span>
          <Select value={material} onChange={e => { setMaterial(e.target.value); setAdded(false); }} style={{ width: 150 }}>
            <option value="copper">Type L copper</option>
            <option value="pvc80">Schedule 80 PVC</option>
          </Select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Coils + barrel hold</span>{num(coilGal, setCoilGal)}
          <span style={{ fontSize: 11, color: colors.textDim }}>gal</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Tank</span>{num(tankGal, setTankGal)}
          <span style={{ fontSize: 11, color: colors.textDim }}>gal</span>
        </div>
      </Row>

      <Row style={{ gap: 14, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Glycol %</span>{num(pct, setPct, 60)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Protect to</span>{num(protectTo, setProtectTo, 60)}
          <span style={{ fontSize: 11, color: colors.textDim }}>°F</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: colors.textDim }}>Cases / walk-in coils</span>{num(fixtures, setFixtures)}
          <Select value={fixtureSize} onChange={e => { setFixtureSize(Number(e.target.value)); setAdded(false); }} style={{ width: 84 }}>
            {[0.5, 0.75, 1].map(d => <option key={d} value={d}>{label(d)}</option>)}
          </Select>
        </div>
      </Row>

      {medTemp > 0 && Number(fixtures) !== medTemp && (
        <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 8 }}>
          {medTemp} medium-temp circuit(s) entered —{' '}
          <button onClick={() => { setFixtures(medTemp); setAdded(false); }}
            style={{ background: 'transparent', border: 'none', color: colors.blue, cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline' }}>
            use that count
          </button>
        </div>
      )}

      {/* ── Mix check ── */}
      {mix && (
        <div style={{ fontSize: 12, marginBottom: 10, padding: '8px 12px', borderRadius: 8,
          background: mix.ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${(mix.ok ? colors.green : colors.red)}40`,
          color: mix.ok ? colors.textDim : colors.red }}>
          {pct}% propylene glycol freezes at <strong>{pgFreezePoint(pct)}°F</strong> —{' '}
          {mix.ok
            ? <>clears {protectTo}°F by {mix.margin}°F. Over-mixing costs twice: more glycol, and more pump horsepower for the same load.</>
            : <><strong>SHORT of {protectTo}°F by {Math.abs(mix.margin)}°F.</strong> Raise the concentration.</>}
          <br />
          <span style={{ fontSize: 11 }}>Burst protection is a lower, separate curve — read it off the drum rather than assuming it.</span>
        </div>
      )}

      {vol.totalGal > 0 && (
        <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 10, fontFamily: "'DM Mono', monospace" }}>
          System holds ~{vol.totalGal} gal ({vol.pipeGal} pipe · {vol.coilGal} coils · {vol.tankGal} tank) →{' '}
          <strong style={{ color: colors.green }}>{charge.concentrateGal} gal</strong> concentrate +{' '}
          <strong style={{ color: colors.green }}>{charge.waterGal} gal</strong> demineralized water
        </div>
      )}

      {lines.length > 0 && (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
          {lines.map((l, i) => (
            <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', fontSize: 12,
              borderBottom: i < lines.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{l.desc}</div>
                {l.notes && <div style={{ fontSize: 10, color: colors.textDim }}>{l.notes}</div>}
              </div>
              <div style={{ whiteSpace: 'nowrap', fontFamily: "'DM Mono', monospace" }}>
                {l.qty} {l.unit} × {fmt(l.defaultPrice || 0)} ={' '}
                <strong style={{ color: colors.green }}>{fmt(l.qty * (l.defaultPrice || 0))}</strong>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Flow & pump sizing ── */}
      <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 4, paddingTop: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 8 }}>
          FLOW &amp; PUMP SIZING — what the load needs, and whether the mains can carry it.
          This selects a pump to <strong>price</strong>; the engineer of record still sizes it.
        </div>
        <Row style={{ gap: 14, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: colors.textDim }}>Load</span>{num(btuh, setBtuh, 100)}
            <span style={{ fontSize: 11, color: colors.textDim }}>BTU/h</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: colors.textDim }}>ΔT</span>{num(deltaT, setDeltaT, 56)}
            <span style={{ fontSize: 11, color: colors.textDim }}>°F</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: colors.textDim }}>Longest path (out + back)</span>
            {num(longestPathFt, setLongestPathFt, 84)}
            <span style={{ fontSize: 11, color: colors.textDim }}>ft</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: colors.textDim }}>Equipment head</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600,
              color: components.length ? colors.green : colors.yellow }}>
              {componentHeadFt} ft
            </span>
            <span style={{ fontSize: 11, color: colors.textDim }}>
              {components.length ? `— ${eq.fromSubmittal}/${eq.lines.length} off submittals` : '— flat placeholder'}
            </span>
          </div>
        </Row>

        {/* ── Equipment head, itemised off the submittals ── */}
        <details open={components.length > 0} style={{ marginBottom: 12, border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: '8px 10px' }}>
          <summary style={{ cursor: 'pointer', fontSize: 11, color: colors.textDim, fontWeight: 600 }}>
            EQUIPMENT HEAD — the drops printed on the submittals
          </summary>

          <div style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.6, margin: '10px 0' }}>
            Head adds up along <strong>one path</strong>, the same critical circuit the pipe length uses.
            Things every gallon passes through — the barrel, the main strainer, the triple-duty valve — are
            <strong> series</strong> and they add. A case coil and its valve train are <strong>branch</strong>:
            thirty of them hang in parallel, so the pump only fights the <strong>worst one</strong>.
            Enter that one branch, not all of them.
            <br />
            <strong>Actual</strong> is left blank to derive — series sees the whole loop, branch an even split of it.
            Fill it in when the split is a lie: a big walk-in among small reach-ins draws far more than its share,
            which is exactly why it is the worst branch.
          </div>

          {components.map((c, i) => {
            const t = componentType(c.key);
            const line = eq.lines.find(l => l.id === c.id);
            const set = (field, v) => setComponents(components.map((x, j) => (j === i ? { ...x, [field]: v } : x)));
            return (
              <div key={c.id} style={{ padding: '8px 0', borderTop: i ? `1px solid ${colors.border}` : 'none' }}>
                <Row style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", flexShrink: 0,
                    color: t && t.position === BRANCH ? colors.yellow : colors.blue,
                    border: `1px solid ${(t && t.position === BRANCH ? colors.yellow : colors.blue)}55`,
                    borderRadius: 4, padding: '2px 5px' }}>
                    {t && t.position === BRANCH ? 'BRANCH' : 'SERIES'}
                  </span>
                  <Select value={c.key} onChange={e => {
                    const k = e.target.value;
                    const nt = componentType(k);
                    // A typical value follows the type; a figure already read off
                    // a submittal is the estimator's and is left alone.
                    setComponents(components.map((x, j) => (j === i
                      ? { ...x, key: k, label: nt ? nt.label : x.label, value: x.fromSubmittal ? x.value : (nt ? nt.typicalFt : 0) }
                      : x)));
                  }} style={{ width: 230, fontSize: 12 }}>
                    <optgroup label="Series — every gallon goes through it">
                      {COMPONENT_TYPES.filter(x => x.position === SERIES).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </optgroup>
                    <optgroup label="Branch — one parallel path only">
                      {COMPONENT_TYPES.filter(x => x.position === BRANCH).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </optgroup>
                  </Select>
                  <Input type="number" value={c.value} onChange={e => set('value', e.target.value)}
                    style={{ width: 68, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
                  <Select value={c.unit} onChange={e => set('unit', e.target.value)} style={{ width: 68, fontSize: 12 }}>
                    <option value="ft">ft</option><option value="psi">psi</option><option value="kpa">kPa</option>
                  </Select>
                  <span style={{ fontSize: 10, color: colors.textDim }}>rated @</span>
                  <Input type="number" value={c.ratedGpm} onChange={e => set('ratedGpm', e.target.value)}
                    placeholder="GPM" style={{ width: 62, textAlign: 'center', fontFamily: "'DM Mono', monospace" }} />
                  <Select value={c.ratedOn} onChange={e => set('ratedOn', e.target.value)} style={{ width: 90, fontSize: 12 }}>
                    <option value="water">on water</option><option value="glycol">on glycol</option>
                  </Select>
                  <span style={{ fontSize: 10, color: colors.textDim }}>actual</span>
                  <Input type="number" value={c.actualGpm || ''} onChange={e => set('actualGpm', e.target.value)}
                    placeholder={line && line.derivedGpm ? String(line.derivedGpm) : 'GPM'}
                    title="Leave blank to derive it — a series item sees the whole loop, a branch item an even split of it."
                    style={{ width: 62, textAlign: 'center', fontFamily: "'DM Mono', monospace",
                      borderColor: line && line.flowBasis === 'override' ? colors.green : undefined }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
                    color: c.fromSubmittal ? colors.green : colors.yellow, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!c.fromSubmittal} onChange={e => set('fromSubmittal', e.target.checked)} />
                    {c.fromSubmittal ? 'from submittal' : 'typical'}
                  </label>
                  <span style={{ marginLeft: 'auto', fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600 }}>
                    {line ? `${line.ft} ft` : '—'}
                  </span>
                  <button onClick={() => setComponents(components.filter((_, j) => j !== i))}
                    style={{ background: 'transparent', border: 'none', color: colors.red, cursor: 'pointer', fontSize: 14 }}>×</button>
                </Row>
                {line && line.corrections.length > 0 && (
                  <div style={{ fontSize: 10, color: colors.textDim, marginTop: 3, paddingLeft: 54 }}>
                    {line.corrections.join(' · ')}
                  </div>
                )}
                {t && t.note && !c.fromSubmittal && (
                  <div style={{ fontSize: 10, color: colors.textDim, marginTop: 3, paddingLeft: 54, fontStyle: 'italic' }}>
                    {t.note} Typical {t.typicalFt} ft (range {t.range[0]}–{t.range[1]}).
                  </div>
                )}
              </div>
            );
          })}

          <Row style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Btn variant="ghost" size="sm" onClick={() => setComponents([...components, newComponent('caseCoil')])}>+ Component</Btn>
            {!components.length && (
              <Btn variant="ghost" size="sm" onClick={() => setComponents(seedComponents(loopType))}>
                Start from a typical {loopType === 'water' ? 'water loop' : 'glycol loop'}
              </Btn>
            )}
          </Row>

          {components.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: colors.textDim, fontFamily: "'DM Mono', monospace", lineHeight: 1.8 }}>
              <div>
                <strong style={{ color: colors.green }}>{eq.totalFt} ft</strong> = {eq.seriesFt} ft series
                {' '}+ {eq.branchFt} ft worst branch
                {eq.branchGpm > 0 && <span> · branch flow ≈ {eq.branchGpm} GPM</span>}
              </div>
              {naive !== null && (
                <div style={{ color: colors.textDim }}>
                  Adding all {fixtures} branches would have given {naive} ft — {Math.round(naive / eq.totalFt)}× too much.
                  That is the error this table exists to prevent.
                </div>
              )}
            </div>
          )}

          {eqSanity.map((s, i) => (
            <div key={i} style={{ marginTop: 8, fontSize: 11, lineHeight: 1.5, padding: '6px 10px', borderRadius: 6,
              background: s.severity === 'blocker' ? 'rgba(239,68,68,0.08)' : 'rgba(234,179,8,0.06)',
              border: `1px solid ${TONE[s.severity]}40`, color: colors.textDim }}>
              <strong style={{ color: TONE[s.severity] }}>{s.severity === 'blocker' ? '⛔' : s.severity === 'verify' ? '⚠' : 'ℹ'} {s.label}</strong>
              <br />{s.detail}
            </div>
          ))}
        </details>

        {hyd.gpm === null ? (
          <div style={{ fontSize: 12, color: colors.textDim }}>
            Enter the load and ΔT to size the flow — the spec's 20–24°F supply against a 28–32°F return is about 8°F.
          </div>
        ) : (
          <div style={{ fontSize: 12, color: colors.textDim, fontFamily: "'DM Mono', monospace", lineHeight: 1.9 }}>
            <div><strong style={{ color: colors.green }}>{hyd.gpm} GPM</strong> — {hyd.extraFlowPct}% more than the {hyd.waterGpm} GPM the same load would need on water</div>
            {hyd.head && <div>head {hyd.head.totalFt} ft ({hyd.head.frictionFt} friction over {hyd.head.developedFt} ft developed + {hyd.head.componentFt} equipment)</div>}
            {hyd.hp && <div><strong style={{ color: colors.green }}>{hyd.hp.motorHp} HP</strong> motor ({hyd.hp.bhp} bhp) × {hyd.pumpCount} — the spec calls for dual redundant pumps</div>}
            {hyd.velocityVerdict && (
              <div style={{ color: hyd.velocityVerdict.ok ? colors.textDim : colors.red }}>
                {hyd.velocityVerdict.ok ? '✓' : '⚠'} {hyd.velocity} ft/s in the {label(mainId)} main — {hyd.velocityVerdict.why}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── What these numbers are standing on ── */}
      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: TONE[summary.tone], fontWeight: 600 }}>
          {summary.tone === 'ok' ? '✓' : summary.tone === 'blocker' ? '⛔' : '⚠'} {summary.text} — what these numbers are standing on
        </summary>
        <div style={{ marginTop: 10 }}>
          {review.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0',
              borderTop: i ? `1px solid ${colors.border}` : 'none' }}>
              <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: TONE[r.severity],
                border: `1px solid ${TONE[r.severity]}55`, borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {SRC[r.source]}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: r.severity === 'fyi' ? colors.textDim : colors.text }}>{r.label}</div>
                <div style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.5 }}>{r.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </details>

      <Btn variant={added ? 'ghost' : 'green'} size="sm" onClick={addLines} disabled={!lines.length}>
        {added ? '✓ Added — click again to update' : `Add ${lines.length} glycol line(s) — ${fmt(total)}`}
      </Btn>
    </Card>
  );
}
