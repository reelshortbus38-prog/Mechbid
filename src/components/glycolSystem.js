// ── SECONDARY GLYCOL LOOP ────────────────────────────────────────────────────
// A secondary system is not a DX system with different pipe in it. There is no
// suction line, no liquid line and no per-case refrigerant charge; there is a
// chiller barrel in the back room, a supply and return header out to the floor,
// and a coil in every case fed with cold propylene glycol. The material list
// that falls out of that has almost nothing in common with a rack takeoff, and
// two of its biggest line items — the insulation and the FLUID — have no
// equivalent on the DX side at all.
//
// The fluid is the one estimators miss. A store's loop holds hundreds of
// gallons, inhibited food-grade propylene glycol is not cheap, and none of it
// shows up anywhere in a copper-and-fittings takeoff.
//
// Scoped from a real project spec: 30–35% PG by volume, 20–24°F supply and
// 28–32°F return, medium-temp cases and walk-ins, sch-80 PVC or copper mains,
// 1" closed-cell elastomeric on ALL supply and return, and a balance valve,
// circuit setter and liquid-line solenoid at every case.
//
// Pure — no React.

// ── FREEZE PROTECTION ────────────────────────────────────────────────────────
// Freeze point of inhibited propylene glycol by volume percent. These are the
// well-established numbers; BURST protection is a separate, lower curve that
// varies enough between manufacturers that this module deliberately does not
// state one — read it off the drum.
export const PG_FREEZE_F = { 20: 19, 25: 15, 30: 8, 35: 0, 40: -8, 45: -19, 50: -29 };

export function pgFreezePoint(pct) {
  const p = Number(pct);
  const keys = Object.keys(PG_FREEZE_F).map(Number).sort((a, b) => a - b);
  if (!(p > 0)) return null;
  if (p <= keys[0]) return PG_FREEZE_F[keys[0]];
  if (p >= keys[keys.length - 1]) return PG_FREEZE_F[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (p >= a && p <= b) {
      const t = (p - a) / (b - a);
      return Math.round((PG_FREEZE_F[a] + t * (PG_FREEZE_F[b] - PG_FREEZE_F[a])) * 10) / 10;
    }
  }
  return null;
}

// Does this mix actually clear the temperature the job needs it to?
// Concentration is a spec, not a preference — and it cuts both ways. Too little
// and the loop slushes; too much and heat transfer drops while pumping power
// climbs, so over-mixing costs money twice.
export function checkMix(pct, protectToF) {
  const freeze = pgFreezePoint(pct);
  // Guard the empty cases BEFORE coercing: Number(null) and Number('') are both
  // 0, and 0°F is a real target a walk-in might genuinely need. Letting a blank
  // field become it would report a pass or a fail on a number nobody entered.
  if (protectToF === null || protectToF === undefined || protectToF === '') return null;
  if (freeze === null || !Number.isFinite(Number(protectToF))) return null;
  const margin = Math.round((Number(protectToF) - freeze) * 10) / 10;
  return { freeze, protectToF: Number(protectToF), margin, ok: margin >= 0 };
}

// ── SYSTEM VOLUME ────────────────────────────────────────────────────────────
// Gallons per linear foot of pipe. This is geometry, not a price, so it does
// not go stale. Type L copper and schedule 80 PVC — the two the spec names.
export const PIPE_GAL_FT = {
  copper: { 0.5: 0.0121, 0.75: 0.0251, 1: 0.0429, 1.25: 0.0653, 1.5: 0.0924, 2: 0.1608, 2.5: 0.2479, 3: 0.3539, 4: 0.6221 },
  pvc80:  { 0.5: 0.0122, 0.75: 0.0225, 1: 0.0374, 1.25: 0.0666, 1.5: 0.0918, 2: 0.1534, 2.5: 0.2202, 3: 0.3432, 4: 0.5973 },
};

// runs: [{ dia, ft }]. coilGal: what the case coils and the chiller barrel hold
// — from the equipment submittals, because nothing on a drawing gives it.
export function systemVolumeGal(runs = [], { material = 'copper', coilGal = 0, tankGal = 0 } = {}) {
  const table = PIPE_GAL_FT[material] || PIPE_GAL_FT.copper;
  const pipe = runs.reduce((s, r) => s + (table[Number(r.dia)] || 0) * (Number(r.ft) || 0), 0);
  return {
    pipeGal: Math.round(pipe * 10) / 10,
    coilGal: Number(coilGal) || 0,
    tankGal: Number(tankGal) || 0,
    totalGal: Math.round((pipe + (Number(coilGal) || 0) + (Number(tankGal) || 0)) * 10) / 10,
  };
}

