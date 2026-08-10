// ── LOW-VALUE SHEET FILTER ───────────────────────────────────────────────────
// Vision is the expensive part of reading a set — one model call per page
// against a hard function budget — so MAX_VISION_PAGES caps how many pages get
// read. On a 16-sheet set that cap bit six sheets, and the six it dropped were
// the TAIL of the document: roof partial plans and the details sheet, where
// the roof curbs and anchoring requirements live.
//
// Meanwhile calls were being spent on sheets that cannot carry a takeoff at
// all — the mechanical sheet index, COMcheck/IECC inspection checklists, and
// cover sheets that are nothing but the licensed-professional seal
// boilerplate. Skipping those buys the budget back without raising the cap and
// without asking the estimator to split the file by hand.
//
// The asymmetry that shapes every rule here: skipping a sheet that mattered
// silently loses scope from a bid, while reading a worthless sheet costs one
// call. So ANY sign of takeoff content keeps the page, and a page is dropped
// only when it shows none AND positively identifies as a non-takeoff sheet.
//
// Two traps, both found by running this against a real 16-sheet set rather
// than reasoning about it:
//
//   The title-block boilerplate ("THE LICENSED PROFESSIONAL SEAL AFFIXED TO
//   THIS SHEET…") is on EVERY sheet including the plans, so its presence
//   proves nothing. What identifies a cover sheet is that boilerplate and
//   nothing else — caught here by the fact that such sheets are textually
//   near-identical to each other, which two real plans never are.
//
//   The title block also carries a SCALE field, so "1/2\" = 1'-0\"" appears
//   on pages with no drawing on them. A stated scale is therefore not
//   evidence of a plan and is not used as one.
//
// Pure — no React, no network.

import { textSimilarity } from '../components/flagDedupe.js';

// Equipment tag prefixes. Deliberately a copy of the list behind ai.js's
// UNIT_TAG_RE rather than an import — that pattern is anchored for schedule
// detection (no space allowed: "RTU-01"), and real sets also write tags with a
// space ("CU 1-3", "HP 1-5"), which this has to catch. Keep the prefixes in
// step if the other list gains a type.
const TAG_RE = /\b(?:VAV|CV|FPB|PIU|RTU|AHU|DOAS|MAU|MUA|ERV|HRV|EF|SF|RF|TF|KEF|GEF|CU|ACCU|CUH|UH|FCU|HP|WSHP|PTAC|FCU|CH|CT|VRF|SSCU|SSAU|DHU)[\s-]?\d{1,3}(?:[\s-]\d{1,3})?[A-Z]?\b/;

