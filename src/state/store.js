import { pipeDefaultPrice } from '../components/pipePricing.js';
import { touchShopKey } from '../lib/shopSync.js';
import { createContext, useContext, useReducer } from 'react';
import { ootIsItemised, ootBreakdown } from '../components/outOfTown.js';

// ── DEFAULT MATERIAL PRICING ────────────────────────────────────────────────────
// Starting-point contractor prices so a new job computes without hand-entering
// every rate. These are ballpark ACR-copper ($/ft) and Armaflex insulation ($/ft)
// costs — copper especially swings with the commodity market, so they're meant to
// be reviewed and tuned per shop, not treated as gospel. Editable in the Materials
// step, and reloadable there via "Load default prices".
// ACR COPPER, $/ft. Replaced 2026-08-19 from supplier pricing the estimator
// pulled for the Virginia market (United Refrigeration / Bond / Southern Pipe
// territory). The previous table was roughly a THIRD of these — old enough that
// every refrigeration bid built on it was materially light.
//
// Six sizes were quoted as ranges and are the MIDPOINT of each:
//   3/8 $4.50-5.50 · 1/2 $5-7 · 5/8 $7.50-9 · 7/8 $9-11 · 1-1/8 $15-21
//   and "2-1/8 and up" opening at $38.
//
// The rest are derived, not invented. Copper cost tracks the weight of metal in
// the tube, so the gaps interpolate on ACR weight per foot between the two
// quoted sizes that bracket them, and everything above 2-1/8 scales at that
// size's implied $21.70/lb. Sanity check on that: it puts 3-5/8 at $93, inside
// the "$38 to $105+" band the same source gives for the large diameters.
//
// The implied $/lb FALLS as the tube grows — $37/lb at 3/8, $22/lb at 2-1/8 —
// which is real: small tube carries coil and handling overhead that a hard
// length of 2-1/8 does not.
//
// These are a market snapshot, not a quote. Copper moves, and the ranges behind
// the small sizes are wide (1-1/8 spans $15 to $21, a 40% spread). Correct any
// row in the rates panel; an existing job keeps whatever it has already tuned,
// and "Load default prices" pulls this table in fresh.
export const DEFAULT_CU_RATES = {
  '1/4': 3.00, '3/8': 5.00, '1/2': 6.00, '5/8': 8.25, '7/8': 10.00,
  '1-1/8': 18.00, '1-3/8': 22.00, '1-5/8': 27.00, '2-1/8': 38.00, '2-5/8': 54.00, '3-1/8': 72.00,
  '3-5/8': 93.00, '4-1/8': 117.00, '5-1/8': 165.00, '6-1/8': 221.00,
};
// Ballpark national pricing for generated hardware & consumables — same idea
// as the copper table: a fresh job prices itself without hand-entering every
// line, and every number stays editable. The price book (the user's ACTUAL
// prices, saved as they edit) always wins over these.
const DEFAULT_HW_PRICES = [
  [/pipe hangers?/i, 3.50],          // clevis/loop hanger, each
  [/pipe saddles?|insuguard/i, 3.00], // insulation cradle, each
  [/unistrut/i, 25.00],              // 1-5/8" 12ga, 10' stick
  [/all-?thread/i, 8.00],            // 3/8" rod, 10' stick
  [/oxygen/i, 60.00],                // cylinder swap
  [/acetylene/i, 90.00],             // cylinder swap
  [/nitrogen/i, 35.00],              // cylinder swap
  [/brazing rod/i, 110.00],          // 15% silver, per lb
  [/insulation adhesive/i, 22.00],   // per can
  [/spray foam/i, 9.00],             // per can
  [/duct tape/i, 8.00],              // per roll
  [/pvc.*tape|insulation tape/i, 6.00], // per roll
  [/emery cloth|sand cloth/i, 12.00],   // per roll
  [/fire caulk/i, 14.00],            // per tube
  [/refrigerant oil/i, 60.00],       // POE, per gal
];
export function defaultHardwarePrice(desc) {
  const hit = DEFAULT_HW_PRICES.find(([re]) => re.test(desc || ''));
  return hit ? hit[1] : 0;
}

// ── HVAC DEFAULT PRICES ─────────────────────────────────────────────────────────
// Ballpark US contractor-cost defaults so an HVAC takeoff isn't all $0 — close
// enough to rough a number, always editable, and the price book learns the real
// number the first time you correct one. Air devices are per-EACH; the misc
// items match the quick-add chips on the Equipment step.
//
// Duct FOOTAGE lines are deliberately NOT priced here — their cost comes from
// the Duct → Purchase Units calculator (pounds of sheet metal, spiral joints,
// flex boxes, insulation rolls), which carries its own defaults. Pricing the
// footage line too would double-count.
// [pattern, price, UNIT THE PRICE IS PER]. The third column used to be a
// trailing comment, and a comment cannot stop the number being multiplied by
// the wrong quantity — which is exactly what was happening:
//
//   "Ductwork — 8\" flex duct" is a TAKEOFF line whose Qty is linear feet. It
//   matched the flex rule and took $95, the price of a 25-FOOT BOX. Sixty feet
//   of flex came out at $5,700, and then the Duct → Purchase card added the
//   three boxes it actually needs for $285 on top.
//
//   "Linear slot diffuser or grille — 204x4 face" carries its length in FEET,
//   because that is how the device is bought. It matched the grille rule and
//   took $40 EACH, so a single 17-foot device priced at $680.
//
// Now that every row carries the unit it is bought by, the fill can simply
// decline when the price is quoted in something else. See fillDefaults.
const DEFAULT_HVAC_PRICES = [
  // A linear diffuser is sold by the FOOT of device, and its takeoff line
  // carries feet — a 204" tag is a 17-foot device. It has to sit above the
  // grille rules, because the app writes it as "Linear slot diffuser or
  // GRILLE — 204x4 face" and the generic grille rule was catching it first and
  // pricing it $40 each: seventeen diffusers where the plan shows one. ($120
  // "per section" was the old figure and was never per foot either.)
  [/linear\s*(?:slot\s*)?(?:diffuser|grille)|(?:^|\W)LD-?\d/i, 60, 'ft'],
  // Air devices — per each. Bigger face = a bit more; keep it simple by type.
  [/transfer\s*grille|(?:^|\W)TG-?\d/i, 40, 'ea'],
  [/return\s*grille|(?:^|\W)RG-?\d/i, 45, 'ea'],
  [/(?:supply\s*)?grille|register|(?:^|\W)SG-?\d/i, 40, 'ea'],
  [/ceiling\s*diffuser|diffuser|(?:^|\W)CD-?\d/i, 55, 'ea'],
  // Common misc / quick-add HVAC items.
  [/curb\s*adapter/i, 450, 'ea'],
  [/roof\s*curb|curb\s*\/\s*rails|rails/i, 350, 'ea'],
  [/crane|rigging/i, 1200, 'day'],
  [/disconnect|whip/i, 85, 'ea'],
  [/thermostat|bms|controls?/i, 180, 'ea'],
  [/economizer/i, 400, 'ea'],
  [/low[-\s]?ambient/i, 250, 'ea'],
  [/hail\s*guard/i, 150, 'set'],
  [/condensate|p[-\s]?trap|drain/i, 40, 'ea'],
  [/smoke\s*detector/i, 220, 'ea'],
  [/vibration\s*isolation|isolator/i, 120, 'set'],
  [/filter\s*rack|filters?/i, 90, 'ea'],
  [/flex(?:ible)?\s*(?:duct\s*)?connection|transitions?|flex\s*connector/i, 60, 'lot'],
  [/refrigerant\s*line\s*insulation|line\s*insulation/i, 1.5, 'ft'],
  [/refrigerant\b/i, 18, 'lb'],
  [/lineset/i, 120, 'set'],
  // Duct purchase-unit lines (from the calculator) — sane fallbacks if unpriced.
  [/galvanized.*duct|rectangular\s*duct/i, 4.5, 'lb'], // fabricated
  [/spiral.*duct/i, 9, 'ft'],
  [/flex\s*duct/i, 95, 'box'],   // a 25' box, NOT a foot
  [/duct\s*wrap|wrap\s*insulation/i, 115, 'roll'],
];

// Pipe first, and by SIZE. It is the one material here that cannot take a flat
// rate — 1/2" to 6" on one hydronic sheet is a 10x spread — and the generic
// rules below would happily price a condensate line at $40 a foot. Pipe is
// always quoted per foot.
function hvacPriceEntry(desc) {
  const pipe = pipeDefaultPrice(desc);
  if (pipe > 0) return { price: pipe, unit: 'ft' };
  const hit = DEFAULT_HVAC_PRICES.find(([re]) => re.test(desc || ''));
  return hit ? { price: hit[1], unit: hit[2] } : { price: 0, unit: '' };
}

