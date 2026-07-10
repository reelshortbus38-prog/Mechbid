// Pure date helpers for the RC schedule view — extracted from JobInfo so the
// year-wrap logic (a real, customer-visible bug source) can be unit-tested.

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

export function extractMonthDay(label) {
  if (!label) return null;
  const s = String(label);
  // Textual month + day, full OR abbreviated: "October 20", "Monday, October
  // 20th", "Oct 20", "Sep 10". The abbreviated form is what schedDateLabel
  // itself EMITS — without it, our own schedule labels weren't re-parseable,
  // so span/night stats silently ignored every deterministic schedule item.
  const match = s.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})/i);
  if (match) {
    const prefix = match[1].slice(0, 3).toLowerCase();
    const monthIdx = MONTHS.findIndex(m => m.startsWith(prefix));
    const day = parseInt(match[2], 10);
    if (monthIdx >= 0 && day) return { monthIdx, day };
  }
  // Numeric month-first M/D or M/D/YY: "5/13", "Monday 5/13 thru Thursday 5/16".
  const num = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/);
  if (num) {
    const monthIdx = parseInt(num[1], 10) - 1;
    const day = parseInt(num[2], 10);
    if (monthIdx >= 0 && monthIdx < 12 && day >= 1 && day <= 31) return { monthIdx, day };
  }
  return null;
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

// The final store RCC (Refrigeration Commissioning Check) — "Energy Team will
// conduct a complete store RCC". The refrigeration system's final sign-off date.
export const RCC_RE = /complete\s+store\s+RCC|conduct[^.\n]{0,30}\bRCC\b|\bstore\s+RCC\b|\bRCC\b/i;
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

// First night the RC moves cases, derived from the grouped schedule that
// extractRcSchedule builds — that extractor already handles every known
// schedule format, so deriving from its output beats re-scanning the raw text
// with a second regex set (which missed store 47's "Relocate: (1) 8' Meat #13"
// night and let the AI's later Sep guess win over the real Jul 27 start).
// Night-gated to match the field's meaning: "RC Start (Night Work / Case Moves)".
const CASE_MOVE_TASK_RE = /relocat|temp\s*set|disconnect|\bremove\b|case\s*move|\breset\b/i;
export function firstCaseMoveNight(nights) {
  // The night gate only applies when the schedule actually MARKS nights
  // ("(Night)" headers — store 47/701/812 style, where early non-night RC
  // prep must not count). Rough drafts (store 1086) carry no night markers
  // at all — gating there returned nothing and let the AI's guess win, so
  // for those the first case-move entry IS the RC start.
  const marksNights = (nights || []).some(n => n.isNight);
  for (const n of nights || []) {
    if (marksNights && !n.isNight) continue;
    if ((n.tasks || []).some(t => CASE_MOVE_TASK_RE.test(t))) return n.date || '';
  }
  return '';
}

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