// Any one of these means the page could carry priceable content. Kept.
// A stated scale is NOT in this list — see the header note.
const TAKEOFF_SIGNAL = [
  /\bprovide\b|\binstall\b|\bfurnish\b/i,      // sheet notes / keynotes asking for work
  /\d+\s*["'″]?\s*[x×]\s*\d+/i,                // a duct, curb or opening dimension
  /\bCFM\b/,                                    // air device data
  /\b(?:diffuser|grille|register|louver|damper)\b/i,
  TAG_RE,                                       // an equipment tag
];

// Positive identification as a sheet type that never carries a takeoff.
// The seal boilerplate is absent here on purpose: it is universal.
const NON_TAKEOFF_SHEET = [
  /\bsheet (?:list|index)\b|\bdrawing (?:list|index)\b/i,
  /\bgrand total:\s*\d+/i,                      // the sheet-list footer
  /\bCOMcheck\b|\bIECC\b/i,
  /\bcompliance certificate\b|\binspection checklist\b/i,
];

const BLANK_CHARS = 120;      // a crop with nothing but border lines
// Near-EXACT only. At 0.9 this caught two real overall plans, whose text
// layers are mostly repeated column-grid labels and therefore look alike; the
// cover sheets it is meant for are byte-identical to each other. A rule that
// can drop a plan sheet is the wrong rule, so the bar sits just under 1.
const TWIN_SIMILARITY = 0.97;

export function hasTakeoffSignal(text) {
  const s = String(text || '');
  return TAKEOFF_SIGNAL.some(re => re.test(s));
}

export function isNonTakeoffSheet(text) {
  const s = String(text || '');
  return NON_TAKEOFF_SHEET.some(re => re.test(s));
}

// pageNums: the drawing pages queued for vision. textByPage: { [pageNum]: text }.
// Returns { keep, skipped } — skipped is [{ pageNum, why }] so the run can say
// what it passed over instead of quietly reading less of the set.
export function filterVisionPages(pageNums = [], textByPage = {}) {
  const keep = [], skipped = [];
  const candidates = []; // no signal, no marker — decided by the twin test

  for (const pageNum of pageNums) {
    const text = textByPage[pageNum];
    // No text layer at all is a SCANNED sheet — vision is the only way to read
    // it, so emptiness must never count against it.
    if (text == null) { keep.push(pageNum); continue; }
    if (String(text).trim().length < BLANK_CHARS) { skipped.push({ pageNum, why: 'blank' }); continue; }
    if (hasTakeoffSignal(text)) { keep.push(pageNum); continue; }
    if (isNonTakeoffSheet(text)) { skipped.push({ pageNum, why: sheetKind(text) }); continue; }
    candidates.push(pageNum);
  }

  // A cover sheet is the title block and nothing else, which makes it a near
  // TWIN of the other cover sheets. Two real drawing sheets are never that
  // textually alike, so this catches boilerplate pages without naming any of
  // the phrases they happen to contain.
  for (const pageNum of candidates) {
    const twin = candidates.some(other => other !== pageNum
      && textSimilarity(textByPage[pageNum], textByPage[other]) >= TWIN_SIMILARITY);
    if (twin) skipped.push({ pageNum, why: 'title block' });
    else keep.push(pageNum);
  }

  keep.sort((a, b) => a - b);
  skipped.sort((a, b) => a.pageNum - b.pageNum);
  return { keep, skipped };
}

// How much priceable content a page's text layer suggests. Only used to RANK
// pages against each other, never to drop one on its own.
export function takeoffScore(text) {
  const s = String(text || '');
  const kinds = TAKEOFF_SIGNAL.filter(re => re.test(s)).length;
  const tags = (s.match(new RegExp(TAG_RE.source, 'gi')) || []).length;
  const dims = (s.match(/\d+\s*["'″]?\s*[x×]\s*\d+/gi) || []).length;
  return kinds * 3 + Math.min(tags, 10) + Math.min(dims, 6);
}

// The whole selection in one call: drop the sheets that cannot carry a
// takeoff, then — if more survive than the budget allows — spend the budget on
// the RICHEST ones rather than simply the first ones.
//
// Page order is the wrong way to ration a fixed budget. On a 16-sheet set the
// cap took pages 1-10 and dropped 11-16, which threw away the "MECHANICAL
// DETAILS & SCHEDULES" sheet — the densest page in the document — because it
// happened to be last, while spending calls on grid-only key plans that had
// nothing legible on them.
//
// Returns { selected (ascending page order), skipped, deferred } where
// deferred are real sheets that lost to the budget and should be reported.
export function selectVisionPages(pageNums = [], textByPage = {}, maxPages = Infinity) {
  const { keep, skipped } = filterVisionPages(pageNums, textByPage);
  if (keep.length <= maxPages) return { selected: keep, skipped, deferred: [] };

  const ranked = [...keep].sort((a, b) => {
    const d = takeoffScore(textByPage[b]) - takeoffScore(textByPage[a]);
    return d !== 0 ? d : a - b; // ties keep document order
  });
  const selected = ranked.slice(0, maxPages).sort((a, b) => a - b);
  const deferred = ranked.slice(maxPages).sort((a, b) => a - b);
  return { selected, skipped, deferred };
}

function sheetKind(text) {
  const s = String(text || '');
  if (/\bsheet (?:list|index)\b|\bdrawing (?:list|index)\b|\bgrand total:\s*\d+/i.test(s)) return 'sheet index';
  if (/\bCOMcheck\b|\bIECC\b|\bcompliance certificate\b|\binspection checklist\b/i.test(s)) return 'code compliance';
  return 'title block';
}