export function defaultHvacPrice(desc) {
  return hvacPriceEntry(desc).price;
}

// What that default price is quoted PER. '' when there is no default at all.
export function defaultHvacPriceUnit(desc) {
  return hvacPriceEntry(desc).unit;
}

// The default price for a row, or 0 when the price is quoted in a different
// unit than the row is measured in.
//
// A takeoff line and a purchase line can carry the same words and mean
// different things — "flex duct" is feet on the one and boxes on the other —
// so the words alone were never enough to decide. Declining is the right
// answer: a $0 line is visibly unpriced and gets priced, while a line filled
// from the wrong basis looks finished and is off by a factor of twenty-five.
export function defaultHvacPriceFor(desc, unit) {
  const { price, unit: basis } = hvacPriceEntry(desc);
  if (!price) return 0;
  if (!unit || !basis) return price;
  return unit === basis ? price : 0;
}

// ── INSULATION WALL THICKNESS — ONE SOURCE OF TRUTH ─────────────────────────
// The wall was hardcoded in three places and they did not agree. The rate table
// described medium-temp suction as 1/2" wall while both the rates panel and the
// generated bid line called it 3/4". Those are different products at meaningfully
// different prices, so the bid was advertising one and priced against the other —
// and nothing on screen showed the disagreement.
//
// Wall now lives here, and the label everywhere else is built from it. Changing
// it changes what the line says, which is the point: the RATE has to be for the
// wall named beside it, and if one moves the other has to.
//
// These defaults are the common supermarket specification. The actual wall comes
// off the job spec — unconditioned space and outdoor runs usually step up — so
// treat them as a starting point, not a rule.
export const INSUL_WALL = {
  medSuction: '3/4"',
  lowSuction: '1"',
  lowLiquid: '1/2"',
};

export const INSUL_CATEGORY_LABEL = {
  medSuction: `Med Temp Suction (${INSUL_WALL.medSuction} wall)`,
  lowSuction: `Low Temp Suction (${INSUL_WALL.lowSuction} wall)`,
  lowLiquid: `Low Temp Liquid (${INSUL_WALL.lowLiquid} wall)`,
};

// Elastomeric (Armaflex-type) $/ft by pipe size, for the wall named above.
// Replaced 2026-08-19 from Virginia market pricing the estimator pulled, quoted
// by SIZE BAND against all three wall thicknesses.
//
// It settled the mismatch this table already carried. Medium-temp suction was
// $2.00/ft at 7/8", which lands inside the source's 1/2"-WALL band ($1.15-2.10)
// and below its 3/4" band ($2.25-3.40) — so the app had been pricing thin wall
// while the bid line advertised thick, exactly as suspected.
//
// The source gives four bands with a low and a high, e.g. 7/8"-1-3/8" at
// $2.25-3.40 for 3/4" wall. Read as the range spanning the sizes IN that band —
// low end is the smallest size, high end the largest — and the sizes between
// interpolate. That is a reading of the source, not something it states.
//
// Outside the quoted bands (1/4", and 5-1/8" and up) cost scales on the
// insulation cross-section, which tracks OD + wall: a bigger tube takes a longer
// sleeve of the same thickness.
//
// Not every category moved the same way. Suction went UP — low-temp suction at
// 7/8" from $2.70 to $4.00, because 1" wall costs what 1" wall costs. Liquid
// went DOWN, $2.15 to $1.15 at the same size, because the old number was never a
// 1/2"-wall price. Both were wrong; they were wrong in opposite directions.
export const DEFAULT_INSUL_RATES = {
  // 3/4" wall — see INSUL_WALL.medSuction.
  medSuction: { '1/4': 1.42, '3/8': 1.60, '1/2': 1.88, '5/8': 2.15, '7/8': 2.25, '1-1/8': 2.83, '1-3/8': 3.40, '1-5/8': 3.65, '2-1/8': 4.90, '2-5/8': 5.50, '3-1/8': 6.67, '3-5/8': 7.83, '4-1/8': 9.00, '5-1/8': 10.85, '6-1/8': 12.69 },
  // 1" wall — the thickest, and the one low-temp suction actually gets.
  lowSuction: { '1/4': 2.73, '3/8': 3.00, '1/2': 3.45, '5/8': 3.90, '7/8': 4.00, '1-1/8': 4.78, '1-3/8': 5.55, '1-5/8': 5.80, '2-1/8': 7.50, '2-5/8': 9.50, '3-1/8': 11.67, '3-5/8': 13.83, '4-1/8': 16.00, '5-1/8': 19.12, '6-1/8': 22.24 },
  // 1/2" wall — low-temp liquid.
  lowLiquid: { '1/4': 0.60, '3/8': 0.70, '1/2': 0.90, '5/8': 1.10, '7/8': 1.15, '1-1/8': 1.63, '1-3/8': 2.10, '1-5/8': 2.20, '2-1/8': 3.30, '2-5/8': 3.80, '3-1/8': 4.70, '3-5/8': 5.60, '4-1/8': 6.50, '5-1/8': 7.91, '6-1/8': 9.31 },
};

// ── INITIAL STATE ──────────────────────────────────────────────────────────────
// preferredSupplier starts as 'RE Michel' here for safety (this module can't import
// from components/PriceBook.jsx without a circular import risk). Wizard.jsx applies
// the real global default on RESET/new job — see applyDefaultSupplier() usage there.
export const OOT_BASES = ['crew', 'person'];
export const DEFAULT_OOT_BASIS = 'crew';