// The spec charges by blending concentrate with demineralized water on site, so
// the buy is two things, not one.
export function glycolCharge(totalGal, pct, { overfillPct = 10 } = {}) {
  const v = (Number(totalGal) || 0) * (1 + (Number(overfillPct) || 0) / 100);
  const p = (Number(pct) || 0) / 100;
  return {
    fillGal: Math.round(v * 10) / 10,
    concentrateGal: Math.ceil(v * p),
    waterGal: Math.ceil(v * (1 - p)),
  };
}

// ── PRICES ───────────────────────────────────────────────────────────────────
// PLACEHOLDERS, every one. Nothing here is anchored to a quote the estimator
// gave, and each generated line says so on its face.
export const PG_CONCENTRATE_GAL = 38;   // inhibited food-grade, drum/tote
export const DI_WATER_GAL = 1.5;        // demineralized, delivered
export const PVC80_PER_FT = { 0.5: 3.2, 0.75: 4.1, 1: 5.6, 1.25: 7.8, 1.5: 9.4, 2: 13.5, 2.5: 21, 3: 27, 4: 39 };
// Closed-cell elastomeric, 1" wall, vapor-sealed — per foot, by pipe size.
export const ELASTOMERIC_1IN_PER_FT = { 0.5: 3.4, 0.75: 3.9, 1: 4.6, 1.25: 5.5, 1.5: 6.3, 2: 8.1, 2.5: 10.4, 3: 12.6, 4: 17.2 };
export const GLYCOL_BALANCE_VALVE = { 0.5: 105, 0.75: 120, 1: 160 };
export const CIRCUIT_SETTER_ELECTRONIC = 520;   // with actuator + flow readout
export const SOLENOID_VALVE = { 0.5: 130, 0.75: 155, 1: 210 };
export const AIR_SEPARATOR = { 2: 380, 2.5: 520, 3: 700, 4: 1050 };
export const EXPANSION_TANK = 640;
export const GLYCOL_FEED_STATION = 1850;        // tank + pump + low-level alarm

const nearest = (table, dia) => {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (table[Number(dia)] !== undefined) return table[Number(dia)];
  const up = keys.find(k => k > Number(dia));
  return table[up ?? keys[keys.length - 1]];
};

