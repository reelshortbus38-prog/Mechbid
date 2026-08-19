// ── READING FACTS OFF A SHEET ────────────────────────────────────────────────
// Turns the text layer into ledger facts. Written against three real sheets
// from one live set — a pump/equipment schedule, a piping plan and a riser
// diagram with its control sequence — using exactly the line reconstruction
// pdfRender.js already performs, so what is parsed here is what the app sees.
//
// SCHEDULES SURVIVE AS LINES. The y-banding in pdfRender puts one schedule row
// on one line, which is what makes a row parseable at all. It also glues on
// whatever else shares that band: a real pump row arrives with fragments of the
// hose kit sizing schedule after it, and one row has a whole sentence of a note
// welded to its tail. Anything read here has to survive that, so nothing is
// parsed positionally from the end of a line.
//
// WHAT IS NOT EXTRACTED, AND WHY. The heat pump schedule states 25% glycol in a
// GLYCOL % column. Nothing in the flat text marks that 25 as the glycol figure
// rather than one of the twenty other numbers in the row — the header is on a
// different line and only column geometry connects them. It is left alone. A
// fact invented from a column guess would enter the ledger looking exactly like
// a read one, and the ledger's whole value is that its contents were actually
// on the page.
//
// Pure — no pdf.js, no React.

import { newFact, systemOf } from './jobFacts.js';

const lines = text => String(text || '').split('\n').map(l => l.trim()).filter(Boolean);

// ── PUMPS ────────────────────────────────────────────────────────────────────
// A pump schedule row reads: mark, location, system, manufacturer/model, TYPE,
// then FLOW, HEAD, EFF, RPM, HP. Column order is not reliably countable from
// the left because manufacturer names split across a variable number of tokens
// ("B&G / E-1510 2.5AC" is three, "B &G / E-1510 3GB" is four).
//
// RPM is the anchor. It is the one field whose value is unmistakable — a pump
// runs at 1150, 1750, 1800, 3450, 3500 — and everything else is positioned
// against it: flow, head and efficiency immediately before, motor immediately
// after. Validated against all seven rows of a real schedule, including the one
// whose efficiency is a dash and whose motor is "1/6".
export const PUMP_MARK = /^((?:HWP|CWP|CHWP|CDWP|P|PMP|SP|GP)-\d{1,3}[A-Z]?)\b/i;
export const MOUNT_WORDS = /\b(BASE MOUNTED|INLINE|IN-LINE|VERTICAL INLINE|END SUCTION|SPLIT CASE|CIRCULATOR)\b/i;
const RPM_MIN = 850, RPM_MAX = 4000;

