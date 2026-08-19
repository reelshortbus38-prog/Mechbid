// ── HYDRONIC VALVES & SPECIALTIES ────────────────────────────────────────────
// Pipe and fittings get a system to the room; valves are what make it a system
// you can balance, isolate and service. They are also the part a percentage
// allowance hides worst — a fin-tube job is dozens of identical terminal
// packages, and one job's worth of those is a five-figure line nobody sees if
// it is folded into a fittings markup.
//
// The counts come from the equipment already read off the plans, because that
// is what a hydronic valve takeoff actually keys on: one connection package per
// terminal unit, one strainer and check per pump, isolation at the branches.
// The live sheet spells most of this out itself —
//
//   "PROVIDE HOSE KIT FOR EACH FINNED TUBE ON FIRST, SECOND, AND THIRD LEVELS"
//   "PROVIDE AUTOMATIC AIR VENTS (AAV) AT HIGH POINTS OF HYDRONIC SYSTEM"
//   "MINIMALLY SLOPE ALL HYDRONIC PIPING BACK TO DRAIN VALVES"
//   "PROVIDE TEMPERATURE AND PRESSURE PORTS ... ON BOTH SIDES OF CONTROL
//    SENSING EQUIPMENT FOR CALIBRATION AND BALANCING"
//   "HYDRONIC CHANGE-OVER ISOLATION VALVES"
//
// — so these are not invented line items, they are that sheet's own scope.
//
// EVERY PRICE HERE IS A PLACEHOLDER. Unlike the copper table, which is scaled
// off a real quote the estimator gave, nobody has priced these. They are round
// trade numbers to get a bid off zero, and each generated line says so. The
// price book overwrites them permanently the first time they are corrected.
//
// Pure — no React. The component supplies the counts and reads back lines.

// Bronze/brass ball valve, threaded or press, by nominal size.
export const BALL_VALVE = { 0.5: 18, 0.75: 22, 1: 35, 1.25: 55, 1.5: 70, 2: 110, 2.5: 165 };
// Lug/wafer butterfly with lever — where copper stops, this starts.
export const BUTTERFLY_VALVE = { 2.5: 150, 3: 185, 4: 245, 5: 310, 6: 385, 8: 560 };
// Circuit setter / manual balancing valve with integral P/T ports.
export const BALANCING_VALVE = { 0.5: 110, 0.75: 125, 1: 165, 1.25: 230, 1.5: 290, 2: 420, 2.5: 600 };
// Y-strainer, bronze small / iron large.
export const Y_STRAINER = { 0.75: 45, 1: 60, 1.25: 85, 1.5: 105, 2: 140, 2.5: 210, 3: 280, 4: 400, 6: 700 };
// Silent/spring check at pump discharge.
export const CHECK_VALVE = { 1: 55, 1.25: 75, 1.5: 95, 2: 135, 2.5: 200, 3: 265, 4: 380, 6: 650 };
// Two-way modulating control valve with actuator, terminal-unit sizes.
export const CONTROL_VALVE = { 0.5: 240, 0.75: 265, 1: 330, 1.25: 450, 1.5: 560 };

// A terminal connection package: supply/return flex hoses, ball valve with
// union, balancing valve, P/T ports — bought as one assembly. This is what the
// sheet means by "hose kit", and it replaces the loose valves rather than
// adding to them.
//
// Sizes above 1" were added when runouts started being sized from flow rather
// than hand-picked, because the sizing rule reaches 3" and a size the app can
// select but not price is worse than one it cannot select. They are BUILT UP
// from the tables above rather than invented: the balancing valve and the
// isolation valve at that size, plus a hose-and-ports allowance carried at the
// same share of the assembly the quoted small sizes show (roughly a third).
// Still placeholders, like everything else in this file.
export const HOSE_KIT = {
  0.5: 195, 0.75: 215, 1: 290,
  1.25: 400, 1.5: 505, 2: 750, 2.5: 1085, 3: 1435,
};

export const PT_PORT = 12;        // Pete's plug
export const AIR_VENT = 38;       // automatic air vent, high points
export const DRAIN_VALVE = 22;    // hose-end drain, low points

const nearest = (table, dia) => {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  const exact = keys.find(k => k === Number(dia));
  if (exact !== undefined) return table[exact];
  const up = keys.find(k => k > Number(dia));
  return table[up ?? keys[keys.length - 1]];
};

