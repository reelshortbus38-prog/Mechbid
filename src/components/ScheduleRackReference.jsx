import { useState } from 'react';
import { useStore } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Card } from './UI.jsx';
import { buildDateParser, isNightDate } from './scheduleDates.js';

// Frozen-food / low-temp case work needs a bigger crew than medium-temp nights,
// so those nights are flagged. Rack work is a small separate crew.
const isFrozen = s => /\bfrozen\b|ice\s*cream|freezer|low[-\s]?temp/i.test(s || '');
const isCaseMove = s => /relocat|temp\s*set|disconnect|\bremove\b|case\s*move|\breset\b|wash\s*cases|pull|set\b/i.test(s || '');

// A read-only reference of the dated RC schedule and the rack work, shown on the
// Labor step so the estimator can size each phase's crew (e.g. 6 for frozen-food
// nights, 4 for other case-move nights, 1–2 for rack work) without flipping back
// to Setup to see the schedule.
export default function ScheduleRackReference() {
  const { state } = useStore();
  const schedule = state.rcSchedule || [];
  const rackTasks = state.rackTasks || [];
  const rackParts = (state.rackParts || []).filter(p => !p.storeSupplied);
  // Redline callouts and scope piping notes ("[C7] REPLACE 7/8 SUCTION LINE
  // WITH 1 3/8...") — accepted notes land in flags with type 'note'. They're
  // the field piping scope, so they belong here where crews get sized, not
  // only back on Setup.
  const fieldNotes = (state.flags || []).filter(f => f.type === 'note');
  const [open, setOpen] = useState(true);

  if (schedule.length === 0 && rackTasks.length === 0 && rackParts.length === 0 && fieldNotes.length === 0) return null;

  const parse = buildDateParser(schedule);
  const sorted = [...schedule].sort((a, b) => {
    const ta = parse(a.date), tb = parse(b.date);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  });

  const nightDates = new Set(schedule.filter(s => isNightDate(s.date)).map(s => s.date).filter(Boolean)).size;
  const frozenDates = new Set(schedule.filter(s => isFrozen(s.desc) || isFrozen(s.notes) || isFrozen(s.rawDesc)).map(s => s.date).filter(Boolean)).size;

  const subtitleBits = [
    schedule.length ? `${schedule.length} schedule item${schedule.length !== 1 ? 's' : ''}` : '',
    nightDates ? `🌙 ${nightDates} night${nightDates !== 1 ? 's' : ''}` : '',
    frozenDates ? `❄️ ${frozenDates} frozen-food night${frozenDates !== 1 ? 's' : ''}` : '',
    (rackTasks.length || rackParts.length) ? `🔩 ${rackTasks.length} rack task${rackTasks.length !== 1 ? 's' : ''}` : '',
    fieldNotes.length ? `📐 ${fieldNotes.length} field note${fieldNotes.length !== 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ');

  const badge = (icon, text, color) => (
    <span style={{ fontSize: 10, color, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>{icon} {text}</span>
  );

  return (
    <Card>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700 }}>📋 Schedule & rack work</div>
          <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>Reference for sizing crews — {subtitleBits || 'no dated schedule yet'}</div>
        </div>
        <div style={{ color: colors.textDim, fontSize: 13 }}>{open ? '▾' : '▸'}</div>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          {/* Key dates */}
          {(state.preconDate || state.rcStartDate || state.rccDate || state.jobLength) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontSize: 11, color: colors.textDim }}>
              {state.preconDate && badge('📅', `Pre-con ${state.preconDate}`, colors.text)}
              {state.rcStartDate && badge('🌙', `RC start ${state.rcStartDate}`, colors.text)}
              {state.rccDate && badge('✅', `RCC ${state.rccDate}`, colors.text)}
              {state.jobLength && badge('⏱️', state.jobLength, colors.text)}
            </div>
          )}

          <div style={{ fontSize: 10, color: colors.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
            ❄️ frozen-food nights usually need a bigger crew · 🌙 marks night work · use the periods below to set crew size per phase.
          </div>

          {/* Dated schedule */}
          {sorted.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', marginBottom: 14 }}>
              {sorted.map((item, i) => {
                const tasks = item.tasks && item.tasks.length ? item.tasks : [item.desc].filter(Boolean);
                const frozen = item.frozen || tasks.some(isFrozen) || isFrozen(item.notes);
                const night = item.isNight != null ? item.isNight : isNightDate(item.date);
                const move = tasks.some(isCaseMove) || isCaseMove(item.rawDesc);
                return (
                  <div key={item.id || i} style={{ background: frozen ? 'rgba(6,182,212,0.06)' : colors.surface, border: `1px solid ${frozen ? colors.cyan : colors.border}`, borderRadius: 7, padding: '7px 10px' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                      {item.date && <span style={{ fontSize: 11, fontWeight: 700, color: colors.green }}>{item.date}{item.week ? ` · w${item.week}` : ''}</span>}
                      {night && badge('🌙', 'night', colors.yellow)}
                      {frozen && badge('❄️', 'frozen', colors.cyan)}
                      {move && !frozen && badge('📦', 'case move', colors.textDim)}
                      {item.circuitRef && badge('', item.circuitRef, colors.textDim)}
                    </div>
                    {tasks.map((t, j) => (
                      <div key={j} style={{ fontSize: 12, color: colors.text, lineHeight: 1.45, paddingLeft: tasks.length > 1 ? 10 : 0, textIndent: tasks.length > 1 ? -8 : 0 }}>
                        {tasks.length > 1 ? '• ' : ''}{t}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Rack work */}
          {(rackTasks.length > 0 || rackParts.length > 0) && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Rack work ({rackTasks.length} task{rackTasks.length !== 1 ? 's' : ''}{rackParts.length ? ` · ${rackParts.length} part${rackParts.length !== 1 ? 's' : ''}` : ''})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 200, overflowY: 'auto' }}>
                {rackTasks.map((t, i) => (
                  <div key={t.id || i} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 7, padding: '6px 10px', fontSize: 12, color: colors.text }}>
                    🔩 {t.desc}{t.notes ? <span style={{ color: colors.textDim }}> — {t.notes}</span> : null}
                  </div>
                ))}
                {rackTasks.length === 0 && rackParts.length > 0 && (
                  <div style={{ fontSize: 11, color: colors.textDim }}>{rackParts.length} contractor-supplied rack part{rackParts.length !== 1 ? 's' : ''} to install — size a small rack crew (typically 1–2).</div>
                )}
              </div>
            </div>
          )}

          {/* Field notes — redline callouts & scope piping items. This is the
              piping scope the field crews execute, so it's shown here where
              crews are sized, not only on Setup. */}
          {fieldNotes.length > 0 && (
            <div style={{ marginTop: rackTasks.length || rackParts.length ? 14 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Field notes / redline callouts ({fieldNotes.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 240, overflowY: 'auto' }}>
                {fieldNotes.map((f, i) => (
                  <div key={i} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 7, padding: '6px 10px', fontSize: 12, color: colors.text, lineHeight: 1.45 }}>
                    📐 {f.text}
                    {f.source ? <span style={{ color: colors.textMuted, fontSize: 10 }}> — {f.source}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
