import { colors } from '../styles/theme.js';
import { useStore } from '../state/store.js';

// ── THE ROW YOU DID NOT MEAN TO DELETE ──────────────────────────────────────
// One component for every list that has an ×, because there are three of them
// now — refrigeration materials, commercial HVAC parts, residential parts —
// and three copies of this would be three chances for one of them to quietly
// stop working.
//
// The HVAC lists matter MORE than the one this started on. A generated
// materials line can be rebuilt by regenerating, at the cost of every hand
// edit; an HVAC part was typed by somebody, and nothing in the app can put it
// back.
export default function UndoDelete({ listKey, what = 'line' }) {
  const { state, dispatch } = useStore();
  const trail = (state.deletedItems || {})[listKey] || [];
  if (!trail.length) return null;

  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px',
      background: colors.surface, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: colors.textDim }}>
          Deleted just now — tap to put it back
        </span>
        <button
          onClick={() => dispatch({ type: 'CLEAR_DELETED_LIST', key: listKey })}
          style={{ background: 'transparent', border: 'none', color: colors.textMuted, fontSize: 11,
            cursor: 'pointer', padding: 0, fontFamily: "'DM Sans', sans-serif" }}
        >Dismiss</button>
      </div>
      {trail.map((d, i) => (
        <button
          key={`${d.item?.id}-${i}`}
          onClick={() => dispatch({ type: 'RESTORE_LIST_ITEM', key: listKey, at: i })}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
            background: colors.card2, border: `1px solid ${colors.border}`, borderRadius: 6,
            padding: '8px 10px', cursor: 'pointer', color: colors.text, fontSize: 12,
            fontFamily: "'DM Sans', sans-serif", minHeight: 38 }}
        >
          <span style={{ color: colors.green, fontWeight: 700, flexShrink: 0 }}>↩ Undo</span>
          <span style={{ color: colors.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.item?.qty || 0} {d.item?.unit || 'ea'} · {d.item?.desc || `Untitled ${what}`}
          </span>
        </button>
      ))}
    </div>
  );
}
