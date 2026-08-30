// ── WHICH READER GETS THIS DOCUMENT, AND WHERE THE ANSWER LANDS ──────────────
// Refrigeration and HVAC are read by DIFFERENT prompts because they are looking
// for different things. The refrigeration readers hunt circuits, line sizes,
// rack work and RC schedule nights; the HVAC readers hunt equipment tags, CFM,
// air devices and duct/pipe runs. Point a document at the wrong one and it does
// not fail loudly — it returns empty arrays, which on screen is
// indistinguishable from "this job genuinely has no work of that kind".
//
// The routing was correct for image, PDF and .doc/.docx uploads but lived as
// scattered `/hvac/i.test(mode)` checks inside a 300-line branch, and three
// paths had no check at all:
//
//   * .eml uploads always used the refrigeration scope readers
//   * the "Paste Bid Email Text" box was never read by anything
//   * Residential HVAC uploads landed in the COMMERCIAL equipment/parts stores,
//     which the residential page never reads — the upload reported units found
//     and the Equipment step was empty
//
// So the whole decision lives here, in one place, tested.

export const REFRIGERATION = 'Commercial Refrigeration';
export const COMMERCIAL_HVAC = 'Commercial HVAC';
export const RESIDENTIAL_HVAC = 'Residential HVAC';

export const isHvacTrade = mode => /hvac/i.test(String(mode || ''));
export const isResidentialTrade = mode => /residential\s*hvac/i.test(String(mode || ''));

// Which analyzer a TEXT document (.doc/.docx/.eml/pasted email) goes to.
//
// A bid invitation letter keeps its own reader in BOTH trades: it carries
// contacts, a due date, bid-breakdown categories and who-supplies-what, none of
// which is trade-specific. Everything else splits — an HVAC job's scope text is
// a spec section, and the refrigeration scope readers would hunt for RC work
// that is not in it.
export function routeTextDoc({ mode, isBidLetter = false, isFlatScope = false } = {}) {
  if (isBidLetter) return 'bidLetter';
  if (isHvacTrade(mode)) return 'hvacSpec';
  return isFlatScope ? 'flatScope' : 'scopeDoc';
}

// Where an extracted unit or takeoff line LANDS. Residential has its own pair
// of stores and its own page (Step4's ResidentialEquipment), so a residential
// job's units must not go to the commercial list.
export const equipmentKey = mode => (isResidentialTrade(mode) ? 'resEquipment' : 'hvacEquipment');
export const partsKey = mode => (isResidentialTrade(mode) ? 'resParts' : 'hvacParts');

// The residential dropdown is a different, much shorter list than the
// commercial one — a house has no VAV boxes, cooling towers or CRAC units — so
// mapHvacType's answers do not fit it. Kept in sync with RES_EQUIP_TYPES in
// Step4_Materials.jsx.
export const RES_EQUIP_TYPES = [
  'Heat Pump', 'Mini Split', 'Package Unit', 'Split System AC', 'Air Handler',
  'Condenser', 'Gas Furnace', 'Heat Strip', 'ERV/HRV',
];

export function mapResType(t) {
  const s = String(t || '').toLowerCase();
  if (/mini.?split|ductless|\bvrf\b/.test(s)) return 'Mini Split';
  if (/\berv\b|\bhrv\b|energy recovery|heat recovery/.test(s)) return 'ERV/HRV';
  if (/heat\s*strip|electric\s*heat|aux(iliary)?\s*heat/.test(s)) return 'Heat Strip';
  if (/furnace|^gf\b|\bgf-/.test(s)) return 'Gas Furnace';
  if (/package|\brtu\b|rooftop/.test(s)) return 'Package Unit';
  if (/air\s*handl|\bahu\b|^ah\b|\bah-|fan\s*coil|\bfcu\b/.test(s)) return 'Air Handler';
  if (/heat\s*pump|ashp|^hp\b|\bhp-/.test(s)) return 'Heat Pump';
  if (/condens|^cu\b|\bcu-|^ac{1,2}u\b|\bac{1,2}u-/.test(s)) return 'Condenser';
  if (/split|^ac\b|\bac-/.test(s)) return 'Split System AC';
  // The same default the manual "+ Equipment" button uses, so an unreadable
  // type produces a row the estimator corrects rather than an empty one.
  return 'Heat Pump';
}

// A commercial-shaped extraction ({tag, type, model, size, cfm, electrical})
// rewritten for the residential equipment table, which has no tag/voltage/MCA
// columns. Nothing is dropped — the tag and CFM ride along in the notes.
//
// `rawType` is the type as the DOCUMENT wrote it, before mapHvacType turned it
// into a commercial dropdown label. Mapping twice loses information ("heat
// pump" → "Packaged Heat Pump" → "Package Unit"), so the raw text wins.
export function toResEquipment(e = {}) {
  return {
    type: mapResType(e.rawType || e.type || e.tag),
    tons: resTons(e.tons),
    seer: '',
    brand: e.brand || '',
    model: [e.model, e.size].filter(Boolean).join(' '),
    cost: 0,
    notes: [e.tag, e.rawType || e.type, e.cfm && `${e.cfm} CFM`, e.electrical, e.notes]
      .filter(Boolean).join(' · '),
  };
}

// The commercial import reuses the tons column for CFM when a schedule gives
// airflow instead of capacity. A four-digit CFM sitting in a residential tons
// box would silently price a 1,200-ton heat pump off RES_EQUIP_DEFAULTS, so
// only a plausible residential tonnage is carried across.
function resTons(v) {
  const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 && n <= 25 ? String(n) : '';
}