export const initialState = {
  mode: 'Commercial Refrigeration',
  // Refrigeration system type. CO₂ transcritical (R-744) uses K65 copper-iron
  // alloy and high-pressure (1300+ psi) fittings instead of standard ACR copper,
  // so the generated material list and refrigerant change with it.
  systemType: 'HFC',   // 'HFC' | 'CO2'
  // Secondary loop is a SEPARATE axis from the refrigerant above. A glycol store
  // still has a primary circuit in the machine room — glycol is what that
  // circuit cools, not what it runs on — so CO₂ low temp alongside a glycol
  // medium temp is one job, and a single three-way toggle would have forced a
  // choice the job does not make.
  secondaryLoop: 'none',   // 'none' | 'glycol' | 'water'
  // Shared suction header, or home run — see components/headers.js. A DIFFERENT
  // question from secondaryLoop above, which is about the working fluid; this
  // one is about how the suction piping is laid out, and a DX store can be
  // either. Empty means nobody has said, which is NOT the same as home run:
  // unset still lets the double-counted-header check speak up, and 'homeRun'
  // silences it because that is an answer rather than an omission.
  pipingLayout: '',        // '' | 'sharedHeader' | 'homeRun'
  projName: '', projAddr: '', storeNumber: '', projGC: '', projCont: '', projBidDate: '',
  // Key bid dates a refrigeration estimator needs up front.
  preconDate: '',       // pre-construction meeting
  rcStartDate: '',      // RC night-work / case-move start
  rccDate: '',          // final store RCC (refrigeration commissioning check)
  jobLength: '',        // total job length (e.g. "16 weeks")
  uploadedFiles: [], extractionResults: [], flags: [],
  // How extracted scope tasks are treated. 'notes' (default): tasks are
  // reference notes and labor is estimated in bulk (crew/periods/labor units).
  // 'lineItems': each task becomes a billable Field Work / Rack labor line, for
  // shops that bid task-by-task. Dated schedule items and redline callouts are
  // always notes regardless.
  taskBidMode: 'notes',
  // ── LUMP SUM OR TIME AND MATERIALS ─────────────────────────────────────────
  // Crew-and-calendar and per-circuit hours are two prices for the SAME work,
  // and bidTotals used to add both. Whichever method a job is bid on owns its
  // labor total; the other stays visible and editable as reference.
  //
  // Deliberately EMPTY rather than defaulting to one. LOAD_JOB spreads over
  // initialState, so a default here would reach into every job saved before
  // this existed and change what it totals. Empty means "bill both", which is
  // exactly what those jobs already do, and the Labor step asks for a choice.
  bidMethod: '',
  // What this shop pays for night work, seeding every night period on the job.
  // Was hardcoded at 1.5 inside the period constructor, which meant a shop
  // could not store its own — and on a grocery remodel nights are most of the
  // hours. A period can still be overridden individually.
  nightPremium: 1.5,
  circuits: [],
  // Shared suction headers on a LOOP system — one pipe every circuit taps.
  // Kept separate from circuits so it is bought ONCE: rolled into a circuit's
  // run length it would be bought once per circuit.
  // Shape: { id, label, size, lengthFt, lineType: 'suction'|'liquid', tempType }
  headers: [],
  // Equipment pressure drops read off the submittals — chiller barrel, coils,
  // valve train. Persisted rather than held in the card because it is paperwork
  // data: it costs real time to look up and nobody should re-key it because a
  // tab was closed. Shape is newComponent() in components/equipmentHead.js.
  glycolComponents: [],
  // Cross-sheet facts read off analysed drawings — pump design points, control
  // setpoints, fluid concentrations — each tagged with the sheet that said so.
  // Kept because the errors worth catching are only visible when two sheets are
  // compared, and no per-sheet check can see them. See api/jobFacts.js.
  jobFacts: [],
  rackParts: [], rackTasks: [],
  lineItems: [],
  supplyItems: [],
  fieldTasks: [],
  // Dated RC schedule items — separate from fieldTasks (which is the labor-hours
  // input table). This is a read-only-ish reference list of "here's what RC has
  // to do and when" pulled from schedule documents, for the Job Info view.
  // Shape: { id, date, desc, circuitRef, notes }
  rcSchedule: [],
  rates: {
    // Pre-filled with default contractor pricing (see DEFAULT_CU_RATES) so a new
    // job estimates copper without hand-entering every size; fully editable.
    cu: { ...DEFAULT_CU_RATES },
    // Insulation rates are per pipe size, per temp/line category — mirrors the copper rate shape.
    // e.g. rates.insul.medSuction['3/8'] = 2.10
    insul: {
      medSuction: { ...DEFAULT_INSUL_RATES.medSuction },
      lowSuction: { ...DEFAULT_INSUL_RATES.lowSuction },
      lowLiquid: { ...DEFAULT_INSUL_RATES.lowLiquid },
    },
    fittingsMarkupPct: 25,
    // K65 costs a multiple of ACR copper, and the premium moves with the copper
    // market plus specialty distribution — so it rides on the tuned ACR rate
    // rather than being a second absolute price that goes stale on its own.
    hpPipeMultiplier: 2.0,
    // 'percentage' = auto allowance line based on % of copper cost.
    // 'manual' = no allowance line; fittings are added one-by-one via the fitting picker.
    fittingsMode: 'percentage',
    wasteFactor: 10,
    // Distance between pipe supports, in feet. 6 is the Food Lion spec and the
    // most common one, but it is a SPEC — it changes by chain and by job, and
    // it drives the saddle count, so it is a setting rather than a constant
    // buried in the takeoff.
    hangerSpacingFt: 6,
  },
  laborPeriods: [],
  // Two ways to bid commercial labor. 'periods' (default): phase-by-phase crews
  // (rack prep, case-move nights, startup...). 'flat': one crew for the whole
  // job length — "4 guys for 27 weeks" — the way many shops actually bid it.
  laborMode: 'periods',
  flatJob: { crew: [], weeks: 0, daysPerWeek: 5, ootPerDay: 0 },
  // Out-of-town expense. `outOfTown: false` zeroes it for an in-town job
  // without wiping the per-day figure, so a similar travelling job can be
  // copied and switched back on. See ootCost() for why the basis defaults the
  // way it does.
  outOfTown: true,
  ootBasis: DEFAULT_OOT_BASIS,
  // Meals, hotel and fuel, each with the multiplier it actually has. Empty
  // until somebody fills one in, and until then the flat ootPerDay above is
  // the live number. See components/outOfTown.js.
  ootRates: undefined,
  // Editable labor-unit assumptions for deriving hours from circuits (see
  // estimateCircuitLabor / DEFAULT_LABOR_UNITS). Undefined falls back to defaults.
  laborUnits: undefined,
  // How many men go on one circuit. NOT part of the cost arithmetic — the units
  // are man-hours and stay man-hours. This only decides whether a generated
  // task is written down as one man for 24 hours or three men for 8, which is
  // the difference between a row an estimator can read and one he has to
  // translate. Two by default; a working estimator's first question about the
  // old output was "who runs 150 feet of copper on their own?"
  circuitCrewSize: 2,
  // ── WHAT A CREW RATE MEANS ─────────────────────────────────────────────────
  // The rate field said only "Rate/hr", and the two things it can be price very
  // differently. On a $200k-material, $378k-labor job at 20% markup:
  //
  //   billing rate (wage + burden + overhead + PROFIT inside it)  24-34% margin
  //   burdened cost (wage + taxes + comp + insurance, no profit)   6.5% margin
  //
  // 'billing' means the rate is already a sell price, so markup must NOT be
  // applied again — that is the behaviour this app has always had, and it stays
  // the default so nothing reprices. 'cost' means the rate is what the job costs
  // the shop, and the markup has to carry labor the way it carries copper.
  laborRateBasis: 'billing',   // 'billing' | 'cost'
  // Optional, and only meaningful on a billing rate: roughly what share of the
  // billed rate is actual burdened cost. Without it the profit sitting inside
  // the labor rate is invisible, so the bid's true margin cannot be worked out
  // and the app says so rather than printing a number that ignores it.
  laborCostRatio: '',
  markupPct: 20,
  // Equipment markup is tracked separately from material markup because a big
  // packaged unit shouldn't carry the same margin as copper and consumables.
  // Empty = "use the material markup" (no behavior change); set a number to
  // mark equipment up at its own rate. Applies to HVAC + Residential equipment.
  equipMarkupPct: '',
  // Subcontractors (electrical, crane/rigging, controls, insulation, demo…) as
  // first-class pass-through cost rows, with an optional blanket markup.
  subcontractors: [],   // { id, desc, cost }
  // Rented equipment — lifts, reefer trailers, dumpsters, light towers. Priced
  // by TIME, which is what makes it different from everything else on a bid,
  // and it had no line anywhere until now. See components/rentals.js.
  rentals: [],          // { id, desc, qty, unit, rate, notes }
  rentalMarkupPct: 0,
  // Rental is taxable in most states; materialsTaxPct is charged on materials
  // only. Its own rate because some states tax rental differently from goods.
  rentalTaxPct: 0,
  subMarkupPct: 0,
  // Sales/use tax applied to the marked-up materials+equipment sell price.
  // Defaults to 0 so it's opt-in and never silently changes an existing bid.
  materialsTaxPct: 0,
  // Material price movement between bidding and buying. Applies to MATERIAL
  // only and defaults to 0 so it is opt-in and never silently changes a bid.
  escalationPct: 0,
  // Small tools, gases, rod, abrasives and tape — a percentage of LABOR, since
  // they burn with man-hours rather than with material dollars.
  consumablesPct: 0,
  bondPct: 0,        // payment & performance bond, % of bid
  permitFee: 0,      // flat permit/fees
  bidValidDays: 30,  // proposal validity period (days)
  // The contractor's own conditions of bid, printed on the proposal. Editable
  // and shop-level, because payment terms and change-order language are
  // commercial positions that belong to the company. Seeded from
  // DEFAULT_PROPOSAL_TERMS in components/proposalTerms.js.
  proposalTerms: undefined,
  // What the price stands on. A proposal that does not say what it was priced
  // from cannot defend itself when a revision turns up.
  bidBasis: { drawings: [], specSection: '', addenda: [], dated: '' },
  // Standard bid exclusions/qualifications — the contractual scope fence shown
  // on the proposal. Seeded with common mechanical exclusions; fully editable.
  exclusions: [
    'Line-voltage electrical wiring, disconnects, and final power connections',
    'Cutting, patching, core drilling, and structural modifications',
    'Fire-stopping and fire-sealing of penetrations',
    'Roofing, flashing, and roof curbs (by others)',
    'Painting, finish work, and architectural finishes',
    'Concrete, housekeeping pads, and structural steel',
    'Permits, fees, and inspections unless explicitly noted',
    'Controls/BMS programming and integration unless noted',
    'Overtime and premium-time labor unless noted',
    'Temporary heating, cooling, or refrigeration',
  ],
  scenarios: {
    active: 'mid',
    low:  { label:'Low',  markupPct:15, desc:'Tight margin, competitive' },
    mid:  { label:'Mid',  markupPct:20, desc:'Standard margin' },
    high: { label:'High', markupPct:28, desc:'Full scope, premium' },
  },
  // Residential HVAC
  resEquipment: [],
  resParts: [],
  resLinesetType: 'preinsulated',
  resLinesetTotal: 0,
  resSucSize: '',
  resLiqSize: '',
  resLineLength: '',
  // Estimated utility/manufacturer rebate — shown to the homeowner as a credit
  // against their net cost (a closing tool); does not reduce the contractor's bid.
  resRebate: 0,
  // Commercial HVAC
  hvacEquipment: [],
  hvacParts: [],
  // Shared
  preferredSupplier: 'RE Michel',
  jobMemory: {},
  // Calibration: actual costs entered after a job completes, to compare against
  // the estimate and tune labor units / rates. { materials, labor, subs, other }.
  actuals: {},
  actualNotes: '',
};

