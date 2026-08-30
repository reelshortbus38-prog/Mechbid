// ── ONE NIGHT, COUNTED ONCE ──────────────────────────────────────────────────
// Store 701's schedule names its header nights in full — "Monday, September
// 23rd (Night)" — and two things read that file: the deterministic reader,
// which normalises the header to "Sep 23", and the AI pass, which keeps the
// line as written. Both found the same task. Nothing deduped them, and nothing
// recognised the two labels as the same calendar day, so:
//
//   RC SCHEDULE      the Rack A header delivery appeared TWICE
//   ON-SITE DAYS     16, when the schedule has 15
//   NIGHT WORK       15 nights, when it has 14
//
// A night is a mobilisation. An extra one is an extra crew, an extra per diem
// and an extra premium shift in the labor picture, so this is a number that
// costs money rather than an untidy list.
//
// TWO RULES, AND THEY ARE SEPARATE ON PURPOSE:
//
//   canonicalDay   maps every label for one date onto one key, so counting
//                  distinct days stops depending on how a document phrased it.
//
//   sameTask       on the SAME day, one task containing the other is one task
//                  described at two levels of detail. The fuller text wins —
//                  "…Tag#40128 and #40643" is worth keeping over the version
//                  without it.
//
// Containment needs a floor. Two genuinely different short tasks on one night
// ("Set 5", "Set 9") must not collapse just because one is a substring, so
// below MIN_CONTAIN characters the texts have to match exactly.
//
// Pure — no React.

import { schedDateLabel } from './scheduleDates.js';

export const MIN_CONTAIN = 12;

// "Monday, September 23rd (Night)" and "Sep 23" are the same day. schedDateLabel
// normalises a full header; an already-short label has nothing to normalise and
// is kept as-is.
export function canonicalDay(label) {
  const raw = String(label || '').trim();
  if (!raw) return '';
  return (schedDateLabel(raw) || raw).toUpperCase().replace(/\s+/g, ' ');
}

export function taskKey(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Same task described at two levels of detail?
export function sameTask(a, b) {
  const x = taskKey(a), y = taskKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < MIN_CONTAIN) return false;
  return long.includes(short);
}

// Collapse duplicates. Keeps first-seen order; when two entries describe one
// task, the FULLER text is kept and the entry stays night if either said night.
export function dedupeSchedule(items = []) {
  const out = [];
  for (const item of items) {
    if (!item) continue;
    const day = canonicalDay(item.date);
    const text = item.task || item.desc || '';
    const hitIndex = out.findIndex(o => canonicalDay(o.date) === day && sameTask(o.task || o.desc || '', text));
    if (hitIndex === -1) { out.push(item); continue; }
    const hit = out[hitIndex];
    const hitText = hit.task || hit.desc || '';
    // Prefer the longer description, and never lose a night marking.
    const keepFuller = text.length > hitText.length ? item : hit;
    out[hitIndex] = {
      ...keepFuller,
      isNight: (hit.isNight === true || item.isNight === true) ? true : keepFuller.isNight,
      // Keep the normalised date rather than whichever label happened to win,
      // so the list reads consistently.
      date: schedDateLabel(String(hit.date || '')) || schedDateLabel(String(item.date || '')) || hit.date || item.date,
    };
  }
  return out;
}

// Distinct calendar days, however each was labelled.
export function distinctDays(items = []) {
  return new Set(items.map(i => canonicalDay(i?.date)).filter(Boolean)).size;
}

export function distinctNights(items = [], isNightFn) {
  const nights = items.filter(i => (isNightFn ? isNightFn(i) : i?.isNight === true));
  return new Set(nights.map(i => canonicalDay(i?.date)).filter(Boolean)).size;
}
