// ── RECONCILING FACTS ACROSS SHEETS ──────────────────────────────────────────
// The ledger holds what the documents said. This is what checks whether they
// agree — with each other, and with the app.
//
// Three shapes account for every real defect found by reading a live set:
//
//   CONFLICT   the same quantity stated twice, differently. 25% glycol in the
//              heat pump schedule against a 20% PG make-up unit. Nothing is
//              wrong with either sheet on its own; the pair is the problem.
//
//   CROSSCHECK the drawing's answer against the app's. A pump schedule states
//              276 GPM at 83 ft, 78% efficient, and a 10 HP motor. Those first
//              three are inputs and the fourth is an ANSWER — so the app can
//              compute it and compare. This is the one that would have caught
//              the non-overloading bug without anyone reading a sheet.
//
//   RESIDUAL   a total minus its known parts, and whether the remainder is
//              believable. 83 ft of pump, less 27.7 ft held at the remote
//              sensor, less the plant equipment, leaves what the distribution
//              has to be. If that remainder is negative, or nearly the whole
//              pump, one of the inputs is wrong.
//
// A finding names both sheets. An estimator cannot act on "these disagree"
// without being told where to look.
//
// Pure — no pdf.js, no React.

import { FACT_KINDS, factLabel, subjectKey } from './jobFacts.js';
import { pumpHorsepower, psiToFt } from '../components/glycolHydraulics.js';

