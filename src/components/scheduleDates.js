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

export function formatSpan(startMs, endMs) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtOne = ms => {
    const d = new Date(ms);
    return `${months[d.getMonth()]} ${d.getDate()}`;
  };
  return `${fmtOne(startMs)} – ${fmtOne(endMs)}`;
}