// ── REDUCER ────────────────────────────────────────────────────────────────────
export function reducer(state, action) {
  switch (action.type) {
    case 'SET':
      return { ...state, [action.key]: action.value };

    case 'MERGE':
      return { ...state, ...action.payload };

    case 'SET_RATE':
      return { ...state, rates: { ...state.rates, cu: { ...state.rates.cu, [action.size]: action.value } } };

    case 'LOAD_DEFAULT_RATES':
      // Reload the built-in default copper + insulation prices (leaves fittings %
      // and waste factor as the user set them).
      return { ...state, rates: {
        ...state.rates,
        cu: { ...DEFAULT_CU_RATES },
        insul: {
          medSuction: { ...DEFAULT_INSUL_RATES.medSuction },
          lowSuction: { ...DEFAULT_INSUL_RATES.lowSuction },
          lowLiquid: { ...DEFAULT_INSUL_RATES.lowLiquid },
        },
      } };

    case 'SET_INSUL_RATE':
      // action.category: 'medSuction' | 'lowSuction' | 'lowLiquid'
      // action.size: pipe size key, e.g. '3/8'
      return {
        ...state,
        rates: {
          ...state.rates,
          insul: {
            ...state.rates.insul,
            [action.category]: {
              ...(state.rates.insul?.[action.category] || {}),
              [action.size]: action.value,
            },
          },
        },
      };

    case 'SET_RATES_MISC':
      return { ...state, rates: { ...state.rates, [action.key]: action.value } };

    // Circuits
    case 'ADD_CIRCUIT':
      return { ...state, circuits: [...state.circuits, action.circuit] };
    case 'UPDATE_CIRCUIT':
      return { ...state, circuits: state.circuits.map(c => c.id === action.id ? { ...c, ...action.updates } : c) };
    case 'REMOVE_CIRCUIT':
      return { ...state, circuits: state.circuits.filter(c => c.id !== action.id) };

    // Rack parts
    case 'ADD_RACK_PART':
      return { ...state, rackParts: [...state.rackParts, action.part] };
    case 'UPDATE_RACK_PART':
      return { ...state, rackParts: state.rackParts.map(p => p.id === action.id ? { ...p, ...action.updates } : p) };
    case 'REMOVE_RACK_PART':
      return { ...state, rackParts: state.rackParts.filter(p => p.id !== action.id) };

    // Rack tasks
    case 'ADD_RACK_TASK':
      return { ...state, rackTasks: [...state.rackTasks, action.task] };
    case 'UPDATE_RACK_TASK':
      return { ...state, rackTasks: state.rackTasks.map(t => t.id === action.id ? { ...t, ...action.updates } : t) };
    case 'REMOVE_RACK_TASK':
      return { ...state, rackTasks: state.rackTasks.filter(t => t.id !== action.id) };

    // Labor periods
    case 'ADD_LABOR_PERIOD':
      return { ...state, laborPeriods: [...state.laborPeriods, action.period] };
    case 'UPDATE_LABOR_PERIOD':
      return { ...state, laborPeriods: state.laborPeriods.map(p => p.id === action.id ? { ...p, ...action.updates } : p) };
    case 'REMOVE_LABOR_PERIOD':
      return { ...state, laborPeriods: state.laborPeriods.filter(p => p.id !== action.id) };

    // Supply items
    case 'ADD_SUPPLY_ITEM':
      return { ...state, supplyItems: [...state.supplyItems, action.item] };
    case 'UPDATE_SUPPLY_ITEM':
      return { ...state, supplyItems: state.supplyItems.map(i => i.id === action.id ? { ...i, ...action.updates } : i) };
    case 'REMOVE_SUPPLY_ITEM':
      return { ...state, supplyItems: state.supplyItems.filter(i => i.id !== action.id) };

    // RC Schedule (dated tasks, for the Job Info view — separate from fieldTasks)
    case 'ADD_RC_SCHEDULE_ITEM':
      return { ...state, rcSchedule: [...(state.rcSchedule || []), action.item] };
    case 'ADD_RC_SCHEDULE_ITEMS':
      return { ...state, rcSchedule: [...(state.rcSchedule || []), ...action.items] };
    case 'UPDATE_RC_SCHEDULE_ITEM':
      return { ...state, rcSchedule: (state.rcSchedule || []).map(i => i.id === action.id ? { ...i, ...action.updates } : i) };
    case 'REMOVE_RC_SCHEDULE_ITEM':
      return { ...state, rcSchedule: (state.rcSchedule || []).filter(i => i.id !== action.id) };

    // Scenarios
    case 'SET_SCENARIO_MARKUP':
      return { ...state, scenarios: { ...state.scenarios, [action.key]: { ...state.scenarios[action.key], markupPct: action.value } } };
    case 'SELECT_SCENARIO':
      return { ...state, scenarios: { ...state.scenarios, active: action.key }, markupPct: state.scenarios[action.key].markupPct };

    // Job management
    case 'LOAD_JOB':
      return { ...initialState, ...action.data };
    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}

// ── CONTEXT ────────────────────────────────────────────────────────────────────
export const StateContext = createContext(null);

export function useStore() {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error('useStore must be used within StateProvider');
  return ctx;
}

// ── HELPERS ────────────────────────────────────────────────────────────────────
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
}

