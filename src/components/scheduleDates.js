// Pure date helpers for the RC schedule view — extracted from JobInfo so the
// year-wrap logic (a real, customer-visible bug source) can be unit-tested.

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

export function extractMonthDay(label) {
  if (!label) return null;
  const match = String(label).match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i);
  if (!match) return null;
  const monthIdx = MONTHS.indexOf(match[1].toLowerCase());
  const day = parseInt(match[2], 10);
  if (monthIdx < 0 || !day) return null;
  return { monthIdx, day };
}

// The job's start month for a schedule that may cross the calendar year. Math.min
// is wrong on a wrap (a Sep→Mar job's smallest month is January), so instead the
// start is the month right after the LARGEST gap between active months — the
// off-season. Construction schedules span well under 12 months, so there's
// always one clear gap.
export function anchorMonth(monthsPresent) {
  const m = [...new Set(monthsPresent)].sort((a, b) => a - b);
  if (m.length <= 1) return m.length ? m[0] : 0;
  let anchor = m[0], maxGap = -1;
  for (let i = 0; i < m.length; i++) {
    const cur = m[i];
    const next = m[(i + 1) % m.length];
    const gap = ((next - cur + 12) % 12) || 12; // forward distance, wraps year-end
    if (gap > maxGap) { maxGap = gap; anchor = next; }
  }
  return anchor;
}

export function buildDateParser(schedule) {
  const monthsPresent = schedule.map(s => extractMonthDay(s.date)).filter(Boolean).map(d => d.monthIdx);
  const anchor = anchorMonth(monthsPresent);
  return function tryParseDate(label) {
    const md = extractMonthDay(label);
    if (!md) return null;
    // Months earlier in the calendar than the start month have wrapped into
    // the next year (e.g. January/February after a September start).
    const year = md.monthIdx < anchor ? 2001 : 2000;
    return new Date(year, md.monthIdx, md.day).getTime();
  };
}

export function isNightDate(label) {
  if (!label) return false;
  return /\bnight\b/i.test(label);
}

export function extractWeekNum(label) {
  if (!label) return null;
  // "w15", "wk15", "week 15", and "WEEK #17" (the # form some schedules use).
  const match = String(label).match(/\bw(?:eek)?\.?\s*#?\s*(\d{1,2})\b/i);
  return match ? parseInt(match[1], 10) : null;
}

// Total job length in weeks, read deterministically from a schedule's own week
// headers — the highest "Week #N" anywhere in the document text. Exact (the AI
// estimate is a fallback), and works on any schedule that numbers its weeks.
export function maxWeekNumber(text) {
  const weeks = [...String(text || '').matchAll(/\bw(?:eek)?\.?\s*#?\s*(\d{1,2})\b/gi)].map(m => parseInt(m[1], 10));
  return weeks.length ? Math.max(...weeks) : null;
}

// ── SCHEDULE-TEXT SCANNERS ──────────────────────────────────────────────────
// Deterministic key-date extraction straight from a schedule document's text.

const SCHED_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const SCHED_FULL = ['january','february','march','april','may','june','july','august','september','october','november','december'];

// Pull a clean "Mon Day" label from a date string — textual schedule headers
// plus ISO/numeric forms the AI may normalize to.
export function schedDateLabel(label) {
  const s = String(label || '');
  const m = s.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i);
  if (m) {
    const mi = SCHED_FULL.indexOf(m[1].toLowerCase());
    if (mi >= 0) return `${SCHED_ABBR[mi]} ${parseInt(m[2], 10)}`;
  }
  const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) { const mi = parseInt(iso[2], 10) - 1; if (mi >= 0 && mi < 12) return `${SCHED_ABBR[mi]} ${parseInt(iso[3], 10)}`; }
  const us = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/);
  if (us) { const mi = parseInt(us[1], 10) - 1; if (mi >= 0 && mi < 12) return `${SCHED_ABBR[mi]} ${parseInt(us[2], 10)}`; }
  return '';
}

// A schedule date HEADER starts with a day of week, e.g.
// "Monday, October 20th (Night) w6". Anchoring on these is what keeps us from
// reading a date out of task prose like "...suspend operations until Nov 5th."
const DOW_HEADER_RE = /\b(?:sun|mon|tues|wednes|thurs|fri|satur)day\b/i;

