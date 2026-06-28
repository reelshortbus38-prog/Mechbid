import { useState } from 'react';
import { useStore, uid } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { Btn, Card, SLabel, Input, Row, EmptyState, Badge } from './UI.jsx';

// ── CONFIDENCE BADGE ───────────────────────────────────────────────────────────
// Source type determines how much we trust it by default.
// 'vision'  = AI read a photo/scan and guessed — lowest trust, always flagged.
// 'doctext' = AI read extracted text from a scope doc — medium trust.
// 'excel'   = parsed directly from spreadsheet cells — highest trust, little room for AI error.
function sourceMeta(sourceType) {
  switch (sourceType) {
    case 'vision':  return { label: 'Photo/Scan — AI Read', color: colors.red,    icon: '📷' };
    case 'doctext': return { label: 'Scope Doc — AI Read',  color: colors.yellow, icon: '📝' };
    case 'excel':   return { label: 'Spreadsheet — Parsed', color: colors.green,  icon: '📊' };
    default:        return { label: 'Unknown Source',       color: colors.textDim, icon: '❓' };
  }
}

// ── SINGLE REVIEW ROW ──────────────────────────────────────────────────────────
function ReviewRow({ item, onChange, onToggle }) {
  const meta = sourceMeta(item.sourceType);
  const accepted = item.status === 'accepted';
  const rejected = item.status === 'rejected';

  return (
    <div style={{
      border: `1px solid ${rejected ? colors.border : accepted ? colors.green + '60' : colors.border}`,
      background: rejected ? colors.surface + '40' : accepted ? colors.greenFaint : colors.card2,
      borderRadius: 10, padding: '12px 14px', marginBottom: 8, opacity: rejected ? 0.5 : 1, transition: 'all 0.15s',
    }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 10, alignItems: 'flex-start' }}>
        <Row style={{ gap: 8 }}>
          <Badge color={meta.color}>{meta.icon} {meta.label}</Badge>
          <span style={{ fontSize: 10, color: colors.textDim }}>from {item.fileName}</span>
        </Row>
        <Row style={{ gap: 6 }}>
          <button
            onClick={() => onToggle('accepted')}
            style={{
              background: accepted ? colors.green : 'transparent', color: accepted ? '#000' : colors.green,
              border: `1px solid ${colors.green}`, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >✓ Accept</button>
          <button
            onClick={() => onToggle('rejected')}
            style={{
              background: rejected ? colors.red : 'transparent', color: rejected ? '#fff' : colors.red,
              border: `1px solid ${colors.red}`, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >✕ Skip</button>
        </Row>
      </Row>

      {/* Editable fields — different shape per item kind */}
      <div style={{ display: 'grid', gridTemplateColumns: item.kind === 'circuit' ? 'repeat(3,1fr)' : '1fr', gap: 8 }}>
        {item.kind === 'circuit' && (
          <>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Circuit ID</div>
              <Input value={item.data.circuitId || ''} onChange={e => onChange({ ...item.data, circuitId: e.target.value })} style={{ fontSize: 12 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Run Length (ft)</div>
              <Input type="number" value={item.data.runLength || ''} onChange={e => onChange({ ...item.data, runLength: e.target.value })} style={{ fontSize: 12 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Application</div>
              <Input value={item.data.application || ''} onChange={e => onChange({ ...item.data, application: e.target.value })} style={{ fontSize: 12 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Suction Size</div>
              <Input value={item.data.sucHoriz || ''} onChange={e => onChange({ ...item.data, sucHoriz: e.target.value })} style={{ fontSize: 12 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Liquid Size</div>
              <Input value={item.data.liqHoriz || ''} onChange={e => onChange({ ...item.data, liqHoriz: e.target.value })} style={{ fontSize: 12 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Temp Type</div>
              <Input value={item.data.tempType || ''} onChange={e => onChange({ ...item.data, tempType: e.target.value })} style={{ fontSize: 12 }} />
            </div>
          </>
        )}

        {item.kind === 'fieldTask' && (
          <div>
            <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Task Description</div>
            <Input value={item.data.desc || ''} onChange={e => onChange({ ...item.data, desc: e.target.value })} style={{ fontSize: 12 }} />
            {(item.data.desc || '').includes('[unclear]') && (
              <div style={{ marginTop: 6, fontSize: 11, color: colors.red, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚠️ The AI couldn't read part of this clearly — check the source document and fill in the [unclear] part before accepting.
              </div>
            )}
          </div>
        )}

        {item.kind === 'note' && (
          <div>
            <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>
              {item.data.date ? `Schedule Note · ${item.data.date}` : 'Redline Note'}{item.data.circuitRef ? ` · ${item.data.circuitRef}` : ''}{item.data.location ? ` · ${item.data.location}` : ''}
            </div>
            <Input value={item.data.desc || ''} onChange={e => onChange({ ...item.data, desc: e.target.value })} style={{ fontSize: 12 }} />
            {(item.data.desc || '').includes('[unclear]') && (
              <div style={{ marginTop: 6, fontSize: 11, color: colors.red, fontWeight: 700 }}>
                ⚠️ Part of this callout was unclear — check the drawing before accepting.
              </div>
            )}
          </div>
        )}

        {item.kind === 'rackTask' && (
          <div>
            <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Rack Task Description</div>
            <Input value={item.data.desc || ''} onChange={e => onChange({ ...item.data, desc: e.target.value })} style={{ fontSize: 12 }} />
            {(item.data.desc || '').includes('[unclear]') && (
              <div style={{ marginTop: 6, fontSize: 11, color: colors.red, fontWeight: 700 }}>
                ⚠️ The AI couldn't read part of this clearly — check the source document and fill in the [unclear] part before accepting.
              </div>
            )}
          </div>
        )}

        {item.kind === 'part' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Part Description</div>
              <Input value={item.data.desc || ''} onChange={e => onChange({ ...item.data, desc: e.target.value })} style={{ fontSize: 12 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Part #</div>
              <Input value={item.data.partId || ''} onChange={e => onChange({ ...item.data, partId: e.target.value })} style={{ fontSize: 12 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Qty</div>
              <Input type="number" value={item.data.qty || ''} onChange={e => onChange({ ...item.data, qty: e.target.value })} style={{ fontSize: 12 }} />
            </div>
          </div>
        )}

        {item.kind === 'projectInfo' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Project Name</div>
              <Input value={item.data.projName || ''} onChange={e => onChange({ ...item.data, projName: e.target.value })} style={{ fontSize: 12 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 4 }}>Address</div>
              <Input value={item.data.projAddr || ''} onChange={e => onChange({ ...item.data, projAddr: e.target.value })} style={{ fontSize: 12 }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN REVIEW SCREEN ─────────────────────────────────────────────────────────
// pendingItems: array of { id, kind, sourceType, fileName, data, status }
// onResolve(acceptedItems): called when user finishes review — only accepted items get merged into real state
export default function ReviewExtraction({ pendingItems, onResolve, onCancel }) {
  const [items, setItems] = useState(
    pendingItems.map(i => ({ ...i, status: i.status || (i.sourceType === 'excel' ? 'accepted' : 'pending') }))
  );

  function updateItemData(id, newData) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, data: newData } : i));
  }

  function toggleStatus(id, status) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: i.status === status ? 'pending' : status } : i));
  }

  function acceptAllVisible() {
    setItems(prev => prev.map(i => {
      if (i.status === 'rejected') return i;
      // Never bulk-accept an item the AI flagged as unclear — that always needs
      // an individual look against the source document, not a sweep-through.
      const hasUnclear = typeof i.data?.desc === 'string' && i.data.desc.includes('[unclear]');
      if (hasUnclear) return i;
      return { ...i, status: 'accepted' };
    }));
  }

  // Bulk accept/skip everything in one category (e.g. all Field Tasks at once),
  // so a big section doesn't have to be triaged one card at a time.
  function setKindStatus(kind, status) {
    setItems(prev => prev.map(i => {
      if (i.kind !== kind) return i;
      if (status === 'accepted') {
        const hasUnclear = typeof i.data?.desc === 'string' && i.data.desc.includes('[unclear]');
        if (hasUnclear) return i; // unclear items are never swept in
      }
      return { ...i, status };
    }));
  }

  // Sections collapse so you can fold away a category you've handled and jump
  // to the next — keeps a 20+ item extraction scannable.
  const [collapsed, setCollapsed] = useState({});
  const toggleCollapse = kind => setCollapsed(c => ({ ...c, [kind]: !c[kind] }));

  const grouped = {
    projectInfo: items.filter(i => i.kind === 'projectInfo'),
    circuit: items.filter(i => i.kind === 'circuit'),
    note: items.filter(i => i.kind === 'note'),
    rackTask: items.filter(i => i.kind === 'rackTask'),
    fieldTask: items.filter(i => i.kind === 'fieldTask'),
    part: items.filter(i => i.kind === 'part'),
  };

  const pendingCount = items.filter(i => i.status === 'pending').length;
  const acceptedCount = items.filter(i => i.status === 'accepted').length;
  const visionCount = items.filter(i => i.sourceType === 'vision').length;

  const KIND_LABELS = {
    projectInfo: { title: 'Project Info', icon: '📋' },
    circuit: { title: 'Circuits', icon: '⚡' },
    note: { title: 'Notes (scope & schedule — not labor)', icon: '📝' },
    rackTask: { title: 'Rack Tasks', icon: '🔩' },
    fieldTask: { title: 'Field Tasks', icon: '🔨' },
    part: { title: 'Parts', icon: '🔧' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <Card style={{ background: colors.greenFaint, border: `1px solid ${colors.green}40` }}>
        <SLabel>Review Before Adding to Bid</SLabel>
        <div style={{ fontSize: 12, color: colors.text, lineHeight: 1.6, marginBottom: 10 }}>
          Nothing below is in your bid yet. Check each item against the source document, then Accept or Skip.
          {visionCount > 0 && (
            <> <strong style={{ color: colors.red }}>{visionCount} item{visionCount > 1 ? 's' : ''}</strong> came from AI reading a photo — these are the most likely to contain errors, so double-check them carefully.</>
          )}
        </div>
        <Row style={{ gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12 }}><strong style={{ color: colors.green }}>{acceptedCount}</strong> accepted</div>
          <div style={{ fontSize: 12 }}><strong style={{ color: colors.yellow }}>{pendingCount}</strong> awaiting review</div>
          <div style={{ fontSize: 12 }}><strong style={{ color: colors.red }}>{items.filter(i => i.status === 'rejected').length}</strong> skipped</div>
        </Row>
      </Card>

      {items.length === 0 ? (
        <Card><EmptyState icon="🤷" title="Nothing extracted" subtitle="No items were found in the uploaded documents" /></Card>
      ) : (
        Object.entries(grouped).map(([kind, list]) => {
          if (list.length === 0) return null;
          const label = KIND_LABELS[kind];
          const isCollapsed = !!collapsed[kind];
          const accepted = list.filter(i => i.status === 'accepted').length;
          const skipped = list.filter(i => i.status === 'rejected').length;
          const pending = list.length - accepted - skipped;
          return (
            <div key={kind} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, overflow: 'hidden' }}>
              {/* Section header — collapse toggle + per-category bulk actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', background: colors.surface, flexWrap: 'wrap' }}>
                <div onClick={() => toggleCollapse(kind)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, minWidth: 160 }}>
                  <span style={{ color: colors.textDim, fontSize: 12 }}>{isCollapsed ? '▶' : '▼'}</span>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14 }}>{label.icon} {label.title}</span>
                  <span style={{ fontSize: 11, color: colors.textDim }}>
                    {list.length} total{pending > 0 ? ` · ${pending} to review` : ''}
                    {accepted > 0 ? ` · ` : ''}{accepted > 0 && <span style={{ color: colors.green }}>{accepted} ✓</span>}
                    {skipped > 0 ? ` · ` : ''}{skipped > 0 && <span style={{ color: colors.red }}>{skipped} ✕</span>}
                  </span>
                </div>
                <Row style={{ gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setKindStatus(kind, 'accepted')} style={{ background: 'transparent', color: colors.green, border: `1px solid ${colors.green}`, borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✓ Accept all</button>
                  <button onClick={() => setKindStatus(kind, 'rejected')} style={{ background: 'transparent', color: colors.red, border: `1px solid ${colors.red}`, borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✕ Skip all</button>
                </Row>
              </div>
              {!isCollapsed && (
                <div style={{ padding: '10px 12px' }}>
                  {list.map(item => (
                    <ReviewRow
                      key={item.id}
                      item={item}
                      onChange={newData => updateItemData(item.id, newData)}
                      onToggle={status => toggleStatus(item.id, status)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      <Row style={{ justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
        <Btn variant="ghost" onClick={onCancel}>Discard All</Btn>
        <Row style={{ gap: 10 }}>
          <Btn variant="surface" size="sm" onClick={acceptAllVisible}>Accept All Remaining</Btn>
          <Btn
            variant="green"
            onClick={() => onResolve(items.filter(i => i.status === 'accepted'))}
            disabled={acceptedCount === 0}
          >
            Add {acceptedCount} Item{acceptedCount !== 1 ? 's' : ''} to Bid →
          </Btn>
        </Row>
      </Row>
    </div>
  );
}
