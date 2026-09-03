// ── A READER THAT FOUND NOTHING, AND A DOCUMENT THAT HAD NOTHING ─────────────
// These look identical on screen, and only one of them is a bug.
//
// Store 701's BPR was routed to the wrong parser and produced zero circuits.
// The Circuits step read "No circuits yet", which is exactly what it reads for
// a remodel with no new pipe. Eleven circuits and most of the copper on the
// job were missing and nothing said a word. api/sheetSanity.js was written to
// catch that on the spreadsheet path: count rows that LOOK like circuits
// without knowing the format, and if a sheet is full of them and none came
// out, say so.
//
// The same failure is reachable on the other two readers and was unguarded.
// A redlined plan set whose callouts do not parse, or a construction schedule
// whose RC nights are not recognised, both come back empty and both look like
// a job with no scope.
//
// The rule is deliberately the same and deliberately blunt: fire ONLY when the
// document plainly carries this kind of content and NONE of it was extracted.
// A low yield is normal — eleven circuits out of twenty rows on 701 was the
// right answer — and a check that cried wolf on every correct read would be
// switched off before the job that needed it.

import { stripShift } from '../components/scheduleDates.js';

// Enough of a pattern to mean the document is really that kind of document.
// Below this, a couple of coincidental matches are not evidence of anything.
export const MIN_SHAPED = 6;

// A line carrying refrigeration scope. Two independent signals, because a
// schedule and a redline write them differently:
//   • a circuit tag in parentheses — (C1), (A7), (B12) — which is how a Food
//     Lion schedule marks a case move as RC work regardless of wording
//   • RC vocabulary plus something being DONE to it
const CIRCUIT_TAG = /\(\s*[A-Z]{1,3}\s*-?\s*\d{1,2}\s*\)/;
const RC_WORDS = /refriger|circuit|line ?set|suction|liquid line|copper|evap|rack|case move|relocat|defrost|condens|drip pan|epr\b/i;
const DOING_SOMETHING = /\b(install|set|reset|move|relocat|remove|demo|run|pipe|braze|connect|tie|start|charge|evacuat|insulat|hang|cut)\w*\b/i;

export function looksLikeScopeLine(line) {
  const s = String(line == null ? '' : line).trim();
  if (s.length < 8) return false;
  if (CIRCUIT_TAG.test(s)) return true;
  return RC_WORDS.test(s) && DOING_SOMETHING.test(s);
}

export function countScopeShapedLines(text) {
  return splitLines(text).filter(looksLikeScopeLine).length;
}

// A dated schedule row. Format-blind: it is looking for a date at the head of
// a line, in any of the ways a construction schedule writes one, not for a
// particular chain's layout.
const DATE_HEAD = /^\s*(?:[-•*\s]*)?(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[,\s]+)?(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}|\d{1,2}\s*[/-]\s*\d{1,2}(?:\s*[/-]\s*\d{2,4})?)\b/i;

export function looksLikeScheduleLine(line) {
  // Strip a shift marker first. A real schedule writes "Night- Jun 3 - RC to
  // move frozen food doors", and anchoring the date to the start of the line
  // missed every one of them — which is the same miss that hid three of store
  // 1086's eight RC days, all three of them nights. Same stripper the schedule
  // reader itself uses, so the two cannot drift apart.
  const s = stripShift(String(line == null ? '' : line)).trim();
  return s.length >= 6 && DATE_HEAD.test(s);
}

export function countScheduleShapedLines(text) {
  return splitLines(text).filter(looksLikeScheduleLine).length;
}

// The shared verdict. `kind` names what the document looked full of, so the
// message can say it in the estimator's own words rather than "items".
const KINDS = {
  scope: {
    noun: 'lines that look like refrigeration scope',
    empty: 'NO field tasks were extracted',
    innocent: 'this set really is all existing work, or GC scope',
  },
  schedule: {
    noun: 'dated schedule lines',
    empty: 'NO schedule dates were extracted',
    innocent: 'this schedule genuinely has no RC work on it',
  },
};

export function textExtractionSanity({
  shaped = 0, extracted = 0, kind = 'scope', fileName = '', minShaped = MIN_SHAPED,
} = {}) {
  const n = Number(shaped) || 0;
  const got = Number(extracted) || 0;
  if (n < minShaped || got > 0) return null;
  const k = KINDS[kind] || KINDS.scope;
  return {
    kind, shaped: n, fileName,
    message: `${fileName ? fileName + ': ' : ''}this document has ${n} ${k.noun}, but ${k.empty}. `
      + `Either ${k.innocent} — which is a real and correct answer — or Coldgauge does not recognise `
      + 'the way this one is written. You can tell which by looking; the reader cannot. '
      + 'Check it before pricing, and send the file so the format can be added.',
  };
}

function splitLines(text) {
  if (typeof text !== 'string' || !text) return [];
  return text.split(/\r?\n/);
}
