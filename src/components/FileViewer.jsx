import { loadCachedFile, hasCachedFile } from '../api/fileCache.js';
import { useAuth } from '../lib/auth.jsx';
import { useStore } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Card, SLabel, Btn } from './UI.jsx';

function fileIcon(type) {
  if (type === 'image') return '🖼️';
  if (type === 'pdf')   return '📐';
  if (type === 'scope') return '📄';
  if (type === 'excel' || type === 'xls') return '📊';
  return '📎';
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ── OPENING A FILE, INCLUDING ONE FROM LAST WEEK ────────────────────────────
// This used to require f.previewUrl, a blob URL made at upload. Those die with
// the tab, and store.js strips them on save, so after a break the View button
// simply vanished and the only way to look at the drawing you priced from was
// to upload the whole set again.
//
// Now the bytes are on the device (see api/fileCache.js), so a URL is made on
// demand. The window is opened BEFORE the await: iOS Safari blocks
// window.open once it can no longer see the user's tap behind it, and an
// await is long enough to lose that. So the tab is claimed up front and
// pointed at the file when it arrives.
async function viewFile(f) {
  if (f.previewUrl) { window.open(f.previewUrl, '_blank'); return; }

  const tab = window.open('', '_blank');
  const blob = await loadCachedFile(f.id);
  if (!blob) {
    if (tab) tab.close();
    // Say so. A button that silently does nothing is worse than one that
    // explains — the usual cause is a job built on another device by someone
    // who was not signed in when they uploaded.
    alert(`${f.name} isn't on this device and couldn't be fetched from your account.`);
    return;
  }
  const url = URL.createObjectURL(blob);
  if (tab) tab.location = url;
  else window.open(url, '_blank');
  // Not revoked immediately: the new tab still has to load from it. The URL
  // dies with this page anyway.
}

// ── FILE LIST ─────────────────────────────────────────────────────────────────
export function FileList({ fileStatuses = {} }) {
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const files = (state.uploadedFiles || []).filter(f => f.mode === state.mode);

  if (files.length === 0) return null;

  function removeFile(id) {
    dispatch({ type: 'SET', key: 'uploadedFiles', value: state.uploadedFiles.filter(f => f.id !== id) });
  }

  function statusBadge(id) {
    const s = fileStatuses[id];
    if (s === 'done')      return <span style={{ fontSize: 10, color: '#4caf50' }}>✅ Done</span>;
    if (s === 'error')     return <span style={{ fontSize: 10, color: '#f44336' }}>❌ Error</span>;
    if (s === 'analyzing') return <span style={{ fontSize: 10, color: '#ff9800' }}>⏳ Analyzing</span>;
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {files.map(f => (
        <div
          key={f.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: colors.card2, border: `1px solid ${colors.border}`,
            borderRadius: 8, padding: '8px 10px',
          }}
        >
          <span style={{ fontSize: 16, flexShrink: 0 }}>{fileIcon(f.type)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {f.name}
            </div>
            <div style={{ fontSize: 10, color: colors.textDim, marginTop: 2, display: 'flex', gap: 8 }}>
              {f.size && <span>{formatSize(f.size)}</span>}
              {statusBadge(f.id)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {/* Offered when the file is on this device OR could be fetched
                 from the account. On a phone opening an iPad's job the second
                 is the only one true, and a button that fetches beats no
                 button — if it cannot be got, viewFile says so.
                 Keyed off `user` and NOT off the cache's own registration
                 flag: that flag is a module variable, so React never re-runs
                 this when signing in sets it. The phone rendered this list
                 before the effect registered the cloud, saw no cloud, and
                 said "No preview" forever. `user` comes from context and
                 re-renders properly. */}
            {(f.previewUrl || hasCachedFile(f.id) || !!user) ? (
              <Btn variant="surface" size="sm" onClick={() => viewFile(f)}>View</Btn>
            ) : (
              <span style={{ fontSize: 10, color: colors.textDim, padding: '4px 6px' }}>No preview</span>
            )}
            <button
              onClick={() => removeFile(f.id)}
              style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 13 }}
            >×</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── DOCS PANEL (header button) ─────────────────────────────────────────────────
export default function FileViewerPanel({ onClose }) {
  const { state } = useStore();
  const files = (state.uploadedFiles || []).filter(f => f.mode === state.mode);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 16,
          width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: colors.green }}>
            📁 Uploaded Files
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: colors.textDim, fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {files.length === 0 ? (
            <div style={{ textAlign: 'center', color: colors.textDim, fontSize: 13, padding: '32px 0' }}>
              No files uploaded yet
            </div>
          ) : (
            <FileList />
          )}
        </div>
      </div>
    </div>
  );
}
