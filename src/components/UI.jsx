import { colors, btn, slabel, inp, card } from '../styles/theme.js';

export function Btn({ children, onClick, variant = 'green', size = 'md', disabled, style, ...props }) {
  const sizes = { sm: { padding: '6px 12px', fontSize: 11 }, md: { padding: '10px 18px', fontSize: 13 }, lg: { padding: '13px 24px', fontSize: 15 } };
  const variants = {
    green: { background: colors.green, color: '#000', border: 'none' },
    ghost: { background: 'transparent', color: colors.green, border: `1px solid ${colors.green}` },
    red: { background: colors.red, color: '#fff', border: 'none' },
    blue: { background: colors.blue, color: '#fff', border: 'none' },
    orange: { background: colors.orange, color: '#fff', border: 'none' },
    surface: { background: colors.card2, color: colors.text, border: `1px solid ${colors.border}` },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...btn.base,
        ...sizes[size],
        ...variants[variant],
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ children, style }) {
  return <div style={{ ...card, ...style }}>{children}</div>;
}

export function SLabel({ children, style }) {
  return <div style={{ ...slabel, ...style }}>{children}</div>;
}

export function Input({ value, onChange, placeholder, type = 'text', style, ...props }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ ...inp, ...style }}
      {...props}
    />
  );
}

export function Select({ value, onChange, children, style }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{
        ...inp,
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </select>
  );
}

export function StatCard({ label, value, color }) {
  return (
    <div style={{ background: colors.card2, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '14px 16px', flex: 1 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: color || colors.orange }}>{value}</div>
    </div>
  );
}

export function Row({ children, style }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, ...style }}>{children}</div>;
}

export function Col({ children, style }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>{children}</div>;
}

export function Divider() {
  return <div style={{ height: 1, background: colors.border, margin: '16px 0' }} />;
}

export function Badge({ children, color }) {
  return (
    <span style={{
      background: (color || colors.green) + '22',
      color: color || colors.green,
      border: `1px solid ${(color || colors.green)}44`,
      borderRadius: 5,
      padding: '2px 8px',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.08em',
    }}>
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: colors.textDim }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      {title && <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 6 }}>{title}</div>}
      {subtitle && <div style={{ fontSize: 12, lineHeight: 1.6 }}>{subtitle}</div>}
    </div>
  );
}

export function Flag({ flag }) {
  const styles = {
    error: { bg: 'rgba(239,68,68,0.08)', border: colors.red, icon: '❌', color: colors.red },
    warn:  { bg: 'rgba(234,179,8,0.08)', border: colors.yellow, icon: '⚠️', color: colors.yellow },
    info:  { bg: 'rgba(34,197,94,0.06)', border: colors.green, icon: 'ℹ️', color: colors.textDim },
    note:  { bg: 'rgba(59,130,246,0.06)', border: colors.blue, icon: '📝', color: colors.textDim },
  };
  const s = styles[flag.type] || styles.info;
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: s.bg, border: `1px solid ${s.border}40`, borderRadius: 8, padding: '10px 14px', marginBottom: 6 }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{s.icon}</span>
      <div>
        {flag.source && <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 2 }}>{flag.source}</div>}
        <div style={{ fontSize: 12, color: colors.text, lineHeight: 1.5 }}>{flag.text}</div>
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div style={{
      width: 20, height: 20, borderRadius: '50%',
      border: `2px solid ${colors.border}`,
      borderTopColor: colors.green,
      animation: 'spin 0.8s linear infinite',
    }} />
  );
}

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('mechbid-spin')) {
  const style = document.createElement('style');
  style.id = 'mechbid-spin';
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}

export function TblInput({ value, onChange, type = 'text', style, ...props }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={onChange}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: `1px solid ${colors.border}`,
        color: colors.text,
        fontSize: 12,
        fontFamily: "'DM Sans', sans-serif",
        padding: '4px 6px',
        outline: 'none',
        width: '100%',
        ...style,
      }}
      {...props}
    />
  );
}

// Auto-growing textarea: wraps long text instead of clipping it, sized to fit
// its content. Single-line <input> cells were cutting off extracted scope
// tasks mid-sentence, which made them unreadable without clicking into each
// one. The inline ref (identity changes per render) re-runs autoGrow after
// every render, so height also tracks programmatic value changes.
function autoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// Table-cell flavor — transparent with a bottom rule, matches TblInput.
export function TblArea({ value, onChange, style, ...props }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={onChange}
      rows={1}
      ref={el => autoGrow(el)}
      onInput={e => autoGrow(e.target)}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: `1px solid ${colors.border}`,
        color: colors.text,
        fontSize: 12,
        fontFamily: "'DM Sans', sans-serif",
        padding: '4px 6px',
        outline: 'none',
        width: '100%',
        resize: 'none',
        overflow: 'hidden',
        lineHeight: 1.45,
        display: 'block',
        ...style,
      }}
      {...props}
    />
  );
}

// Form flavor — same chrome as Input, for review cards and long note fields.
export function TextArea({ value, onChange, placeholder, style, ...props }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={onChange}
      placeholder={placeholder}
      rows={1}
      ref={el => autoGrow(el)}
      onInput={e => autoGrow(e.target)}
      style={{ ...inp, resize: 'none', overflow: 'hidden', lineHeight: 1.5, display: 'block', ...style }}
      {...props}
    />
  );
}