// opts:
//   terminals        — fin tube / cabinet & unit heaters / reheat coils
//   terminalSize     — the branch size at a terminal (1/2" and 3/4" are typical)
//   terminalMode     — 'hosekit' (one assembly) | 'valves' (loose valves)
//   controlValves    — 'ours' | 'byOthers' | 'none'
//   pumps            — circulators and plant pumps
//   pumpSize         — pump connection size
//   branches         — [{ dia, count }] isolation valves on mains/branches
//   airVents, drains — counts at high and low points
//
// → [{ key, desc, qty, unit, defaultPrice, notes }]
export function hydronicValveLines(opts = {}) {
  const {
    terminals = 0, terminalSize = 0.75, terminalMode = 'hosekit',
    controlValves = 'ours', pumps = 0, pumpSize = 1.5,
    branches = [], airVents = 0, drains = 0,
  } = opts;
  const lines = [];
  const sz = n => (Number.isInteger(n) ? `${n}"` : `${n}"`.replace('0.5', '1/2').replace('0.75', '3/4').replace('1.25', '1-1/4').replace('1.5', '1-1/2').replace('2.5', '2-1/2'));

  // Terminals come either as a single hand-picked size, or — when the flows are
  // known — as a MIX already sized from them. A job whose terminals genuinely
  // differ prices differently at every one of these lines, and a hose kit
  // roughly doubles every size and a half, so folding them to one size is not a
  // rounding error.
  const termGroups = (Array.isArray(opts.terminalMix) && opts.terminalMix.length)
    ? opts.terminalMix.filter(g => Number(g.count) > 0).map(g => ({ dia: Number(g.dia), count: Number(g.count) }))
    : (terminals > 0 ? [{ dia: Number(terminalSize), count: Number(terminals) }] : []);
  // Only suffix keys when there is more than one group, so a single-size job
  // keeps the keys it has always had.
  const multi = termGroups.length > 1;
  const k = (base, dia) => (multi ? `${base}-${dia}` : base);

  for (const g of termGroups) {
    const { dia, count } = g;
    if (terminalMode === 'hosekit') {
      lines.push({
        key: k('hosekit', dia), desc: `Hose kit, ${sz(dia)} — terminal unit connection package`,
        qty: count, unit: 'ea', defaultPrice: nearest(HOSE_KIT, dia),
        notes: 'flex hoses + ball valve w/ union + balancing valve + P/T ports, one per terminal unit',
      });
    } else {
      lines.push({
        key: k('termball', dia), desc: `Ball valve, ${sz(dia)} — terminal isolation`,
        qty: count * 2, unit: 'ea', defaultPrice: nearest(BALL_VALVE, dia),
        notes: 'two per terminal unit — supply and return',
      });
      lines.push({
        key: k('termbal', dia), desc: `Balancing valve, ${sz(dia)} — terminal`,
        qty: count, unit: 'ea', defaultPrice: nearest(BALANCING_VALVE, dia),
        notes: 'one per terminal unit, return side',
      });
      lines.push({
        key: k('termpt', dia), desc: 'P/T test port (Pete\'s plug)',
        qty: count * 2, unit: 'ea', defaultPrice: PT_PORT,
        notes: 'both sides of the coil — the sheet calls for these at control sensing equipment',
      });
    }

    if (controlValves !== 'none') {
      const byOthers = controlValves === 'byOthers';
      lines.push({
        key: k('controlvalve', dia),
        desc: `Control valve, ${sz(dia)} — 2-way modulating w/ actuator${byOthers ? ' (FURNISHED BY CONTROLS — install only)' : ''}`,
        qty: count, unit: 'ea',
        defaultPrice: byOthers ? 0 : nearest(CONTROL_VALVE, dia),
        notes: byOthers
          ? 'material by the controls contractor (Div 23 09 00) — this line carries the INSTALL, so price labor not material'
          : 'one per terminal unit — confirm against the controls scope before pricing, these are commonly furnished by Div 23 09 00',
      });
    }
  }

  if (pumps > 0) {
    lines.push({
      key: 'pumpstrainer', desc: `Y-strainer, ${sz(pumpSize)} — pump suction`,
      qty: pumps, unit: 'ea', defaultPrice: nearest(Y_STRAINER, pumpSize),
      notes: 'one per pump',
    });
    lines.push({
      key: 'pumpcheck', desc: `Check valve, ${sz(pumpSize)} — pump discharge`,
      qty: pumps, unit: 'ea', defaultPrice: nearest(CHECK_VALVE, pumpSize),
      notes: 'one per pump',
    });
    lines.push({
      key: 'pumpiso', desc: `Isolation valve, ${sz(pumpSize)} — pump`,
      qty: pumps * 2, unit: 'ea',
      defaultPrice: pumpSize > 2.5 ? nearest(BUTTERFLY_VALVE, pumpSize) : nearest(BALL_VALVE, pumpSize),
      notes: 'two per pump — suction and discharge, so it can be pulled without draining the system',
    });
  }

  branches.filter(b => Number(b.count) > 0).forEach(b => {
    const dia = Number(b.dia);
    const butterfly = dia > 2.5;
    lines.push({
      key: `branch-${dia}`,
      desc: `${butterfly ? 'Butterfly' : 'Ball'} valve, ${sz(dia)} — branch/main isolation`,
      qty: Number(b.count), unit: 'ea',
      defaultPrice: butterfly ? nearest(BUTTERFLY_VALVE, dia) : nearest(BALL_VALVE, dia),
      notes: butterfly ? 'lug or wafer body with lever' : 'full-port bronze',
    });
  });

  if (airVents > 0) {
    lines.push({
      key: 'aav', desc: 'Automatic air vent — system high points',
      qty: airVents, unit: 'ea', defaultPrice: AIR_VENT,
      notes: 'the sheet also calls for AAV drain lines routed to a floor drain or hub drain — that piping is separate',
    });
  }
  if (drains > 0) {
    lines.push({
      key: 'drain', desc: 'Drain valve, hose-end — system low points',
      qty: drains, unit: 'ea', defaultPrice: DRAIN_VALVE,
      notes: 'piping is sloped back to these',
    });
  }

  return lines;
}

// What the equipment list implies. Terminal units are anything with a hydronic
// coil that gets its own connection package; pumps are anything that circulates.
const TERMINAL_TYPES = /baseboard|fin[-\s]?tube|unit\s*heater|cabinet\s*unit\s*heater|duct\s*heater|fan\s*coil|vav/i;
const PUMP_TYPES = /pump/i;

export function countHydronicEquipment(equipment = []) {
  let terminals = 0, pumps = 0;
  for (const e of equipment) {
    const t = `${e?.type || ''}`;
    if (PUMP_TYPES.test(t)) pumps++;
    else if (TERMINAL_TYPES.test(t)) terminals++;
  }
  return { terminals, pumps };
}
