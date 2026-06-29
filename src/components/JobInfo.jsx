import { useStore, fmt } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Card, SLabel, Input, Row, EmptyState } from './UI.jsx';
import { buildDateParser, isNightDate, extractWeekNum, formatSpan } from './scheduleDates.js';

// ── JOB INFO ─────────────────────────────────────────────────────────────────
// A dedicated, easy-to-find home for store info and the dated RC schedule —
// separate from the quick fields buried in Setup. Meant to be dropped into
// multiple steps (Setup, Proposal, anywhere it's useful) so this information
// doesn't require digging back into Step1 to find or check.
//
// Store info (name/number/address) reads from and writes to the same
// projName/projAddr/storeNumber fields Setup uses — there's only one copy of
// this data, just shown in more places. The RC schedule (state.rcSchedule) is
// its own list: dated, reviewed RC tasks pulled from schedule documents,
// sorted chronologically, read-only by default with simple edit/remove since
// this is meant as a reference view, not a second labor-hours input table
// (that's still Step5's Field Tasks section).

export default function JobInfo({ compact = false, showStoreFields = true }) {
  const { state, dispatch } = useStore();
  const schedule = state.rcSchedule || [];

  // Build a date parser that's aware of this specific schedule's date range,
  // so jobs crossing a calendar year boundary (e.g. Sep → Jan) sort correctly
  // instead of January appearing before September.
  const tryParseDate = buildDateParser(schedule);

  const sorted = [...schedule].sort((a, b) => {
    const ta = tryParseDate(a.date), tb = tryParseDate(b.date);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  });

  const uniqueDates = new Set(schedule.map(s => s.date).filter(Boolean)).size;

  // Derived span/week/night-work numbers — all computed directly from the
  // dates already attached to accepted schedule items, nothing fabricated.
  // If dates don't parse (no month name found in any label), these stay null
  // and the summary row simply doesn't show that stat rather than guessing.
  const parsedDates = schedule.map(s => tryParseDate(s.date)).filter(d => d != null);
  const minDate = parsedDates.length ? Math.min(...parsedDates) : null;
  const maxDate = parsedDates.length ? Math.max(...parsedDates) : null;

  const weekNums = schedule.map(s => extractWeekNum(s.date)).filter(w => w != null);
  const minWeek = weekNums.length ? Math.min(...weekNums) : null;
  const maxWeek = weekNums.length ? Math.max(...weekNums) : null;

  const nightDates = new Set(schedule.filter(s => isNightDate(s.date)).map(s => s.date)).size;

  function removeItem(id) {
    dispatch({ type: 'REMOVE_RC_SCHEDULE_ITEM', id });
  }

  function updateItem(id, field, value) {
    dispatch({ type: 'UPDATE_RC_SCHEDULE_ITEM', id, updates: { [field]: value } });
  }

  return (
    <Card>
      {showStoreFields && (
        <>
          <Row style={{ justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700 }}>🏪 Job Info</div>
              <div style={{ fontSize: 12, color: colors.textDim, marginTop: 2 }}>Store details & RC schedule</div>
            </div>
          </Row>

          {/* Store info — same underlying fields as Setup, just surfaced here too */}
          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Project / Store Name</div>
              <Input value={state.projName || ''} onChange={e => dispatch({ type: 'SET', key: 'projName', value: e.target.value })} placeholder="e.g. Food Lion #0047" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Store Number</div>
              <Input value={state.storeNumber || ''} onChange={e => dispatch({ type: 'SET', key: 'storeNumber', value: e.target.value })} placeholder="e.g. 0047" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Address</div>
              <Input value={state.projAddr || ''} onChange={e => dispatch({ type: 'SET', key: 'projAddr', value: e.target.value })} placeholder="Street, City, State" />
            </div>
          </div>
          {/* Key bid dates — pre-con, RC night-work start, total job length */}
          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Pre-Con Date</div>
              <Input value={state.preconDate || ''} onChange={e => dispatch({ type: 'SET', key: 'preconDate', value: e.target.value })} placeholder="e.g. Aug 4" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>RC Start (Night Work / Case Moves)</div>
              <Input value={state.rcStartDate || ''} onChange={e => dispatch({ type: 'SET', key: 'rcStartDate', value: e.target.value })} placeholder="e.g. Aug 18" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Total Job Length</div>
              <Input value={state.jobLength || ''} onChange={e => dispatch({ type: 'SET', key: 'jobLength', value: e.target.value })} placeholder="e.g. 16 weeks" />
            </div>
          </div>
          {(minDate != null || maxWeek != null) && (
            <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 14 }}>
              RC field tasks: {minDate != null ? `${formatSpan(minDate, maxDate)}` : ''}{minDate != null && maxWeek != null ? ' · ' : ''}{maxWeek != null ? `weeks 1–${maxWeek}` : ''}{nightDates > 0 ? ` · ${nightDates} night${nightDates !== 1 ? 's' : ''}` : ''}. The total job length above is the whole project (GC punch, commissioning, RCC run later) — confirm the dates.
            </div>
          )}
          <div style={{ height: 1, background: colors.border, margin: '4px 0 14px' }} />
        </>
      )}
      {/* Derived schedule summary — span, week range, RC day count, night-work
          count. Only shows numbers actually derivable from dated tasks already
          accepted into the schedule below; nothing here is estimated or
          fabricated, it's pure counting/min-max over real data. */}
      {schedule.length > 0 && (minDate != null || minWeek != null) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 16 }}>
          {minDate != null && (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>RC Task Span</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800 }}>{formatSpan(minDate, maxDate)}</div>
            </div>
          )}
          {minWeek != null && (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>RC Task Weeks</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800 }}>
                {minWeek === maxWeek ? `Week ${minWeek}` : `Weeks ${minWeek}–${maxWeek}`}
              </div>
            </div>
          )}
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>RC On-Site Days</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800, color: colors.green }}>{uniqueDates} distinct day{uniqueDates !== 1 ? 's' : ''}</div>
          </div>
          {nightDates > 0 && (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Night Work</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800, color: colors.yellow }}>🌙 {nightDates} night{nightDates !== 1 ? 's' : ''}</div>
            </div>
          )}
        </div>
      )}

      <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <SLabel>RC Schedule</SLabel>
        {schedule.length > 0 && (
          <div style={{ fontSize: 11, color: colors.textDim }}>
            {schedule.length} task{schedule.length !== 1 ? 's' : ''} · {uniqueDates} distinct day{uniqueDates !== 1 ? 's' : ''}
          </div>
        )}
      </Row>

      {schedule.length === 0 ? (
        <EmptyState icon="📅" title="No RC schedule yet" subtitle="Accept dated tasks from a schedule document in Setup to populate this list" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
          {sorted.map(item => (
            <div key={item.id} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px' }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  {item.date && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: colors.green, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {item.date}
                      </span>
                      {isNightDate(item.date) && (
                        <span style={{ fontSize: 9, background: 'rgba(234,179,8,0.15)', color: colors.yellow, padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>🌙 NIGHT</span>
                      )}
                    </div>
                  )}
                  <Input
                    value={item.desc || ''}
                    onChange={e => updateItem(item.id, 'desc', e.target.value)}
                    style={{ fontSize: 12, padding: '6px 8px' }}
                  />
                  {item.circuitRef && (
                    <div style={{ fontSize: 10, color: colors.textDim, marginTop: 4 }}>Circuit: {item.circuitRef}</div>
                  )}
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
                >×</button>
              </Row>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
