// ── DID THE READ COVER THE PIPING? ───────────────────────────────────────────
// The duct coverage check reads a sheet's text layer and reports the duct sizes
// the vision pass never returned. Piping needs the same thing and cannot use
// the same method: a duct size announces itself as "24x16", but a pipe size is
// just a small number with an inch mark, indistinguishable from "36" DEEP",
// "12" ABOVE FINISHED FLOOR" or a round duct's "8"ø".
//
// What makes a pipe callout identifiable is the SERVICE CODE beside it. Plans
// label pipe as size + service — 3/4" HWS, 1-1/4" RS, 4" CHWS&R — and those
// codes appear nowhere else on a mechanical sheet. So the service is the anchor
// and the size is read off it, rather than the other way round.
//
// A live read of an 11-sheet school set returned 16 feet of pipe in total: two
// runs, 3/4" HWS and 3/4" HWR, 8 feet each, on a building with 37 VAV boxes. If
// those boxes have hot-water reheat coils the real number is hundreds of feet.
// Nothing in the app said anything, because every check it had graded the runs
// that came back rather than looking for the ones that did not.
//
// Pure — no pdf.js, no React.

import { sizeInches } from './runKind.js';

// Service codes as they are written on drawings. Longest first so CHWS is not
// eaten by CHW, and HHWS not by HW.
export const PIPE_SERVICES = [
  'CHWS', 'CHWR', 'CHW', 'HHWS', 'HHWR', 'HWS', 'HWR', 'HW',
  'CWS', 'CWR', 'CDWS', 'CDWR', 'GLY', 'GLYS', 'GLYR',
  'LPS', 'MPS', 'HPS', 'PC', 'SC',
  'RS', 'RL', 'RG', 'RD', 'HGB', 'HG',
  // 'FOR' is deliberately absent. It is an English word, and a real sheet
  // carries "SEE 1/M 10.06 FOR CONTROL SEQUENCE AND VALVING" — which read as a
  // 10.06-inch fuel-oil return line. Fuel oil return is rare enough on an HVAC
  // sheet that catching it is not worth reading prose as pipe.
  'FOS', 'CA', 'CD', 'COND', 'NG',
];

// ── PIPE COMES IN SIZES ──────────────────────────────────────────────────────
// The text layer joins items with spaces, so a keynote bubble sitting beside a
// callout runs into it: a real sheet reads "8 8 9 9 8 8 8 3/4"HWR" (a column of
// keynotes, then one 3/4" return) and "4 4 1/2"HWR UP" (keynote 4, then a 1/2"
// return). Read naively those become 8-3/4" and 4-1/2" pipe.
//
// Nobody makes 8-3/4" pipe. Nominal sizes are a short, closed list — steel NPS
// plus the copper/refrigerant ODs — so anything off it is not a size that was
// read wrong, it is two numbers that were never one number.
//
// One ambiguity survives on purpose: a keynote "2" beside a 1/2" line is
// indistinguishable from a real 2-1/2" line, because 2-1/2" IS a standard size.
// Rejecting it would lose a common main to protect against a rarer misread.
const NOMINAL_IN = new Set([
  0.25, 0.375, 0.5, 0.625, 0.75, 0.875,
  1, 1.125, 1.25, 1.375, 1.5, 1.625,
  2, 2.125, 2.5, 2.625,
  3, 3.125, 3.5, 3.625,
  4, 4.125, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24,
]);
export const isNominalPipeSize = dia => NOMINAL_IN.has(Number(dia));