// Find the date for a marker line by walking back to the nearest day-of-week
// header (or using the marker line itself if it is one). Header-anchored so a
// date mentioned in a task sentence near the marker can't hijack the result.
export function scanScheduleDate(text, markerRe) {
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!markerRe.test(lines[i])) continue;
    if (DOW_HEADER_RE.test(lines[i])) { const l = schedDateLabel(lines[i]); if (l) return l; }
    for (let j = i - 1; j >= Math.max(0, i - 30); j--) {
      if (!DOW_HEADER_RE.test(lines[j])) continue;
      const l = schedDateLabel(lines[j]);
      if (l) return l;
    }
  }
  return '';
}

// The meeting time on a marker line ("...MUST BE PRESENT at 1:00 pm").
export function scanScheduleTime(text, markerRe) {
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!markerRe.test(lines[i])) continue;
    for (let j = i; j < Math.min(lines.length, i + 4); j++) {
      const m = lines[j].match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)\b/i);
      if (m) { const min = m[2] ? `:${m[2]}` : ':00'; return `${parseInt(m[1], 10)}${min} ${m[3].replace(/\./g, '').toLowerCase()}`; }
    }
  }
  return '';
}

export const PRECON_RE = /pre-?con(?:struction)?\s*meeting\s*today/i;
// "pre-con(struction)" with "meeting" close by, either order — catches
// "Pre-construction Meeting", "Pre-construction/schedule Coordination Meeting",
// "Mobilize & Pre-Con Meeting". Bounded gap avoids incidental "at the pre-con" prose.
export const PRECON_FALLBACK_RE = /\bmobilize\b.*pre-?con|pre-?con(?:struction)?\b.{0,40}\bmeeting\b|\bmeeting\b.{0,40}pre-?con(?:struction)?\b/i;
// An RC case-move ACTION: the refrigeration contractor disconnecting, relocating,
// or temp-setting refrigerated cases ("Disconnect and relocate to back room:",
// "Relocate and temp set on front wall:", "Refrigeration Contractor to temp cases
// out"). These action phrases are RC work — the store never "disconnects and
// relocates" a case.
const RC_MOVE_ACTION_RE = /disconnect[^.\n]{0,20}relocat|relocat[^.\n]{0,25}(?:temp|reset|back\s*room|front\s*wall)|temp\s*set|temp\s+cases?\s+out|disconnect[^.\n]{0,20}cases?\b|refrigeration contractor[^.\n]{0,40}\b(?:temp\w*|relocat\w*|remov\w*)\s+(?:\w+\s+){0,2}cases?\b/i;
// A specific refrigerated case being worked — a case number ("case# 25", "Case
// 36") or a circuit tag ("(Circuit C1)"). This is what separates a real case
// move from front-end "5 LH Checkouts" and "temp set shelving". Schedules vary:
// some write "case# 25", others "Case 36 (Circuit C1)" with no #.
const CASE_NUM_RE = /\bcases?\s*#?\s*\d|\(\s*circuit\b/i;

// The RC's first case-move night: the first dated night on which an RC case-move
// action is tied to a specific case number. NOT the store's "remove product and
// wash cases" prep (store associates empty/clean the cases — not RC labor), NOT
// front-end checkout relocations, and NOT the late new-equipment install.
export function scanRcFirstCaseNight(text) {
  const lines = String(text || '').split(/\r?\n/);
  let curDate = '';
  for (let i = 0; i < lines.length; i++) {
    if (DOW_HEADER_RE.test(lines[i])) { const l = schedDateLabel(lines[i]); if (l) curDate = l; }
    if (!RC_MOVE_ACTION_RE.test(lines[i])) continue;
    // Confirm a case number on this line or the next few (the case list usually
    // follows the action header on the next line).
    let hasCase = CASE_NUM_RE.test(lines[i]);
    for (let j = i + 1; j < Math.min(lines.length, i + 4) && !hasCase; j++) hasCase = CASE_NUM_RE.test(lines[j]);
    if (hasCase && curDate) return curDate;
  }
  return '';
}

export function formatSpan(startMs, endMs) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtOne = ms => {
    const d = new Date(ms);
    return `${months[d.getMonth()]} ${d.getDate()}`;
  };
  return `${fmtOne(startMs)} – ${fmtOne(endMs)}`;
}