// ── FULL RC SCHEDULE (grouped by night) ─────────────────────────────────────
// Deterministic extraction of every night the refrigeration contractor moves
// cases, grouped so one night = one entry with all its RC work together (remove
// + relocate + install on the same night stay together, as the crew works them).
// This replaces the AI's per-task schedule read, which drops items in the middle
// of a long schedule and leaves gaps. Store/GC/EC lines are excluded; the store's
// "remove product and wash cases" prep is not RC work.
const RC_SECTION_RE = /^\s*-?\s*(?:remove|relocate)\s*:|^\s*-?\s*relocate\s*:\s*\(?\s*temp|disconnect[^.\n]{0,20}relocat|^\s*-?\s*deliver\s*(?:and|&)\s*install\s*:|^\s*-?\s*deliver\s*\/\s*install\s*:|^\s*-?\s*deliver[^.\n]{0,60}\brc\b|refrigeration contractor[^.\n]{0,30}\b(?:remove|relocat|temp|install)|temp\s*set/i;
const NON_RC_SECTION_RE = /^\s*-?\s*(?:general contractor|electrical contractor|plumbing contractor|hard tile|soft tile|store associates|market specialist|produce specialist|sas |these items|new note|note\s*:|deli\s*\/\s*bakery|reminder|vendor|energy)/i;
// Equipment-count lines ("(1) Deli cooler evap") count as section content too —
// store 701's "Deliver and Hold for RC to schedule install: (RC to move to
// Connex)" lists evaps that way, with no case numbers or footage marks.
const CASE_CONTENT_RE = /\bcases?\s*#?\s*\d|\(\s*circuit|\d+\s*['’]|#\s*\d|\bN\d{2,3}\b|\(\s*\d+\s*\)|\bevaps?\b/i;

// Front-end fixture resets (kiosk, checkout lanes, shelving, customer service
// counter) use the same "Remove:/Relocate:" section wording as refrigeration
// case moves but belong to the GC/fixture crew, not the RC — store 701's
// Sep 30 kiosk night was landing in the RC schedule AND being picked as the
// RC start. A remove/relocate section is excluded when it talks about
// front-end fixtures and carries NO real case reference (case#/circuit/N-tag).
const FRONT_END_FIXTURE_RE = /kiosk|checkout|check\s*stand|checklane|customer\s*service|register|shelving|gondola/i;
const REAL_CASE_REF_RE = /#\s*\d|\(\s*circuit|\bN\d{2,3}\b/i;

// A date header line STARTS with a day of week, so a date mentioned mid-sentence
// ("...by Monday 6/10") can't be mistaken for one. Works for the strict Food Lion
// form ("Tuesday, September 8th (Night) w12") and the looser rough-draft form
// ("Monday 6/3 thru Thursday 6/6" — no Day/Night marker).
const HEADER_START_RE = /^\s*-?\s*(?:sun|mon|tues|wednes|thurs|fri|satur)day\b/i;
// An inline RC task written on one line, "RC to accept and install N84- 6' Promo"
// or "Refrigeration Contractor to temp cases out". The "RC" abbreviation and the
// spelled-out form are both used across real schedules.
const RC_INLINE_RE = /^\s*-?\s*(?:rc|refrigeration contractor)\b[^.\n]{0,8}\b(?:to|is\s+to|will|shall)\b/i;

export function extractRcSchedule(text) {
  const lines = String(text || '').split(/\r?\n/);
  const nights = [];
  let cur = null, action = null, curWeek = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // A standalone "Week 6" line sets the week for the headers that follow it
    // (the rough-draft form puts the week number on its own line).
    const wk = line.match(/^week\s*#?\s*(\d{1,2})\b/i);
    if (wk && !HEADER_START_RE.test(line)) { curWeek = parseInt(wk[1], 10); continue; }
    // Date header?
    if (HEADER_START_RE.test(line)) {
      const date = schedDateLabel(line);
      if (date) { cur = { date, header: line.replace(/\s+/g, ' '), week: extractWeekNum(line) || curWeek, isNight: /\(night\)/i.test(line), groups: [] }; action = null; nights.push(cur); continue; }
    }
    if (!cur) continue;
    if (NON_RC_SECTION_RE.test(line)) { action = null; continue; }
    // RC action SECTION header — cases are listed on the FOLLOWING lines. Covers
    // "Refrigeration Contractor to remove:" and 1086's "RC to accept and install:"
    // (any RC line ending in a colon introduces a case list). Checked before the
    // inline case so a section header isn't swallowed as one task.
    if (RC_SECTION_RE.test(line) || (RC_INLINE_RE.test(line) && /:\s*(?:\([^)]*\))?\s*$/.test(line))) {
      action = { label: line.replace(/\s*:\s*$/, '').replace(/^-\s*/, '').trim(), cases: [] };
      cur.groups.push(action);
      if (/temp cases? out/i.test(line) && CASE_CONTENT_RE.test(line)) action.cases.push(line);
      continue;
    }
    // Inline RC task, cases named on the same line ("RC to accept and install
    // N74/75- 24' DX6LN", "RC to remove 1,2,3 and 8") — one complete task.
    if (RC_INLINE_RE.test(line)) {
      cur.groups.push({ label: line.replace(/^-\s*/, '').trim(), cases: [], inline: true }); action = null; continue;
    }
    if (action && CASE_CONTENT_RE.test(line)) action.cases.push(line);
  }
  const groupText = g => `${g.label} ${g.cases.join(' ')}`;
  // Explicit "RC to…" inline lines are RC by definition; section groups that
  // read as front-end fixture work with no case reference are not RC scope.
  const frontEndOnly = g => !g.inline && FRONT_END_FIXTURE_RE.test(groupText(g)) && !REAL_CASE_REF_RE.test(groupText(g));
  const usable = g => !frontEndOnly(g) && (g.inline || g.cases.length > 0 || /temp cases? out/i.test(g.label));
  return nights
    .filter(n => n.groups.some(usable))
    .map(n => {
      const tasks = n.groups.filter(usable).map(g => (g.inline || !g.cases.length) ? g.label : `${g.label}: ${g.cases.join('; ')}`);
      const blob = (n.header + ' ' + tasks.join(' ')).toLowerCase();
      return { date: n.date, header: n.header, week: n.week, isNight: n.isNight, frozen: /\bfrozen\b|ice\s*cream/.test(blob), tasks };
    });
}

export function formatSpan(startMs, endMs) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtOne = ms => {
    const d = new Date(ms);
    return `${months[d.getMonth()]} ${d.getDate()}`;
  };
  return `${fmtOne(startMs)} – ${fmtOne(endMs)}`;
}