// What a service code MEANS, so a spelled-out service on a reported run can be
// matched against a coded one on the sheet. The analyzer returns either.
const SERVICE_ALIASES = [
  [/chilled\s*water\s*supply|^chws$/i, 'CHWS'],
  [/chilled\s*water\s*return|^chwr$/i, 'CHWR'],
  [/chilled\s*water|^chw$/i, 'CHW'],
  [/(?:heating\s*)?hot\s*water\s*supply|^h?hws$/i, 'HWS'],
  [/(?:heating\s*)?hot\s*water\s*return|^h?hwr$/i, 'HWR'],
  [/hot\s*water|^h?hw$/i, 'HW'],
  [/condenser\s*water\s*supply|^c[dw]ws$/i, 'CWS'],
  [/condenser\s*water\s*return|^c[dw]wr$/i, 'CWR'],
  [/glycol|^gly/i, 'GLY'],
  [/refrigerant\s*suction|suction|^rs$/i, 'RS'],
  [/refrigerant\s*liquid|liquid\s*line|^rl$/i, 'RL'],
  [/hot\s*gas\s*bypass|^hgb$/i, 'HGB'],
  [/hot\s*gas|discharge|^h?g$|^rd$|^rg$/i, 'RG'],
  [/condensate|drain|^cd$|^cond$/i, 'CD'],
  [/natural\s*gas|\bgas\b|^ng$/i, 'NG'],
  [/fuel\s*oil|^fo[sr]$/i, 'FOS'],
  [/compressed\s*air|^ca$/i, 'CA'],
  [/steam|^[lmh]ps$/i, 'STEAM'],
];

export function normalizeService(service) {
  const s = String(service || '').trim();
  if (!s) return '';
  for (const [re, code] of SERVICE_ALIASES) if (re.test(s)) return code;
  return s.toUpperCase();
}

// A size written the way pipe is written: 3/4", 1-1/4", 2 1/2", 4".
const SIZE = '(?:\\d{1,2}\\s*[-–]?\\s*\\d{1,2}\\s*/\\s*\\d{1,2}|\\d{1,2}\\s*/\\s*\\d{1,2}|\\d{1,2}(?:\\.\\d+)?)';
const pipeRe = () => new RegExp(
  `\\b(${SIZE})\\s*(?:"|″|in\\b|inch(?:es)?)?\\s*(?:ø|⌀)?\\s*(${PIPE_SERVICES.join('|')})(?:\\s*&\\s*R)?\\b`, 'gi');

// → Map "0.75|HWS" → { dia, service, count }
export function textPipeRuns(pageText = '') {
  const out = new Map();
  for (const m of String(pageText || '').matchAll(pipeRe())) {
    const dia = sizeInches(m[1]);
    if (!(dia > 0) || !isNominalPipeSize(dia)) continue;
    const service = normalizeService(m[2]);
    const key = `${dia}|${service}`;
    const rec = out.get(key) || { dia, service, count: 0, raw: `${m[1].trim()}" ${m[2].toUpperCase()}` };
    rec.count++;
    out.set(key, rec);
  }
  return out;
}

const MAX_NAMED = 10;
// One unreported line is noise — a size in a detail, a legend entry. A read
// that missed several is a read that did not cover the piping.
const MIN_GAP = 2;

// runs: the pipe runs the vision read returned for THIS page.
export function pipeCoverageGap(runs = [], pageText = '', label = '') {
  const text = String(pageText || '');
  if (!text.trim()) return { flags: [], missing: [] };

  const got = new Map(); // dia → Set of normalized services ('' = service unknown)
  for (const r of runs) {
    const dia = sizeInches(r?.size);
    if (!(dia > 0)) continue;
    if (!got.has(dia)) got.set(dia, new Set());
    got.get(dia).add(normalizeService(r?.service));
  }

  const missing = [...textPipeRuns(text).values()].filter(t => {
    const svcs = got.get(t.dia);
    if (!svcs) return true;                 // that size never came back at all
    if (svcs.has(t.service)) return false;  // matched exactly
    // A run whose service the analyzer could not name is treated as covering
    // any service at that size. Better to stay quiet than to claim a hole that
    // is really just a blank field.
    return !svcs.has('');
  }).sort((a, b) => b.count - a.count);

  const flags = [];
  const pfx = label ? `${label}: ` : '';
  if (missing.length >= MIN_GAP) {
    const named = missing.slice(0, MAX_NAMED).map(t => `${t.raw} (×${t.count})`);
    const rest = missing.length - named.length;
    flags.push({ type: 'warn', text:
      `${pfx}the sheet's own text shows ${missing.length} pipe run(s) the read did not return — ${named.join(', ')}${rest > 0 ? ` and ${rest} more` : ''}. Counts are how many times each is labeled on the drawing. Pipe is bought by the foot, so any of these that are real runs are costing nothing in the bid. Open the sheet and reconcile.` });
  }
  return { flags, missing };
}