// ── MATERIAL LINES ───────────────────────────────────────────────────────────
// opts:
//   runs        — [{ dia, ft }] supply + return, as taken off
//   material    — 'copper' | 'pvc80'
//   pct         — glycol concentration by volume
//   coilGal, tankGal, overfillPct
//   fixtures    — cases and walk-in coils, each getting a valve set
//   fixtureSize — the branch size at a case
//   headerSize  — main size, for the air separator
//   insulateAll — the spec says ALL supply and return; false prices supply only
export function glycolMaterialLines(opts = {}) {
  const {
    runs = [], material = 'copper', pct = 32,
    coilGal = 0, tankGal = 0, overfillPct = 10,
    fixtures = 0, fixtureSize = 0.75, headerSize = 2,
    insulateAll = true,
  } = opts;
  const lines = [];
  const label = d => (d === 0.5 ? '1/2"' : d === 0.75 ? '3/4"' : d === 1.25 ? '1-1/4"' : d === 1.5 ? '1-1/2"' : d === 2.5 ? '2-1/2"' : `${d}"`);
  const sized = runs.filter(r => Number(r.ft) > 0 && Number(r.dia) > 0);

  // Pipe, by size.
  sized.forEach(r => {
    const dia = Number(r.dia), ft = Math.ceil(Number(r.ft));
    lines.push({
      key: `pipe-${material}-${dia}`, section: 'Glycol Piping',
      desc: `${label(dia)} ${material === 'pvc80' ? 'sch-80 PVC' : 'type L copper'} — glycol main/branch`,
      qty: ft, unit: 'ft',
      defaultPrice: material === 'pvc80' ? nearest(PVC80_PER_FT, dia) : 0, // copper priced by the shared table
      priceFromCopperTable: material !== 'pvc80' ? dia : null,
    });
  });

  // Insulation. The spec is explicit — vapor-sealed closed cell, 1" minimum, on
  // supply AND return, because a sweating line over open merchandise is a
  // failed job regardless of how well the loop performs.
  const insFt = sized.reduce((s, r) => s + Math.ceil(Number(r.ft)), 0);
  if (insFt > 0) {
    sized.forEach(r => {
      const dia = Number(r.dia), ft = Math.ceil(Number(r.ft)) * (insulateAll ? 1 : 0.5);
      if (ft <= 0) return;
      lines.push({
        key: `insul-${dia}`, section: 'Glycol Piping',
        desc: `Closed-cell elastomeric, 1" wall, vapor-sealed — ${label(dia)} line`,
        qty: Math.ceil(ft), unit: 'ft', defaultPrice: nearest(ELASTOMERIC_1IN_PER_FT, dia),
        notes: 'spec requires it on all supply AND return — condensation drip over merchandise',
      });
    });
  }

  // The fluid. The line nobody carries.
  const vol = systemVolumeGal(sized, { material, coilGal, tankGal });
  const charge = glycolCharge(vol.totalGal, pct, { overfillPct });
  if (charge.concentrateGal > 0) {
    lines.push({
      key: 'pg', section: 'Glycol Charge',
      desc: `Propylene glycol, inhibited food-grade — ${pct}% by volume`,
      qty: charge.concentrateGal, unit: 'gal', defaultPrice: PG_CONCENTRATE_GAL,
      notes: `system holds ~${vol.totalGal} gal (${vol.pipeGal} pipe + ${vol.coilGal} coils + ${vol.tankGal} tank), +${overfillPct}% for fill losses and flush`,
    });
    lines.push({
      key: 'diwater', section: 'Glycol Charge',
      desc: 'Demineralized water — blend to target refractometer reading',
      qty: charge.waterGal, unit: 'gal', defaultPrice: DI_WATER_GAL,
      notes: 'spec calls for demineralized, not tap — chlorides attack the inhibitor package',
    });
  }

  // Per fixture. Straight off the scope: a balance valve, a circuit setter and
  // a liquid-line solenoid at every case and walk-in coil.
  if (fixtures > 0) {
    lines.push({
      key: 'balvalve', section: 'Case Connections',
      desc: `Glycol balance valve, ${label(fixtureSize)}`,
      qty: fixtures, unit: 'ea', defaultPrice: nearest(GLYCOL_BALANCE_VALVE, fixtureSize),
    });
    lines.push({
      key: 'setter', section: 'Case Connections',
      desc: 'Electronic circuit setter — flow measurement & balancing',
      qty: fixtures, unit: 'ea', defaultPrice: CIRCUIT_SETTER_ELECTRONIC,
      notes: 'the balancing spec turns on these — equalized GPM across the longest runs',
    });
    lines.push({
      key: 'solenoid', section: 'Case Connections',
      desc: `Liquid-line solenoid valve, ${label(fixtureSize)} — 24V or 120V`,
      qty: fixtures, unit: 'ea', defaultPrice: nearest(SOLENOID_VALVE, fixtureSize),
      notes: 'confirm coil voltage against the EMS scope before ordering',
    });
  }

  // Loop specialties.
  if (sized.length > 0) {
    lines.push({ key: 'airsep', section: 'Loop Specialties',
      desc: `Air separator, ${label(headerSize)} — loop high point`,
      qty: 1, unit: 'ea', defaultPrice: nearest(AIR_SEPARATOR, headerSize),
      notes: 'the spec vacuum-purges air pockets at charging; this keeps them out afterwards' });
    lines.push({ key: 'exptank', section: 'Loop Specialties',
      desc: 'Expansion tank — glycol rated, bladder type',
      qty: 1, unit: 'ea', defaultPrice: EXPANSION_TANK });
    lines.push({ key: 'feed', section: 'Loop Specialties',
      desc: 'Glycol feed / makeup station — tank, pump, low-level alarm',
      qty: 1, unit: 'ea', defaultPrice: GLYCOL_FEED_STATION,
      notes: 'makeup must be pre-mixed glycol, never plain water — topping up with water walks the concentration down' });
  }

  return lines;
}
