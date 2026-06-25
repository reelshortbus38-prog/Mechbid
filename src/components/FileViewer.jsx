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

function viewFile(f) {
  if (!f.previewUrl) return;
  // Open the blob URL directly in a new tab — the browser handles it natively:
  // images display as images, PDFs open in the PDF viewer, exactly like
  // tapping a file link. User closes the tab to go back to the app.
  window.open(f.previewUrl, '_blank');
}

// ── FILE LIST ─────────────────────────────────────────────────────────────────
export function FileList() {
  const { state, dispatch } = useStore();
  const files = (state.uploadedFiles || []).filter(f => f.mode === state.mode);

  if (files.length === 0) return null;

  function removeFile(id) {
    dispatch({ type: 'SET', key: 'uploadedFiles', value: state.uploadedFiles.filter(f => f.id !== id) });
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
            {f.size && <div style={{ fontSize: 10, color: colors.textDim }}>{formatSize(f.size)}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {f.previewUrl ? (
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