// ── CONFLICT ─────────────────────────────────────────────────────────────────
// Same kind, same subject, different value, DIFFERENT SHEETS. Two rows of one
// schedule holding the same figure are not a conflict, they are a schedule.
export function conflicts(ledger = []) {
  const groups = new Map();
  for (const f of ledger) {
    // System is part of the identity: two loops may legitimately run
    // different glycol, and that is not a disagreement.
    const k = `${f.kind}|${f.system}|${subjectKey(f.subject)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const out = [];
  for (const [, facts] of groups) {
    if (facts.length < 2) continue;
    const sheets = new Set(facts.map(f => f.sheet));
    if (sheets.size < 2) continue;
    const values = facts.map(f => f.value);
    const lo = Math.min(...values), hi = Math.max(...values);
    if (lo === hi) continue;
    const tol = FACT_KINDS[facts[0].kind]?.tol ?? 0;
    if (lo > 0 && (hi - lo) / lo <= tol) continue;
    out.push({
      type: 'conflict',
      severity: 'blocker',
      kind: facts[0].kind,
      subject: facts[0].subject,
      label: `${factLabel(facts[0].kind)}${facts[0].subject ? ` — ${facts[0].subject}` : ''} is stated two ways`,
      detail: facts
        .map(f => `${f.sheet || 'unknown sheet'}: ${f.value} ${f.unit}`)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join('  ·  '),
      facts,
      sheets: [...sheets],
    });
  }
  return out;
}

// ── CROSSCHECK: THE SCHEDULE'S ANSWER AGAINST THE APP'S ──────────────────────
// A pump row carries its own inputs and its own answer. Recomputing the answer
// from the inputs and comparing is free, and it is the check that turns a
// scheduled sheet into a test of the app rather than only a source of numbers.
//
// A mismatch is NOT automatically the drawing's fault — when this was first run
// against a real schedule the app was the one that was wrong, twice. So the
// finding says both figures and leaves the verdict open.
export function pumpCrosschecks(ledger = []) {
  const bySubject = new Map();
  for (const f of ledger) {
    if (!f.subject || !/^pump/.test(f.kind)) continue;
    const k = subjectKey(f.subject);
    if (!bySubject.has(k)) bySubject.set(k, { subject: f.subject, system: f.system, sheets: new Set() });
    const rec = bySubject.get(k);
    if (rec[f.kind] === undefined) rec[f.kind] = f.value;
    rec.sheets.add(f.sheet);
  }

  const out = [];
  for (const [, r] of bySubject) {
    const { pumpFlow: gpm, pumpHead: ft, pumpEff: eff, pumpMotorHp: scheduled } = r;
    if (!(gpm > 0) || !(ft > 0) || !(eff > 0) || !(scheduled > 0)) continue;
    // Horsepower moves the weight of the fluid, so a glycol loop needs more of
    // it than water at the same flow and head. If a sheet stated the
    // concentration for THIS loop, use it rather than assuming water.
    const fluid = ledger.find(x => x.kind === 'fluidPct' && x.system && x.system === r.system);
    const pct = fluid ? fluid.value : 0;
    const hp = pumpHorsepower(gpm, ft, { pct, efficiency: eff / 100 });
    if (!hp) continue;
    const agree = hp.motorHp === scheduled;
    out.push({
      type: 'crosscheck',
      severity: agree ? 'ok' : 'verify',
      kind: 'pumpMotorHp',
      subject: r.subject,
      label: agree
        ? `${r.subject} — MechBid selects the scheduled ${scheduled} HP`
        : `${r.subject} — MechBid selects ${hp.motorHp} HP, the schedule says ${scheduled} HP`,
      detail: agree
        ? `${gpm} GPM at ${ft} ft, ${eff}% efficient${pct ? `, ${pct}% glycol` : ''} → ${hp.bhp} bhp. Agreement here means the inputs were read `
          + 'right and the selection method matches the engineer\'s.'
        : `${gpm} GPM at ${ft} ft, ${eff}% efficient${pct ? `, ${pct}% glycol` : ''} → ${hp.bhp} bhp, which clears ${hp.minMotorHp} HP at the design `
          + `point and ${hp.motorHp} HP with the ${hp.marginPct}% non-overloading margin. One of the two is wrong, and `
          + 'it is not automatically the drawing — price the scheduled motor and ask.',
      computed: hp.motorHp,
      scheduled,
      bhp: hp.bhp,
      fluidPct: pct,
      sheets: [...r.sheets],
    });
  }
  return out;
}

// ── RESIDUAL: WHAT IS LEFT FOR THE PIPE ──────────────────────────────────────
// Pump head is the sum of what the plant costs, what the distribution costs,
// and what the control holds at the far end. Two of those three come off
// documents. The third is whatever is left, and it has to be believable.
export const RESIDUAL_MIN_FRACTION = 0.15;   // under this, the pipe is doing suspiciously little
export const RESIDUAL_MAX_FRACTION = 0.95;   // over this, something known is missing

export function headResiduals(ledger = [], { plantHeadFt = 0 } = {}) {
  const heads = ledger.filter(f => f.kind === 'pumpHead');
  const dps = ledger.filter(f => f.kind === 'dpSetpoint');
  if (!heads.length || !dps.length) return [];

  const out = [];
  const seen = new Set();
  for (const h of heads) {
    // ONLY a setpoint on the SAME LOOP. A hydronic setpoint says nothing about
    // a condenser water pump, and nothing at all about a 1/6 HP kitchen
    // circulator that is on neither. A pump whose loop cannot be identified, or
    // whose loop has no setpoint, gets no finding rather than a wrong one.
    const onLoop = dps.filter(f => f.system && h.system && f.system === h.system);
    if (!onLoop.length) continue;
    // The setpoint the pumps ride. A plant minimum or a heat pump header
    // setpoint is a different control loop within the same system.
    const system = onLoop.find(f => !/minimum|maximum|header/i.test(f.subject)) || onLoop[0];
    const dpFt = psiToFt(system.value);

    // One finding per distinct head value — three identical pumps are one
    // question, not three.
    if (seen.has(`${h.system}|${h.value}`)) continue;
    seen.add(`${h.system}|${h.value}`);
    const residual = h.value - dpFt - (Number(plantHeadFt) || 0);
    const frac = residual / h.value;
    const ok = frac >= RESIDUAL_MIN_FRACTION && frac <= RESIDUAL_MAX_FRACTION;
    out.push({
      type: 'residual',
      severity: ok ? 'ok' : 'verify',
      kind: 'pumpHead',
      subject: h.subject,
      label: ok
        ? `${h.subject} — ${Math.round(residual)} ft of the ${h.value} ft is distribution`
        : `${h.subject} — the ${h.value} ft does not decompose sensibly`,
      detail: `${h.value} ft scheduled, less ${dpFt} ft held at the remote sensor `
        + `(${system.value} PSI, ${system.subject})`
        + `${plantHeadFt > 0 ? `, less ${plantHeadFt} ft of plant equipment` : ''} `
        + `→ ${Math.round(residual * 10) / 10} ft for the distribution, ${Math.round(frac * 100)}% of the pump. `
        + (ok
          ? 'That is a normal split and worth having: it is the number to check a friction rate against.'
          : residual <= 0
            ? 'That is negative — the setpoint and the head cannot both be right.'
            : 'That leaves almost nothing, or almost everything, for the pipe. One of these figures is off.'),
      residualFt: Math.round(residual * 10) / 10,
      fraction: Math.round(frac * 100) / 100,
      sheets: [...new Set([h.sheet, system.sheet])],
    });
  }
  return out;
}

// ── ONE CALL ─────────────────────────────────────────────────────────────────
export function reconcile(ledger = [], opts = {}) {
  const findings = [
    ...conflicts(ledger),
    ...pumpCrosschecks(ledger),
    ...headResiduals(ledger, opts),
  ];
  const rank = { blocker: 0, verify: 1, ok: 2 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function reconcileSummary(findings = []) {
  const b = findings.filter(f => f.severity === 'blocker').length;
  const v = findings.filter(f => f.severity === 'verify').length;
  const ok = findings.filter(f => f.severity === 'ok').length;
  if (!findings.length) return { tone: 'fyi', text: 'Nothing to cross-check yet — one sheet cannot disagree with itself' };
  if (b) return { tone: 'blocker', text: `${b} document(s) disagree${v ? `, ${v} to verify` : ''}` };
  if (v) return { tone: 'verify', text: `${v} cross-check(s) worth resolving` };
  return { tone: 'ok', text: `${ok} cross-check(s) agree across sheets` };
}