// "10.0" → 10, "1/6" → 0.1667, "-" → null
export function numToken(t) {
  const s = String(t || '').trim();
  if (!s || s === '-' || s === '--') return null;
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const mixed = s.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const isRpm = t => {
  const n = numToken(t);
  return n !== null && Number.isInteger(n) && n >= RPM_MIN && n <= RPM_MAX;
};

export function pumpFactsFromLine(line, sheet = '') {
  const mark = (line.match(PUMP_MARK) || [])[1];
  if (!mark) return [];
  const mount = line.match(MOUNT_WORDS);
  if (!mount) return [];
  const after = line.slice(mount.index + mount[0].length).trim().split(/\s+/);
  const i = after.findIndex(isRpm);
  // Needs three fields ahead of the speed and one behind it.
  if (i < 3 || i + 1 >= after.length) return [];

  const flow = numToken(after[i - 3]);
  const head = numToken(after[i - 2]);
  const eff = numToken(after[i - 1]);
  const rpm = numToken(after[i]);
  const hp = numToken(after[i + 1]);

  // Flow and head are what a pump IS. Without both, this was not a pump row.
  if (!(flow > 0) || !(head > 0)) return [];

  const M = mark.toUpperCase();
  // The row names its own loop — "HYDRONIC WATER - LOAD-SIDE", "CONDENSER
  // WATER - SOURCE-SIDE" — which is what keeps a setpoint on one loop from
  // being subtracted from a pump on another.
  const opts = { sheet, raw: line.slice(0, 160), system: systemOf(line) };
  const out = [
    newFact('pumpFlow', M, flow, opts),
    newFact('pumpHead', M, head, opts),
    newFact('pumpRpm', M, rpm, opts),
  ];
  // Efficiency is a percentage or it is not an efficiency.
  if (eff !== null && eff > 20 && eff <= 100) out.push(newFact('pumpEff', M, eff, opts));
  // A fractional-horsepower motor is written "1/6" and is worth about 0.167 —
  // rounded so it reads as a motor size rather than a floating-point artefact.
  if (hp !== null && hp > 0 && hp <= 500) out.push(newFact('pumpMotorHp', M, Math.round(hp * 1000) / 1000, opts));
  return out.filter(Boolean);
}

// ── DIFFERENTIAL PRESSURE SETPOINTS ──────────────────────────────────────────
// These live in prose, in a control sequence, and a sheet carries several of
// them for different things: the system setpoint the pumps ride, the heat pump
// header, the plant minimum and maximum. They are not in conflict with each
// other — they are different subjects — so the subject has to come out with the
// number or the reconciler will compare things that were never the same.
//
// A range ("initially set from 8-12 PSI") yields the TOP of the range, because
// the pump has to make head at the worst case, not the best.
//
// "PRESSURE GAUGE. 0-160 PSIG" is on the same sheet and is not a setpoint. The
// pattern requires the words differential pressure, which that lacks.
// The subject sits on either side of the phrase depending on how the sentence
// was written — "The HW Differential Pressure STPT" puts it before, "The
// differential pressure set point FOR THE HEAT PUMP HEADER" puts it after — so
// both are captured and the more specific one wins. min/max qualifiers are kept
// because a plant minimum and a plant maximum are two setpoints, not one
// disagreeing with itself.
const DP_RE = /((?:\b[A-Za-z]+\s+){0,4})differential\s+pressure\s*((?:[A-Za-z()]+\s+){0,3}?)(?:set\s*point|stpt|setpoint)\s*(for\s+(?:the\s+)?[A-Za-z ]{1,40})?[^.]{0,90}?\bset\s+(?:from|as|to|at)\s+(\d+(?:\.\d+)?)\s*(?:-|to|–)?\s*(\d+(?:\.\d+)?)?\s*psi/gi;

const STOPWORDS = /\b(the|a|an|shall|be|is|are|initially|reset|over|range|point|set|and|of|to|for|its|normal|operating|this)\b/gi;
const clean = s => String(s || '').replace(STOPWORDS, ' ').replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim();

export function dpSetpointFacts(text, sheet = '') {
  const out = [];
  const flat = String(text || '').replace(/\n/g, ' ');
  for (const m of flat.matchAll(DP_RE)) {
    const lo = Number(m[4]);
    const hi = m[5] === undefined ? lo : Number(m[5]);
    // A range is quoted low-to-high; the pump has to make head at the worst
    // case, so the top of the range is the figure that sizes it.
    const value = Math.max(lo, hi);

    const pre = clean(m[1]);
    const post = clean((m[3] || '').replace(/^for\s+(the\s+)?/i, ''));
    const qualifier = (pre.match(/\b(minimum|maximum)\b/i) || [])[1] || '';
    const core = post || pre.replace(/\b(minimum|maximum)\b/gi, '').trim();
    const subject = [qualifier, core].filter(Boolean).join(' ').trim() || 'system';

    const f = newFact('dpSetpoint', subject, value, {
      sheet, raw: m[0].slice(0, 160), system: systemOf(`${m[1]} ${m[3] || ''}`),
    });
    if (f) out.push(f);
  }
  return out;
}

// ── FLUID CONCENTRATION ──────────────────────────────────────────────────────
// Only where the sheet spells it out as a percentage against a fluid name —
// "20% PG", "30% PROPYLENE GLYCOL". A bare number under a GLYCOL % column
// header is not readable from flat text and is deliberately not guessed at.
const PCT_RE = /(\d{1,2}(?:\.\d)?)\s*%\s*(PG|EG|PROPYLENE GLYCOL|ETHYLENE GLYCOL|GLYCOL)\b/gi;

export function fluidPctFacts(text, sheet = '') {
  const out = [];
  for (const line of lines(text)) {
    for (const m of line.matchAll(PCT_RE)) {
      // The system named on the row, if the row names one.
      const sys = (line.match(/\b(CONDENSER WATER|HYDRONIC WATER|CHILLED WATER|HEATING WATER|SOURCE|LOAD)\b/i) || [])[1] || '';
      const f = newFact('fluidPct', sys.toUpperCase(), Number(m[1]), {
        sheet, raw: line.slice(0, 160), system: systemOf(line),
      });
      if (f) out.push(f);
    }
  }
  return out;
}

// ── EQUIPMENT PRESSURE DROP ──────────────────────────────────────────────────
// "MAX WPD 3.0 FT HD" on an air separator, a coil's water pressure drop. Only
// taken where the units are on the line, because a bare number in a schedule
// column is exactly the guess this module refuses to make.
const WPD_RE = /\b(?:MAX\s+)?(?:WPD|WATER PRESSURE DROP|PRESSURE DROP|HEAD LOSS)\b[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(FT|FEET|PSI)\b/gi;

export function equipHeadFacts(text, sheet = '') {
  const out = [];
  for (const line of lines(text)) {
    const mark = (line.match(/^([A-Z]{2,5}-\d{1,3}[A-Z]?)\b/) || [])[1] || '';
    for (const m of line.matchAll(WPD_RE)) {
      const ft = /PSI/i.test(m[2]) ? Number(m[1]) * 2.31 : Number(m[1]);
      const f = newFact('equipHead', mark, Math.round(ft * 100) / 100, {
        sheet, raw: line.slice(0, 160), system: systemOf(line),
      });
      if (f) out.push(f);
    }
  }
  return out;
}

// ── ONE CALL PER SHEET ───────────────────────────────────────────────────────
export function extractFacts(text, sheet = '') {
  const out = [];
  for (const line of lines(text)) out.push(...pumpFactsFromLine(line, sheet));
  out.push(...dpSetpointFacts(text, sheet));
  out.push(...fluidPctFacts(text, sheet));
  out.push(...equipHeadFacts(text, sheet));
  return out;
}
