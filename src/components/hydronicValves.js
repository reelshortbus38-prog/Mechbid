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
export const HOSE_KIT = { 0.5: 195, 0.75: 215, 1: 290 };

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

  if (terminals > 0) {
    if (terminalMode === 'hosekit') {
      lines.push({
        key: 'hosekit', desc: `Hose kit, ${sz(terminalSize)} — terminal unit connection package`,
        qty: terminals, unit: 'ea', defaultPrice: nearest(HOSE_KIT, terminalSize),
        notes: 'flex hoses + ball valve w/ union + balancing valve + P/T ports, one per terminal unit',
      });
    } else {
      lines.push({
        key: 'termball', desc: `Ball valve, ${sz(terminalSize)} — terminal isolation`,
        qty: terminals * 2, unit: 'ea', defaultPrice: nearest(BALL_VALVE, terminalSize),
        notes: 'two per terminal unit — supply and return',
      });
      lines.push({
        key: 'termbal', desc: `Balancing valve, ${sz(terminalSize)} — terminal`,
        qty: terminals, unit: 'ea', defaultPrice: nearest(BALANCING_VALVE, terminalSize),
        notes: 'one per terminal unit, return side',
      });
      lines.push({
        key: 'termpt', desc: 'P/T test port (Pete\'s plug)',
        qty: terminals * 2, unit: 'ea', defaultPrice: PT_PORT,
        notes: 'both sides of the coil — the sheet calls for these at control sensing equipment',
      });
    }

    if (controlValves !== 'none') {
      const byOthers = controlValves === 'byOthers';
      lines.push({
        key: 'controlvalve',
        desc: `Control valve, ${sz(terminalSize)} — 2-way modulating w/ actuator${byOthers ? ' (FURNISHED BY CONTROLS — install only)' : ''}`,
        qty: terminals, unit: 'ea',
        defaultPrice: byOthers ? 0 : nearest(CONTROL_VALVE, terminalSize),
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
