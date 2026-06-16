export const colors = {
  bg: '#080d08',
  surface: '#0d140d',
  card: '#111911',
  card2: '#151e15',
  border: '#1a2e1a',
  border2: '#223222',
  green: '#22c55e',
  green2: '#16a34a',
  greenGlow: 'rgba(34,197,94,0.12)',
  greenFaint: 'rgba(34,197,94,0.05)',
  text: '#edfaed',
  textDim: '#5a8a5a',
  textMuted: '#2d4a2d',
  orange: '#f97316',
  yellow: '#eab308',
  red: '#ef4444',
  blue: '#3b82f6',
  cyan: '#06b6d4',
  purple: '#a855f7',
};

export const inp = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 7,
  padding: '9px 12px',
  fontSize: 13,
  color: colors.text,
  outline: 'none',
  width: '100%',
  fontFamily: "'DM Sans', sans-serif",
};

export const card = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  padding: 18,
};

export const btn = {
  base: {
    padding: '10px 18px',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    border: 'none',
    fontFamily: "'DM Sans', sans-serif",
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  green: { background: colors.green, color: '#000' },
  ghost: { background: 'transparent', color: colors.green, border: `1px solid ${colors.green}` },
  red: { background: colors.red, color: '#fff' },
  blue: { background: colors.blue, color: '#fff' },
};

export const slabel = {
  fontFamily: "'Syne', sans-serif",
  fontSize: 10,
  fontWeight: 700,
  color: colors.green,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  marginBottom: 10,
};