export function normalizePipeSize(s) {
  if (!s) return '';
  s = String(s).replace(/"/g, '').trim();
  const dec = {
    '0.25':'1/4','0.375':'3/8','0.5':'1/2','0.625':'5/8','0.875':'7/8',
    '1.125':'1-1/8','1.375':'1-3/8','1.625':'1-5/8','2.125':'2-1/8',
    '2.625':'2-5/8','3.125':'3-1/8',
  };
  if (dec[s]) return dec[s];
  return s.replace(/\s+/g, '-');
}

export function fmt(n) {
  return '$' + Math.round(n || 0).toLocaleString();
}

export function fmtDec(n) {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── LOCAL STORAGE ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'coldgauge_jobs_v2';

// Why the last saveJob failed, for the UI to show. A silent save failure is
// the worst bug an estimating tool can have — the estimator keeps working on a
// bid that isn't being persisted — so failures are reported, never swallowed.
let lastSaveError = '';
export function getLastSaveError() { return lastSaveError; }

// Browsers signal a full localStorage with QuotaExceededError (code 22) or, on
// Safari/iPad, the legacy name below. Worth naming exactly: the fix the user
// needs (delete old jobs / sign in to sync) is different from a generic error.
function isQuotaError(e) {
  return e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
}

export function saveJob(state) {
  try {
    const jobs = loadAllJobs();
    const id = state.jobId || uid();
    // Blob URLs (uploadedFiles[].previewUrl) are session-scoped — they're dead
    // links after a reload, so storing them wastes quota and leaves a "View"
    // button that opens nothing. Drop them on the way to disk.
    const data = { ...state, jobId: id };
    if (Array.isArray(data.uploadedFiles)) {
      data.uploadedFiles = data.uploadedFiles.map(({ previewUrl, ...f }) => f);
    }
    jobs[id] = {
      id,
      name: state.projName || 'Untitled',
      mode: state.mode,
      lastEdited: new Date().toISOString(),
      data,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    lastSaveError = '';
    return id;
  } catch (e) {
    lastSaveError = isQuotaError(e)
      ? 'Browser storage is full. Delete old jobs under 💾 Jobs (or sign in, so jobs sync to the cloud) — then save again.'
      : `Save failed: ${e?.message || 'unknown error'}`;
    console.warn('Save failed:', e);
    return null;
  }
}

export function loadAllJobs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

// Guarded like saveJob and saveAllJobs. This one matters more than it looks:
// the quota message above tells the user to "delete old jobs" to recover from
// full storage, so an unguarded throw here breaks the documented way out of the
// error. A browser with storage disabled throws on write even when the write
// would SHRINK the data.
export function deleteJob(id) {
  try {
    const jobs = loadAllJobs();
    delete jobs[id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    lastSaveError = '';
    return true;
  } catch (e) {
    lastSaveError = `Delete failed: ${e?.message || 'browser storage is unavailable'}`;
    console.warn('Delete failed:', e);
    return false;
  }
}

// Write the whole jobs map at once — used by the cloud-sync layer to land the
// merged local+cloud set after a login.
export function saveAllJobs(jobs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs || {})); return true; }
  catch (e) { console.warn('saveAllJobs failed:', e); return false; }
}

// Look up one saved job's full state for loading into the wizard.
export function loadJob(id) {
  const jobs = loadAllJobs();
  return jobs[id]?.data || null;
}

// ── BACKUP / RESTORE ───────────────────────────────────────────────────────────
// Jobs live in this browser's localStorage. Until there's a cloud account,
// export/import is the safety net against data loss and the way to move bids
// between devices. Export wraps all jobs in a versioned envelope; import merges
// them in (incoming jobs win on id collision), tolerating a raw jobs object too.
export function exportAllJobsJSON() {
  return JSON.stringify({ app: 'coldgauge', version: 2, exportedAt: new Date().toISOString(), jobs: loadAllJobs() }, null, 2);
}

// ── COMPANY PROFILE ──────────────────────────────────────────────────────────
// The contractor's own company details — global (same across every job) and
// printed on the proposal so a bid goes out on YOUR letterhead, not "Coldgauge".
const COMPANY_KEY = 'coldgauge_company_v1';

export function loadCompanyProfile() {
  try { return JSON.parse(localStorage.getItem(COMPANY_KEY) || '{}') || {}; }
  catch { return {}; }
}

export function saveCompanyProfile(profile) {
  try { localStorage.setItem(COMPANY_KEY, JSON.stringify(profile || {})); touchShopKey(localStorage, COMPANY_KEY); }
  catch (e) { console.warn('Company profile save failed:', e); }
}

export function importJobsJSON(text) {
  const data = JSON.parse(text);
  const incoming = data && data.jobs ? data.jobs : data; // accept enveloped or raw
  if (!incoming || typeof incoming !== 'object') throw new Error('Not a Coldgauge backup file');
  const jobs = loadAllJobs();
  let count = 0;
  for (const [id, job] of Object.entries(incoming)) {
    if (job && job.data) { jobs[id] = job; count++; }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch (e) {
    // Say which failure this is. "QuotaExceededError" on a restore reads as a
    // corrupt backup file; it is the opposite — the file was fine and there is
    // no room for it.
    throw new Error(isQuotaError(e)
      ? 'Browser storage is full — delete old jobs under 💾 Jobs, then import again.'
      : `Import failed: ${e?.message || 'unknown error'}`);
  }
  return count;
}

// ── OUT-OF-TOWN EXPENSE ──────────────────────────────────────────────────────
// Out-of-town cost was `ootPerDay × days`, with the crew size nowhere in it. On
// a whole-job crew of four running 27 weeks that is $20,250 where the real
// number is $81,000 — an estimator typing "150" means per diem, and per diem is
// per person per day. GSA publishes it per person, union agreements pay it per
// person, and the IRS treats it per person. Four men do not share a hotel room.
//
// BOTH BASES ARE REAL, WHICH IS WHY THIS IS A CHOICE AND NOT A MIGRATION.
// A lump travel allowance, or one truck and one hotel bill carried as a daily
// figure, genuinely is per crew-day. So the basis is stated rather than assumed.
//
// THE DEFAULT STAYS ON THE OLD BEHAVIOUR ON PURPOSE. Jobs load as
// { ...initialState, ...saved }, so any default put here reaches every bid
// already saved. Defaulting to per-person would silently add tens of thousands
// to open bids nobody reopened. The Labor step shows both numbers side by side
// and the estimator makes the call.

// Who is actually away. A member is travelling unless explicitly marked not —
// a crew entered before this existed is all-travelling, which is what the
// entered figure assumed.
export function crewTravelCount(crew) {
  return (crew || []).filter(m => m && m.travels !== false).length;
}

export function ootCost(days, ootPerDay, crew, { ootBasis = DEFAULT_OOT_BASIS, outOfTown = true, ootRates, nights } = {}) {
  if (outOfTown === false) return 0;
  const d = parseFloat(days) || 0;
  if (!(d > 0)) return 0;
  // ITEMISED WINS. Meals, hotel and fuel each multiply differently — see
  // components/outOfTown.js — and once a shop has put money in any of them,
  // that is the live number. The flat per-day figure below is what every job
  // used before, and a job that has never been itemised still prices on it,
  // so nothing repriced when this shipped.
  if (ootIsItemised(ootRates)) {
    return ootBreakdown({ days: d, nights, travelers: crewTravelCount(crew), rates: ootRates }).total;
  }
  const per = parseFloat(ootPerDay) || 0;
  if (!(per > 0)) return 0;
  if (ootBasis === 'person') return per * d * crewTravelCount(crew);
  return per * d;
}

// The one place the job's OOT settings are read, so every caller agrees.
export function ootOpts(state) {
  return {
    ootBasis: state?.ootBasis || DEFAULT_OOT_BASIS,
    outOfTown: state?.outOfTown !== false,
    // The itemised rates are a JOB setting (and a shop default), not a
    // per-period one — a crew does not get a different hotel rate on Tuesday.
    // Nights stay per period, because that is where the days are.
    ootRates: state?.ootRates,
  };
}

// ── OVERTIME ─────────────────────────────────────────────────────────────────
// The multiplier used to apply to the WHOLE shift, so a ten-hour day could only
// be billed all-straight or all-premium. Neither is what a ten-hour day costs.
// On a four-man crew at $75 over 135 days:
//
//   otMult 1    all straight        $405,000     short by $40,500
//   CORRECT     8 straight + 2 OT   $445,500
//   otMult 1.5  blanket premium     $607,500     over by $162,000
//
// The right answer was not expressible at all. One of those loses the job and
// the other loses money on it.
//
// A WHOLE-SHIFT PREMIUM IS ALSO REAL, which is why the threshold is what
// changes rather than the multiplier. A Saturday, a holiday, a shutdown — the
// entire shift is at premium and no threshold applies. Night work already has
// its own multiplier and keeps it, because a night differential genuinely does
// cover the whole shift.
//
// THE THRESHOLD DEFAULTS TO OFF, so every saved bid costs exactly what it did.
// Set it to 8 and the day splits properly.
//
// DAILY AND WEEKLY ARE DIFFERENT RULES AND THEY DISAGREE ON REAL SCHEDULES.
// Overtime is owed past eight in a day (California, many union agreements) or
// past forty in a week (the federal default), and the compressed schedules
// contractors actually run land on opposite sides of that:
//
//   sched   hrs/wk   OT by daily>8   OT by weekly>40
//   4x10      40           8                0        <- daily OVERcharges
//   5x10      50          10               10           they agree
//   6x8       48           0                8        <- daily UNDERcharges
//   5x8       40           0                0           they agree
//
// A four-ten is exactly forty hours and owes nothing federally, but a daily
// threshold bills eight overtime hours a week — $32,400 on a four-man crew at
// $75 over 27 weeks. Six eights is the reverse and was the limitation this
// module carried until now.
//
// So both thresholds exist and each is optional. Set the one your jurisdiction
// or agreement uses; set both and the greater of the two applies, which is how
// a state with a daily rule stacks on top of the federal weekly one.
export const STANDARD_DAY_HOURS = 8;
export const STANDARD_WEEK_HOURS = 40;
export const DAYS_PER_WEEK_OPTIONS = [4, 5, 6];

// Overtime hours ONE person works in ONE day, under whichever rules are set.
// Weekly overtime is spread back across the week's days so that a period of
// part-weeks costs correctly rather than only whole ones.
export function memberOtHours(member, { otAfterHours = 0, weeklyOtHours = 0, daysPerWeek = 0 } = {}) {
  const hrs = parseFloat(member?.hrsPerDay) || STANDARD_DAY_HOURS;
  const t = parseFloat(otAfterHours) || 0;
  const w = parseFloat(weeklyOtHours) || 0;
  const dpw = parseFloat(daysPerWeek) || 0;
  const daily = t > 0 ? Math.max(0, hrs - t) : 0;
  const weekly = (w > 0 && dpw > 0) ? Math.max(0, hrs * dpw - w) / dpw : 0;
  return Math.max(daily, weekly);
}

// One crew's cost for one day, hour by hour.
export function crewDayCost(crew, {
  otMult = 1, otAfterHours = 0, weeklyOtHours = 0, daysPerWeek = 0, shiftMult = 1,
} = {}) {
  const m = parseFloat(otMult) || 1;
  const sm = parseFloat(shiftMult) || 1;
  const anyThreshold = (parseFloat(otAfterHours) || 0) > 0
    || ((parseFloat(weeklyOtHours) || 0) > 0 && (parseFloat(daysPerWeek) || 0) > 0);
  return (crew || []).reduce((s, mem) => {
    const rate = parseFloat(mem?.rate) || 0;
    const hrs = parseFloat(mem?.hrsPerDay) || STANDARD_DAY_HOURS;
    // No threshold at all: the multiplier is a whole-shift premium, which is
    // what it has always meant here.
    if (!anyThreshold) return s + rate * hrs * m * sm;
    const ot = memberOtHours(mem, { otAfterHours, weeklyOtHours, daysPerWeek });
    return s + rate * ((hrs - ot) + ot * m) * sm;
  }, 0);
}

// Straight and overtime hours in one day, for showing the split.
export function dayHourSplit(crew, otAfterHours = 0, opts = {}) {
  const cfg = typeof otAfterHours === 'object'
    ? otAfterHours
    : { otAfterHours, ...opts };
  let straight = 0, ot = 0;
  for (const mem of crew || []) {
    const hrs = parseFloat(mem?.hrsPerDay) || STANDARD_DAY_HOURS;
    const o = memberOtHours(mem, cfg);
    straight += hrs - o;
    ot += o;
  }
  return { straight, ot };
}

// Do the two rules disagree on this schedule? Returns null when only one is in
// play, or when they land on the same answer — 5x10 and 5x8 both agree, and
// there is nothing to say about those.
export function otRuleConflict(crew, { daysPerWeek = 0, otAfterHours = 0, weeklyOtHours = STANDARD_WEEK_HOURS } = {}) {
  const dpw = parseFloat(daysPerWeek) || 0;
  const t = parseFloat(otAfterHours) || 0;
  const w = parseFloat(weeklyOtHours) || 0;
  if (!(dpw > 0) || !(t > 0) || !(w > 0)) return null;
  let daily = 0, weekly = 0, hrsPerWeek = 0;
  for (const mem of crew || []) {
    const hrs = parseFloat(mem?.hrsPerDay) || STANDARD_DAY_HOURS;
    daily += Math.max(0, hrs - t) * dpw;
    weekly += Math.max(0, hrs * dpw - w);
    hrsPerWeek = Math.max(hrsPerWeek, hrs * dpw);
  }
  if (daily === weekly) return null;
  return {
    dailyOtHours: daily, weeklyOtHours: weekly, hrsPerWeek,
    dailyHigher: daily > weekly,
  };
}

// ── LABOR CALCULATIONS ─────────────────────────────────────────────────────────
export function calcLaborPeriodCost(period, opts = {}) {
  // Each crew member contributes rate × their own hours/day, with hours past
  // the overtime threshold paid at the multiplier. hrsPerDay defaults to 8.
  const nightMult = period.isNight ? (parseFloat(period.nightMult) || 1.5) : 1;
  const days = parseFloat(period.days) || 0;
  // Nights ride with the PERIOD, because that is where the days are — a crew
  // that drives home on Friday sleeps four nights on a five-day period.
  const oot = ootCost(days, period.ootPerDay, period.crew, { ...opts, nights: period.nights });
  const labor = crewDayCost(period.crew, {
    otMult: period.otMult,
    otAfterHours: period.otAfterHours,
    weeklyOtHours: period.weeklyOtHours,
    daysPerWeek: period.daysPerWeek,
    shiftMult: nightMult,
  }) * days;
  return { labor, oot, total: labor + oot };
}

export function calcTotalLabor(laborPeriods, opts = {}) {
  return (laborPeriods || []).reduce((s, p) => {
    const { total } = calcLaborPeriodCost(p, opts);
    return s + total;
  }, 0);
}

// ── WHOLE-JOB (FLAT) CREW ────────────────────────────────────────────────────
// "4 guys for 27 weeks" — one crew carried for the full job length instead of
// phase-by-phase periods. Cost = per-man day rate (rate × hrs/day) × total
// days (weeks × days per week), plus out-of-town per day.
export function calcFlatJobCost(flat, opts = {}) {
  const f = flat || {};
  const days = (parseFloat(f.weeks) || 0) * (parseFloat(f.daysPerWeek) || 5);
  // Flat mode carried NO overtime handling at all — a whole-job crew on ten-hour
  // days billed every hour straight, and this is precisely the long-duration job
  // where ten-hour days happen. Both fields default to absent, so a saved flat
  // job costs exactly what it did.
  const labor = crewDayCost(f.crew, {
    otMult: f.otMult,
    otAfterHours: f.otAfterHours,
    weeklyOtHours: f.weeklyOtHours,
    daysPerWeek: f.daysPerWeek,
  }) * days;
  const oot = ootCost(days, f.ootPerDay, f.crew, { ...opts, nights: f.nights });
  return { days, labor, oot, total: labor + oot };
}

// Mode-aware labor total and crew — the ONE pair of accessors the bid engine
// and the rack/field task costing use, so switching labor modes moves the
// entire bid consistently (rack and field tasks price off whichever crew is
// actually bid, flat or first-period).
// Labor total INCLUDES out-of-town — the bid engine backs it out again to show
// it as its own category. Both halves must therefore read the same basis, or
// `labor = laborTotal - oot` silently understates labor by the difference.
export function jobLaborTotal(state) {
  const o = ootOpts(state);
  return state?.laborMode === 'flat'
    ? calcFlatJobCost(state.flatJob, o).total
    : calcTotalLabor(state?.laborPeriods, o);
}

export function jobCrew(state) {
  return state?.laborMode === 'flat'
    ? (state.flatJob?.crew || [])
    : primaryCrew(state?.laborPeriods);
}

// Out-of-town expenses across the whole job, mode-aware. Food Lion bid
// letters require OOT broken out as its own category, separate from labor.
export function jobOOTTotal(state) {
  const o = ootOpts(state);
  if (state?.laborMode === 'flat') return calcFlatJobCost(state?.flatJob, o).oot;
  return (state?.laborPeriods || []).reduce((s, p) => s + calcLaborPeriodCost(p, o).oot, 0);
}

// ── IS ANY OVERTIME ACTUALLY OWED? ───────────────────────────────────────────
// This asked only whether anyone worked past eight in a day, and told the
// estimator the bid was short whenever they did. On a four-ten that is wrong:
// forty hours is forty hours, no overtime is owed federally, and the warning
// pushed toward adding $32,400 that nobody is due. A five-eight and a four-ten
// are the same week and must read the same.
//
// So the question is the WEEK, not the day. Past forty and something is owed
// and is not being charged. At forty or under, long days are just long days —
// unless a state daily rule or an agreement carries one, which is a fact about
// the job that no drawing states and the app must not assume.
//
// A period stores total days with no calendar, so its week is unknown unless
// daysPerWeek was set on it. Unknown is reported as unknown rather than guessed.
export function otReview(state) {
  const flat = state?.laborMode === 'flat';
  const units = flat ? [state?.flatJob || {}] : (state?.laborPeriods || []);

  let daysAffected = 0, hrsPerWeek = 0, weekKnown = true, anyLongDay = false;
  for (const u of units) {
    const days = flat
      ? (parseFloat(u.weeks) || 0) * (parseFloat(u.daysPerWeek) || 5)
      : (parseFloat(u.days) || 0);
    if (!(days > 0)) continue;
    const longest = (u.crew || []).reduce(
      (mx, m) => Math.max(mx, parseFloat(m?.hrsPerDay) || STANDARD_DAY_HOURS), 0);
    if (!(longest > 0)) continue;
    const dpw = parseFloat(u.daysPerWeek) || 0;
    const week = dpw > 0 ? longest * dpw : 0;
    // Either half of the schedule can put a crew into overtime, and they are
    // not the same half: six eights passes forty without any day passing eight.
    const longDay = longest > STANDARD_DAY_HOURS;
    const longWeek = week > STANDARD_WEEK_HOURS;
    if (!longDay && !longWeek) continue;
    anyLongDay = true;
    if (dpw > 0) hrsPerWeek = Math.max(hrsPerWeek, week);
    else weekKnown = false;
    const hasThreshold = (parseFloat(u.otAfterHours) > 0)
      || (parseFloat(u.weeklyOtHours) > 0 && dpw > 0);
    if (!hasThreshold) daysAffected += days;
  }
  if (!anyLongDay || !daysAffected) return null;

  // The week is known and inside forty: nothing is owed, and saying so is worth
  // more than silence, because the long day looks like a problem and is not.
  if (weekKnown && hrsPerWeek > 0 && hrsPerWeek <= STANDARD_WEEK_HOURS) {
    return { owed: 'none', hrsPerWeek, daysAffected, current: jobLaborTotal(state) - jobOOTTotal(state) };
  }

  // Past forty, or a week nobody can work out. Price it on the weekly rule,
  // which is the one that applies everywhere.
  const apply = u => ({
    ...u,
    weeklyOtHours: parseFloat(u.weeklyOtHours) > 0 ? u.weeklyOtHours : STANDARD_WEEK_HOURS,
    daysPerWeek: parseFloat(u.daysPerWeek) > 0 ? u.daysPerWeek : 5,
    otMult: parseFloat(u.otMult) > 1 ? u.otMult : 1.5,
  });
  const corrected = { ...state };
  if (flat) corrected.flatJob = apply(state.flatJob || {});
  else corrected.laborPeriods = (state.laborPeriods || []).map(apply);

  const current = jobLaborTotal(state) - jobOOTTotal(state);
  const withOt = jobLaborTotal(corrected) - jobOOTTotal(corrected);
  if (current === withOt) return null;
  return {
    owed: weekKnown ? 'weekly' : 'unknown',
    hrsPerWeek: weekKnown ? hrsPerWeek : 0,
    daysAffected,
    current,
    corrected: withOt,
    delta: withOt - current,
    blanketUsed: units.some(u => parseFloat(u.otMult) > 1
      && !(parseFloat(u.otAfterHours) > 0) && !(parseFloat(u.weeklyOtHours) > 0)),
  };
}

// ── WHAT THE OTHER BASIS WOULD COST ──────────────────────────────────────────
// The number an estimator needs in order to choose, rather than a prompt asking
// them to think about it in the abstract. Returns null when the two bases give
// the same answer — a one-man crew, or nothing entered — because there is
// nothing to decide then.
export function ootBasisComparison(state) {
  if (state?.outOfTown === false) return null;
  // The crew-versus-person question only exists for the FLAT per-day figure.
  // Once meals, hotel and fuel are itemised each carries its own multiplier,
  // and offering to switch a basis that no longer applies would be inviting a
  // change that does nothing.
  if (ootIsItemised(state?.ootRates)) return null;
  const basis = state?.ootBasis || DEFAULT_OOT_BASIS;
  const other = basis === 'person' ? 'crew' : 'person';
  const current = jobOOTTotal(state);
  const asOther = jobOOTTotal({ ...state, ootBasis: other });
  if (current === asOther) return null;
  const crew = jobCrew(state);
  return {
    basis, other,
    current, asOther,
    delta: asOther - current,
    travelers: crewTravelCount(crew),
    crewSize: (crew || []).length,
  };
}

export function calcMaterialsTotal(lineItems) {
  return (lineItems || []).reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
}

// Residential lineset total — the ONE definition shared by the Materials step
// display and the bid-total engine. Roll copper prices automatically from the
// copper rate table ((suction + liquid $/ft) × length); pre-insulated is the
// manually entered supplier-quote total. Reading state.resLinesetTotal directly
// in the bid engine dropped auto-priced roll copper out of the final bid.
export function calcResLinesetTotal(state) {
  if ((state.resLinesetType || 'preinsulated') === 'roll') {
    const cu = state.rates?.cu || {};
    const len = parseFloat(state.resLineLength) || 0;
    return ((cu[state.resSucSize] || 0) + (cu[state.resLiqSize] || 0)) * len;
  }
  return parseFloat(state.resLinesetTotal) || 0;
}

// ── RACK & FIELD TASK LABOR ──────────────────────────────────────────────────
// Rack tasks and field tasks are costed from the crew on the FIRST labor period
// (that's the job's primary crew). These helpers are shared by the step views
// AND the proposal totals so the number you see while editing is the same number
// that lands in the bid — previously the proposal read a `laborCost` field that
// was never persisted, so rack + field labor silently dropped out of the total.
export function primaryCrew(laborPeriods) {
  return laborPeriods?.[0]?.crew || [];
}

export function avgCrewRate(crew) {
  const list = crew || [];
  if (!list.length) return 0;
  const sum = list.reduce((s, m) => s + (parseFloat(m.rate) || 0), 0);
  return sum / list.length;
}

// Fallback man-hour rate when no crew has been set up yet, so a task entered
// before the Labor step still costs something instead of reading as free.
const FALLBACK_MANHOUR_RATE = 100;

// Rack task: if specific crew roles are assigned, cost each role's count at its
// rate × hours; otherwise fall back to men × hours × average crew rate.
export function calcRackTaskCost(task, crew) {
  const list = crew || [];
  if (task.crewAssignment && Object.keys(task.crewAssignment).length > 0) {
    return Object.entries(task.crewAssignment).reduce((s, [roleId, count]) => {
      const member = list.find(m => m.id === roleId);
      return s + (count || 0) * (parseFloat(member?.rate) || 0) * (parseFloat(task.hrs) || 0);
    }, 0);
  }
  const rate = avgCrewRate(list) || FALLBACK_MANHOUR_RATE;
  return (parseFloat(task.men) || 1) * (parseFloat(task.hrs) || 0) * rate;
}

export function calcRackLaborTotal(rackTasks, crew) {
  return (rackTasks || []).reduce((s, t) => s + calcRackTaskCost(t, crew), 0);
}

// Field task: men × hours × average crew rate (per-man rate), fallback rate when
// no crew is set. Mirrors what the Labor step's Field Work table displays.
export function calcFieldTaskCost(task, crew) {
  const rate = avgCrewRate(crew) || FALLBACK_MANHOUR_RATE;
  return (parseFloat(task.men) || 0) * (parseFloat(task.hrs) || 0) * rate;
}

export function calcFieldTasksTotal(fieldTasks, crew) {
  return (fieldTasks || []).reduce((s, t) => s + calcFieldTaskCost(t, crew), 0);
}

// ── LABOR-UNIT LIBRARY ───────────────────────────────────────────────────────
// Standard man-hour units so labor can be DERIVED from the circuit list instead
// of hand-entered each time — the core of a consistent, fast estimate. Defaults
// are reasonable commercial-refrigeration ballparks (editable per job): joints
// dominate, so they're tracked separately from footage. Sizes are bucketed
// small (≤7/8") / med (1-1/8"–1-3/8") / large (≥1-5/8").
export const DEFAULT_LABOR_UNITS = {
  // Running rates, halved from 0.06/0.09/0.13 after an installing mechanic read
  // the circuit totals as running about double. The brazing times below were
  // looked at in the same pass and left alone — he said those were about right,
  // so the whole cut lands here rather than being spread over a number somebody
  // had already checked. Still nobody's measurement: see UNIT_PROVENANCE.
  perFtSmall: 0.03, perFtMed: 0.045, perFtLarge: 0.065,  // hrs per ft of run
  perJointSmall: 0.4, perJointMed: 0.7, perJointLarge: 1.1, // hrs per braze joint
  perCase: 1.5,      // hrs to hook up a refrigerated case
  perRackTie: 2.0,   // hrs to tie a circuit into the rack
  stickLength: 20,   // ft of hard copper per stick → number of joints
  // ── AND SOFT COPPER DOES NOT COME IN STICKS ───────────────────────────────
  // A line pushed in the floor is soft copper, and soft copper arrives in
  // COILS. Fifty feet is the common ACR coil. So a 400 ft in-floor run is
  // eight joints, not the twenty this used to charge it — the stick length was
  // being applied to a product that has no sticks.
  coilLength: 50,
  // ── FITTINGS: THE NUMBER YOU CANNOT GET FROM A DESK ───────────────────────
  // Joints a circuit has BEYOND one per stick. This started as a hardcoded +2
  // — the rack tie and the case — which described a straight pipe from the
  // motor room to the case. No such circuit exists. In an installing mechanic's
  // words, a run leaves the motor room and ells one way or the other, goes
  // down the back hall, takes another set of ells to turn onto the sales
  // floor, sometimes ells up and over, another set toward the case, then a set
  // down to it. Every one of those is joints nobody priced.
  //
  // And it is not derivable from footage: "you don't know where you'll have to
  // turn or ell up until you get there and look at it." Two circuits of the
  // same length through different parts of a store are different jobs. So this
  // is an ALLOWANCE that stands in until somebody walks the route — the app
  // says so rather than presenting it as a takeoff, and a circuit that HAS
  // been walked carries its own counted number instead (see circuitJoints).
  jointsPerCircuit: 2,
  // A drop long enough to need a riser brings its own ells up and over and a
  // P-trap at the bottom. That much the app can tell from the circuit itself,
  // because the riser length is on the sheet — so it is added rather than
  // guessed at.
  jointsPerRiser: 4,
  // ── JOINTS IN A BUNCH ARE NOT JOINTS IN A ROW ─────────────────────────────
  // The per-joint units above are for a joint on its own: get to it, prep it,
  // purge it, braze it, cool it, check it, insulate it, move on. From the
  // estimator: "when you have a bunch of joints in the same place, like the
  // end of the case, it's not gonna be the same as brazing each one and
  // stopping to cool and check it and insulate it."
  //
  // Getting there happens once. The purge is once on the same line. The
  // insulation is one operation over the group. Only the prep, the braze, the
  // cool and the check are genuinely per joint. So the FIRST joint in a
  // cluster costs the full unit and the rest cost this fraction of it.
  //
  // 0.65 is a reasoned split of that unit, not a measurement — and he warned
  // in the same breath that "it takes different people different amounts of
  // time." It is editable and marked unconfirmed. Set it to 1 to price every
  // joint as a standalone one, which is what the app did before.
  clusterFactor: 0.65,
};

// How many fittings-joints a circuit carries, and whether anybody actually
// knows. A counted number beats an allowance and must never be overridden by
// one; that is the whole reason the two are distinguishable here.
// ── HOW MANY CASES HANG OFF THIS CIRCUIT ────────────────────────────────────
// The labor estimate charged exactly ONE case hookup per circuit, and no field
// existed to say otherwise. But a circuit does not feed a case, it feeds a
// LINEUP — "MD Produce 2-4" in the app's own placeholder is three of them, and
// a run of coffin cases or multi-decks is commonly six or eight. Every one gets
// stubbed, valved, brazed and insulated separately.
//
// So a six-case lineup was booking 1.5 hours of case work instead of nine, on
// every circuit, and the error runs in the direction that loses money.
//
// Unset means one, which is exactly what the old behaviour was — a job saved
// before this field existed estimates the same as it did yesterday, and only
// changes when somebody says how many cases are really out there.
export function circuitCases(circuit) {
  const n = parseFloat(circuit?.caseCount);
  if (!Number.isFinite(n) || n < 0) return { cases: 1, source: 'assumed' };
  return { cases: Math.round(n), source: 'counted' };
}

// `loose` are scattered along the route and each costs a full unit. `clustered`
// are the riser's — the ells up and over and the P-trap, all in one spot, one
// setup — and after the first they cost clusterFactor of a unit.
//
// A COUNTED number is all loose. If somebody walked the route and wrote down
// fourteen fittings, nothing tells us which of them are bunched, and charging
// a discount on an arrangement nobody described would be inventing a saving.
export function circuitJoints(circuit, units) {
  const u = { ...DEFAULT_LABOR_UNITS, ...(units || {}) };
  const counted = parseFloat(circuit?.fittingJoints);
  if (Number.isFinite(counted) && counted >= 0) {
    return { joints: counted, loose: counted, clustered: 0, source: 'counted' };
  }
  const base = Number.isFinite(parseFloat(u.jointsPerCircuit)) ? parseFloat(u.jointsPerCircuit) : 2;
  const hasRiser = (parseFloat(circuit?.riserLength) || 0) > 0 || !!circuit?.isRiserOnly;
  const riser = hasRiser && Number.isFinite(parseFloat(u.jointsPerRiser)) ? parseFloat(u.jointsPerRiser) : 0;
  return { joints: base + riser, loose: base, clustered: riser, source: 'assumed' };
}

// What a cluster of n joints costs, in units of one standalone joint. One full
// unit for the first, a fraction of it for each one after — because the trip,
// the purge and the insulating are shared and only the brazing is not.
export function clusterJointEquivalent(n, factor) {
  const count = Math.max(0, Number(n) || 0);
  if (count === 0) return 0;
  const f = Number.isFinite(parseFloat(factor)) ? parseFloat(factor) : 0.65;
  return 1 + (count - 1) * f;
}

// ── HOW BIG SOFT COPPER GETS ────────────────────────────────────────────────
// Above about 1-1/8" ACR copper is drawn hard and sold in straight lengths
// only; there is no coil to buy. So "in the floor" does not automatically mean
// soft — a 2-1/8" line in the slab is still hard drawn, still jointed every 20
// ft, and calling it a coil would put a part number on the order that nobody
// stocks. It keeps the one thing being in the floor really does change: it
// carries no hangers.
export const SOFT_COPPER_MAX = '1-1/8';

const PIPE_ORDER = ['1/4','3/8','1/2','5/8','7/8','1-1/8','1-3/8','1-5/8','2-1/8','2-5/8','3-1/8','3-5/8','4-1/8','5-1/8','6-1/8'];

export function softCopperAvailable(size) {
  const i = PIPE_ORDER.indexOf(normalizePipeSize(size));
  // An unreadable size is not assumed to be coil — hard drawn is the safe read,
  // since it is what every size can be bought as.
  if (i < 0) return false;
  return i <= PIPE_ORDER.indexOf(SOFT_COPPER_MAX);
}

// How many feet of pipe a circuit gets between joints. Soft coil runs further
// than a hard stick, so an in-floor line has far fewer.
export function jointSpacingFt(circuit, units) {
  const u = { ...DEFAULT_LABOR_UNITS, ...(units || {}) };
  const stick = Number(u.stickLength) || 20;
  if (!circuit?.inFloor || circuit?.isRiserOnly) return stick;
  if (!softCopperAvailable(circuit.sucHoriz || circuit.sucRiser)) return stick;
  return Number(u.coilLength) || 50;
}

export function pipeSizeBucket(size) {
  const order = PIPE_ORDER;
  const i = order.indexOf(normalizePipeSize(size));
  if (i < 0) return 'med';
  if (i <= 4) return 'small';   // ≤ 7/8"
  if (i <= 6) return 'med';     // 1-1/8" – 1-3/8"
  return 'large';               // ≥ 1-5/8"
}

// Estimate man-hours for each circuit: pipe running (ft × per-ft) + brazing
// (joints × per-joint, joints ≈ one per stick + a rack tie + a case hookup) +
// a flat case-hookup and rack-tie allowance. Returns total + per-circuit detail.
export function estimateCircuitLabor(circuits, units) {
  const u = { ...DEFAULT_LABOR_UNITS, ...(units || {}) };
  let totalHours = 0;
  const perCircuit = [];
  (circuits || []).forEach(c => {
    const run = parseFloat(c.runLength) || 0, riser = parseFloat(c.riserLength) || 0;
    const ft = c.isRiserOnly ? riser : run + riser;
    const bucket = pipeSizeBucket(c.sucHoriz || c.sucRiser || '');
    const perFt = bucket === 'small' ? u.perFtSmall : bucket === 'large' ? u.perFtLarge : u.perFtMed;
    const perJoint = bucket === 'small' ? u.perJointSmall : bucket === 'large' ? u.perJointLarge : u.perJointMed;
    // One joint per stick, plus this circuit's fittings — counted if somebody
    // walked the route, allowed for if nobody has yet.
    const fit = circuitJoints(c, u);
    // Hard stick or soft coil — an in-floor line runs 50 ft between joints
    // rather than 20, because it is not cut from sticks.
    const lengthJoints = Math.ceil(ft / jointSpacingFt(c, u));
    const joints = lengthJoints + fit.joints;
    // Length joints are spread along the run and each is its own trip. The
    // circuit's loose fittings are the turns it takes crossing the store —
    // also scattered. Only the riser's are bunched in one place.
    const jointUnits = lengthJoints + fit.loose
      + clusterJointEquivalent(fit.clustered, u.clusterFactor);
    // Case hookup is PER CASE, not per circuit. A lineup of six gets six.
    const cs = circuitCases(c);
    const hrs = ft * perFt + jointUnits * perJoint + cs.cases * u.perCase + u.perRackTie;
    totalHours += hrs;
    perCircuit.push({
      circuitId: c.circuitId || '?', application: c.application || '', ft, bucket,
      hours: Math.round(hrs * 10) / 10,
      // Carried so the estimator can see WHICH circuits are standing on a
      // fittings allowance and which were walked and counted.
      // `joints` stays the COUNT of joints, for the estimator reading the row.
      // `jointUnits` is what it was priced as, which is lower wherever joints
      // share a setup.
      joints, jointUnits: Math.round(jointUnits * 100) / 100,
      fittings: fit.joints, fittingsSource: fit.source,
      cases: cs.cases, casesSource: cs.source,
    });
  });
  const assumed = perCircuit.filter(p => p.fittingsSource === 'assumed').length;
  const assumedCases = perCircuit.filter(p => p.casesSource === 'assumed').length;
  return {
    totalHours: Math.round(totalHours * 10) / 10, perCircuit,
    assumedFittings: assumed, assumedCases,
    totalCases: perCircuit.reduce((s, p) => s + p.cases, 0),
  };
}
