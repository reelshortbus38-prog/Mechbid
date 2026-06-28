import { createContext, useContext, useReducer } from 'react';

// ── INITIAL STATE ──────────────────────────────────────────────────────────────
// preferredSupplier starts as 'RE Michel' here for safety (this module can't import
// from components/PriceBook.jsx without a circular import risk). Wizard.jsx applies
// the real global default on RESET/new job — see applyDefaultSupplier() usage there.
export const initialState = {
  mode: 'Commercial Refrigeration',
  // Refrigeration system type. CO₂ transcritical (R-744) uses K65 copper-iron
  // alloy and high-pressure (1300+ psi) fittings instead of standard ACR copper,
  // so the generated material list and refrigerant change with it.
  systemType: 'HFC',   // 'HFC' | 'CO2'
  projName: '', projAddr: '', storeNumber: '', projGC: '', projCont: '', projBidDate: '',
  // Key bid dates a refrigeration estimator needs up front.
  preconDate: '',       // pre-construction meeting
  rcStartDate: '',      // RC night-work / case-move start
  jobLength: '',        // total job length (e.g. "16 weeks")
  uploadedFiles: [], extractionResults: [], flags: [],
  circuits: [],
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
    cu: { '1/4':0,'3/8':0,'1/2':0,'5/8':0,'7/8':0,'1-1/8':0,'1-3/8':0,'1-5/8':0,'2-1/8':0,'2-5/8':0,'3-1/8':0 },
    // Insulation rates are per pipe size, per temp/line category — mirrors the copper rate shape.
    // e.g. rates.insul.medSuction['3/8'] = 2.10
    insul: {
      medSuction: { '1/4':0,'3/8':0,'1/2':0,'5/8':0,'7/8':0,'1-1/8':0,'1-3/8':0,'1-5/8':0,'2-1/8':0,'2-5/8':0,'3-1/8':0 },
      lowSuction: { '1/4':0,'3/8':0,'1/2':0,'5/8':0,'7/8':0,'1-1/8':0,'1-3/8':0,'1-5/8':0,'2-1/8':0,'2-5/8':0,'3-1/8':0 },
      lowLiquid:  { '1/4':0,'3/8':0,'1/2':0,'5/8':0,'7/8':0,'1-1/8':0,'1-3/8':0,'1-5/8':0,'2-1/8':0,'2-5/8':0,'3-1/8':0 },
    },
    fittingsMarkupPct: 25,
    // 'percentage' = auto allowance line based on % of copper cost.
    // 'manual' = no allowance line; fittings are added one-by-one via the fitting picker.
    fittingsMode: 'percentage',
    wasteFactor: 10,
  },
  laborPeriods: [],
  // Editable labor-unit assumptions for deriving hours from circuits (see
  // estimateCircuitLabor / DEFAULT_LABOR_UNITS). Undefined falls back to defaults.
  laborUnits: undefined,
  markupPct: 20,
  // Equipment markup is tracked separately from material markup because a big
  // packaged unit shouldn't carry the same margin as copper and consumables.
  // Empty = "use the material markup" (no behavior change); set a number to
  // mark equipment up at its own rate. Applies to HVAC + Residential equipment.
  equipMarkupPct: '',
  // Subcontractors (electrical, crane/rigging, controls, insulation, demo…) as
  // first-class pass-through cost rows, with an optional blanket markup.
  subcontractors: [],   // { id, desc, cost }
  subMarkupPct: 0,
  // Sales/use tax applied to the marked-up materials+equipment sell price.
  // Defaults to 0 so it's opt-in and never silently changes an existing bid.
  materialsTaxPct: 0,
  bondPct: 0,        // payment & performance bond, % of bid
  permitFee: 0,      // flat permit/fees
  bidValidDays: 30,  // proposal validity period (days)
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
const STORAGE_KEY = 'mechbid_jobs_v2';

