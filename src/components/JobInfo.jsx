import { useStore, fmt } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Card, SLabel, Input, Row, EmptyState } from './UI.jsx';

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

function tryParseDate(label) {
  // Schedule date labels look like "Monday, September 28th (Night) w15" — not
  // directly parseable by Date(). Pull out a month-day pattern if present so
  // we can sort chronologically; fall back to keeping original order otherwise.
  if (!label) return null;
  const match = label.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i);
  if (!match) return null;
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const monthIdx = months.indexOf(match[1].toLowerCase());
  const day = parseInt(match[2], 10);
  if (monthIdx < 0 || !day) return null;
  // Year is rarely stated per-line — use a placeholder year just for sort
  // ordering within a single document; this never gets displayed.
  return new Date(2000, monthIdx, day).getTime();
}

export default function JobInfo({ compact = false, showStoreFields = true }) {
  const { state, dispatch } = useStore();
  const schedule = state.rcSchedule || [];

  const sorted = [...schedule].sort((a, b) => {
    const ta = tryParseDate(a.date), tb = tryParseDate(b.date);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  });

  const uniqueDates = new Set(schedule.map(s => s.date).filter(Boolean)).size;

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
          <div style={{ height: 1, background: colors.border, margin: '4px 0 14px' }} />
        </>
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
                    <div style={{ fontSize: 10, fontWeight: 700, color: colors.green, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {item.date}
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
