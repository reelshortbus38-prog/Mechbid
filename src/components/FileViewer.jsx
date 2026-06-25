import { useState } from 'react';
import { useStore } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Card, SLabel, Row, Btn } from './UI.jsx';

// File type icons and preview capability
function fileIcon(type) {
  if (type === 'image') return '🖼️';
  if (type === 'pdf')   return '📐';
  if (type === 'scope') return '📄';
  if (type === 'excel' || type === 'xls') return '📊';
  return '📎';
}

function canPreview(type) {
  return type === 'image' || type === 'pdf';
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ── FULL-SCREEN VIEWER MODAL ───────────────────────────────────────────────────
function ViewerModal({ file, onClose }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
        zIndex: 300, display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: `1px solid ${colors.border}`,
          background: colors.card2, flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{file.name}</div>
          {file.size && <div style={{ fontSize: 10, color: colors.textDim, marginTop: 2 }}>{formatSize(file.size)}</div>}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: colors.textDim, fontSize: 24, cursor: 'pointer', lineHeight: 1 }}
        >×</button>
      </div>

      {/* Content */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16 }}
      >
        {file.type === 'image' && file.previewUrl && !imgError ? (
          <img
            src={file.previewUrl}
            alt={file.name}
            onError={() => setImgError(true)}
            style={{ maxWidth: '100%', borderRadius: 8, boxShadow: '0 4px 32px rgba(0,0,0,0.6)' }}
          />
        ) : file.type === 'pdf' && file.previewUrl ? (
          <iframe
            src={file.previewUrl}
            title={file.name}
            style={{ width: '100%', height: 'calc(100vh - 120px)', border: 'none', borderRadius: 8 }}
          />
        ) : (
          <div style={{
            background: colors.card2, border: `1px solid ${colors.border}`,
            borderRadius: 12, padding: 32, textAlign: 'center', maxWidth: 320,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{fileIcon(file.type)}</div>
            <div style={{ fontSize: 14, color: colors.text, marginBottom: 8 }}>{file.name}</div>
            <div style={{ fontSize: 12, color: colors.textDim }}>
              This file type can't be previewed in the app. The AI has already read its contents — check the extraction results above.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── FILE LIST (used both on Setup and as a standalone panel) ───────────────────
export function FileList({ maxVisible = 999 }) {
  const { state, dispatch } = useStore();
  const [viewing, setViewing] = useState(null);

  const files = (state.uploadedFiles || []).filter(f => f.mode === state.mode);
  const visible = files.slice(0, maxVisible);

  if (files.length === 0) return null;

  function removeFile(id) {
    dispatch({ type: 'SET', key: 'uploadedFiles', value: state.uploadedFiles.filter(f => f.id !== id) });
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map(f => (
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
              {canPreview(f.type) && f.previewUrl ? (
                <Btn variant="surface" size="sm" onClick={() => setViewing(f)}>View</Btn>
              ) : !canPreview(f.type) ? (
                <Btn variant="surface" size="sm" onClick={() => setViewing(f)}>Info</Btn>
              ) : null}
              <button
                onClick={() => removeFile(f.id)}
                style={{ background: colors.red, border: 'none', color: '#fff', borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 13 }}
              >×</button>
            </div>
          </div>
        ))}
        {files.length > maxVisible && (
          <div style={{ fontSize: 11, color: colors.textDim, textAlign: 'center', padding: '4px 0' }}>
            +{files.length - maxVisible} more — open Docs panel to see all
          </div>
        )}
      </div>

      {viewing && <ViewerModal file={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

// ── FULL DOCS PANEL (opened from header button) ────────────────────────────────
export default function FileViewerPanel({ onClose }) {
  const { state } = useStore();
  const [viewing, setViewing] = useState(null);

  const files = (state.uploadedFiles || []).filter(f => f.mode === state.mode);

  function removeFile(id) {
    // Can't dispatch here without useStore, handled via FileList which has its own dispatch
  }

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
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: colors.green }}>
            📁 Uploaded Files
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: colors.textDim, fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {/* File list */}
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

      {viewing && <ViewerModal file={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