export function saveJob(state) {
  try {
    const jobs = loadAllJobs();
    const id = state.jobId || uid();
    jobs[id] = {
      id,
      name: state.projName || 'Untitled',
      mode: state.mode,
      lastEdited: new Date().toISOString(),
      data: { ...state, jobId: id },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    return id;
  } catch (e) {
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

export function deleteJob(id) {
  const jobs = loadAllJobs();
  delete jobs[id];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

// ── BACKUP / RESTORE ───────────────────────────────────────────────────────────
// Jobs live in this browser's localStorage. Until there's a cloud account,
// export/import is the safety net against data loss and the way to move bids
// between devices. Export wraps all jobs in a versioned envelope; import merges
// them in (incoming jobs win on id collision), tolerating a raw jobs object too.
export function exportAllJobsJSON() {
  return JSON.stringify({ app: 'mechbid', version: 2, exportedAt: new Date().toISOString(), jobs: loadAllJobs() }, null, 2);
}

// ── COMPANY PROFILE ──────────────────────────────────────────────────────────
// The contractor's own company details — global (same across every job) and
// printed on the proposal so a bid goes out on YOUR letterhead, not "MechBid".
const COMPANY_KEY = 'mechbid_company_v1';

export function loadCompanyProfile() {
  try { return JSON.parse(localStorage.getItem(COMPANY_KEY) || '{}') || {}; }
  catch { return {}; }
}

export function saveCompanyProfile(profile) {
  try { localStorage.setItem(COMPANY_KEY, JSON.stringify(profile || {})); }
  catch (e) { console.warn('Company profile save failed:', e); }
}

export function importJobsJSON(text) {
  const data = JSON.parse(text);
  const incoming = data && data.jobs ? data.jobs : data; // accept enveloped or raw
  if (!incoming || typeof incoming !== 'object') throw new Error('Not a MechBid backup file');
  const jobs = loadAllJobs();
  let count = 0;
  for (const [id, job] of Object.entries(incoming)) {
    if (job && job.data) { jobs[id] = job; count++; }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  return count;
}

// ── LABOR CALCULATIONS ─────────────────────────────────────────────────────────
export function calcLaborPeriodCost(period) {
  // Each crew member contributes rate × their own hours/day. hrsPerDay defaults
  // to 8 so existing periods are unchanged, but a 10-hour day now actually costs
  // a 10-hour day (previously hrsPerDay was stored and ignored — always ×8).
  const crewDayRate = (period.crew || []).reduce(
    (s, m) => s + (parseFloat(m.rate) || 0) * (parseFloat(m.hrsPerDay) || 8), 0);
  const otMult = parseFloat(period.otMult) || 1;
  const nightMult = period.isNight ? (parseFloat(period.nightMult) || 1.5) : 1;
  const days = parseFloat(period.days) || 0;
  const oot = (parseFloat(period.ootPerDay) || 0) * days;
  const labor = crewDayRate * days * otMult * nightMult;
  return { labor, oot, total: labor + oot };
}

export function calcTotalLabor(laborPeriods) {
  return (laborPeriods || []).reduce((s, p) => {
    const { total } = calcLaborPeriodCost(p);
    return s + total;
  }, 0);
}

export function calcMaterialsTotal(lineItems) {
  return (lineItems || []).reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
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
  perFtSmall: 0.06, perFtMed: 0.09, perFtLarge: 0.13,   // hrs per ft of run
  perJointSmall: 0.4, perJointMed: 0.7, perJointLarge: 1.1, // hrs per braze joint
  perCase: 1.5,      // hrs to hook up a refrigerated case
  perRackTie: 2.0,   // hrs to tie a circuit into the rack
  stickLength: 20,   // ft of hard copper per stick → number of joints
};

export function pipeSizeBucket(size) {
  const order = ['1/4','3/8','1/2','5/8','7/8','1-1/8','1-3/8','1-5/8','2-1/8','2-5/8','3-1/8'];
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
    const joints = Math.ceil(ft / (u.stickLength || 20)) + 2; // sticks + rack tie + case
    const hrs = ft * perFt + joints * perJoint + u.perCase + u.perRackTie;
    totalHours += hrs;
    perCircuit.push({ circuitId: c.circuitId || '?', application: c.application || '', ft, bucket, hours: Math.round(hrs * 10) / 10 });
  });
  return { totalHours: Math.round(totalHours * 10) / 10, perCircuit };
}
