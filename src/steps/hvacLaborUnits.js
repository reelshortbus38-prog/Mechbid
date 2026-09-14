// ── HVAC LABOR, WHICH THIS APP HAD NONE OF ──────────────────────────────────
// The refrigeration side derives hours from the circuit list and from the
// scope card. Commercial HVAC derived NOTHING. Every hour on an HVAC job was
// hand-typed as crew days, so the app's takeoff — equipment, duct pounds, air
// devices, hydronic pipe — produced a materials bid and not one labor hour.
//
// ── WHERE THESE NUMBERS COME FROM, SAID PLAINLY ─────────────────────────────
// Published industry sources, read off the open web in September 2026. NOT
// from anyone who bids or installs this work, and NOT from a finished job.
// That is a weaker footing than anything on the refrigeration side, where the
// figures came from a working mechanic and an estimator, and every unit here
// is marked accordingly.
//
// The trade's own labor databases — SMACNA's, MCAA's, the Means volumes — are
// paid products and are not reproduced here. What IS reproduced is the SHAPE
// those databases use, which is public knowledge and is the part that matters:
// duct by the pound, equipment by the piece scaled on size, startup as its own
// line. Getting the shape right is what lets a real number replace a ballpark
// later without rebuilding anything.
//
// ── THE LESSON FROM THE RACK SET IS BUILT IN ────────────────────────────────
// Every equipment figure found in the wild was a DURATION with a crew beside
// it — "8 to 16 hours for a two-person crew" — and the rack set got entered as
// man-hours once already, at a quarter of its real value. So equipment is
// stored as hours-on-site and a crew, separately, and multiplied here where
// the working is visible. Ductwork is the exception and is genuinely a
// man-hour rate: sheet metal productivity is quoted per man per pound.
//
// ── AND WHAT IS DELIBERATELY NOT A LABOR UNIT ───────────────────────────────
// The crane, and test-and-balance. Both are bought in on most jobs — TAB
// especially, which the sources put at $8k-$25k on a commercial building and
// which is normally a balancing contractor's scope, not crew hours. Inventing
// man-hours for work the shop subcontracts would put a number in a bid that
// nobody has quoted. Both belong in Subcontractors or Rentals, and the card
// says so.

export const HVAC_UNIT_KEYS = [
  'rtuSetHrsBase', 'rtuSetHrsPerTon', 'rtuSetCrew',
  'ductHrsPerLb', 'startupHrsPerUnit', 'startupCrew', 'curbAdapterHrs',
];

export const HVAC_UNIT_FIELDS = [
  { key: 'rtuSetHrsBase', label: 'Unit set — base hrs' },
  { key: 'rtuSetHrsPerTon', label: 'Unit set — hrs / ton' },
  { key: 'rtuSetCrew', label: 'Unit set — men' },
  { key: 'curbAdapterHrs', label: 'Curb adapter — extra hrs' },
  { key: 'ductHrsPerLb', label: 'Duct — man-hrs / lb' },
  { key: 'startupHrsPerUnit', label: 'Startup — hrs / unit' },
  { key: 'startupCrew', label: 'Startup — men' },
];

// The VALUES live in DEFAULT_LABOR_UNITS in state/store.js, next to the
// refrigeration ones, so saveJob freezes them onto each job like every other
// unit — a default that changes must never reprice a bid that already went out.
// This module holds the keys and the arithmetic.

// Hours on site for one unit of this size, before the crew multiplier.
export function rtuSetHours(tons, units = {}) {
  const t = Math.max(0, Number(tons) || 0);
  const base = Math.max(0, Number(units.rtuSetHrsBase) || 0);
  const perTon = Math.max(0, Number(units.rtuSetHrsPerTon) || 0);
  if (base <= 0 && perTon <= 0) return 0;
  return base + perTon * t;
}

// Past this the sources say cost and labor climb faster than tonnage: bigger
// curbs, heavier rigging, more involved electrical. The model here is linear,
// so it under-reads above this and the card says so rather than pretending.
export const LINEAR_TONS_LIMIT = 25;

// Which equipment rows are a unit somebody sets. Pumps and terminal units are
// counted elsewhere (hydronicValves.countHydronicEquipment) and would double.
const SET_TYPES = /\b(rtu|rooftop|packaged?|split|ahu|air handler|condens\w*|heat pump|make.?up air|mua|erv|hrv|furnace)\b/i;

export function isSetUnit(type) {
  return SET_TYPES.test(String(type || ''));
}

// → { lines, manHours, overLimit }
// Pure. `equipment` is state.hvacEquipment; `ductLbs` is what the duct takeoff
// found in POUNDS.
export function hvacLaborLines({ equipment = [], ductLbs = 0, curbAdapters = 0 } = {}, units = {}) {
  const u = k => Math.max(0, Number(units[k]) || 0);
  const lines = [];
  const overLimit = [];

  const setCrew = Math.max(0, Number(units.rtuSetCrew) || 0);
  for (const e of equipment || []) {
    if (!isSetUnit(e?.type)) continue;
    const qty = Math.max(1, Math.floor(Number(e?.qty) || 1));
    const tons = Number(e?.tons) || 0;
    const hrs = rtuSetHours(tons, units);
    if (hrs <= 0 || setCrew <= 0) continue;
    if (tons > LINEAR_TONS_LIMIT) overLimit.push(e?.tag || e?.type || 'unit');
    lines.push({
      kind: 'set',
      desc: `Set ${e?.tag || e?.type || 'unit'}${tons ? ` — ${tons} ton` : ''}${qty > 1 ? ` (${qty})` : ''}`,
      manHours: hrs * setCrew * qty,
    });
  }

  const adapters = Math.max(0, Math.floor(Number(curbAdapters) || 0));
  if (adapters > 0 && u('curbAdapterHrs') > 0 && setCrew > 0) {
    lines.push({
      kind: 'curb',
      desc: `Curb adapters (${adapters})`,
      manHours: adapters * u('curbAdapterHrs') * setCrew,
    });
  }

  // Ductwork is the one genuine man-hour rate here — sheet metal productivity
  // is quoted per man per pound, so no crew multiplier.
  const lbs = Math.max(0, Number(ductLbs) || 0);
  if (lbs > 0 && u('ductHrsPerLb') > 0) {
    lines.push({
      kind: 'duct',
      desc: `Hang and connect ductwork (${Math.round(lbs).toLocaleString('en-US')} lb)`,
      manHours: lbs * u('ductHrsPerLb'),
    });
  }

  // Its own line, never inside the set. "Installation, commissioning and
  // startup are not interchangeable line items" is the one thing every source
  // agreed on.
  const startCrew = Math.max(0, Number(units.startupCrew) || 0);
  const setUnits = (equipment || [])
    .filter(e => isSetUnit(e?.type))
    .reduce((s, e) => s + Math.max(1, Math.floor(Number(e?.qty) || 1)), 0);
  if (setUnits > 0 && u('startupHrsPerUnit') > 0 && startCrew > 0) {
    lines.push({
      kind: 'startup',
      desc: `Startup & check (${setUnits} unit${setUnits === 1 ? '' : 's'})`,
      manHours: setUnits * u('startupHrsPerUnit') * startCrew,
    });
  }

  return {
    lines,
    manHours: lines.reduce((s, l) => s + l.manHours, 0),
    overLimit,
  };
}

export function hvacManHours(job, units) {
  return hvacLaborLines(job, units).manHours;
}
