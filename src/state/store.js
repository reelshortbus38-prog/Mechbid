import { createContext, useContext, useReducer } from 'react';

// ── INITIAL STATE ──────────────────────────────────────────────────────────────
// preferredSupplier starts as 'RE Michel' here for safety (this module can't import
// from components/PriceBook.jsx without a circular import risk). Wizard.jsx applies
// the real global default on RESET/new job — see applyDefaultSupplier() usage there.
export const initialState = {
  mode: 'Commercial Refrigeration',
  projName: '', projAddr: '', storeNumber: '', projGC: '', projCont: '', projBidDate: '',
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
    cu: { '1/4':0,'3/8':0,'1/2':0,'5/8':0,'7/8':0,'1-1/8':0,'1-3/8':0,'1-5/8':0,'2-1/8':0 },
    // Insulation rates are per pipe size, per temp/line category — mirrors the copper rate shape.
    // e.g. rates.insul.medSuction['3/8'] = 2.10
    insul: {
      medSuction: { '1/4':0,'3/8':0,'1/2':0,'5/8':0,'7/8':0,'1-1/8':0,'1-3/8':0,'1-5/8':0,'2-1/8':0 },
      lowSuction: { '1/4':0,'3/8':0,'1/2':0,'5/8':0,'7/8':0,'1-1/8':0,'1-3/8':0,'1-5/8':0,'2-1/8':0 },
      lowLiquid:  { '1/4':0,'3/8':0,'1/2':0,'5/8':0,'7/8':0,'1-1/8':0,'1-3/8':0,'1-5/8':0,'2-1/8':0 },
    },
    fittingsMarkupPct: 25,
    // 'percentage' = auto allowance line based on % of copper cost.
    // 'manual' = no allowance line; fittings are added one-by-one via the fitting picker.
    fittingsMode: 'percentage',
    wasteFactor: 10,
  },
  laborPeriods: [],
  markupPct: 20,
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

// ── LABOR CALCULATIONS ─────────────────────────────────────────────────────────
export function calcLaborPeriodCost(period) {
  const crewRate = (period.crew || []).reduce((s, m) => s + (parseFloat(m.rate) || 0), 0);
  const otMult = parseFloat(period.otMult) || 1;
  const nightMult = period.isNight ? (parseFloat(period.nightMult) || 1.5) : 1;
  const days = parseFloat(period.days) || 0;
  const oot = (parseFloat(period.ootPerDay) || 0) * days;
  const labor = crewRate * 8 * days * otMult * nightMult;
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
