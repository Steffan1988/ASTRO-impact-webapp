export default function WidgetPanel({ widgets, enabled, onToggle, onClose }) {
  return (
    <div style={{
      width: 240, flexShrink: 0,
      background: 'var(--surface2)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Widgets</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--muted)',
          cursor: 'pointer', fontSize: 18, lineHeight: 1,
        }}>×</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>
          Zet widgets aan of uit. Gebruik de <strong style={{ color: 'var(--text)' }}>✏️ Bewerken</strong> knop om ze te verslepen en vergroten.
        </p>

        {widgets.map(w => (
          <label key={w.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px',
            background: enabled[w.id] ? 'rgba(59,130,246,0.1)' : 'var(--surface)',
            border: `1px solid ${enabled[w.id] ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8,
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'all 0.15s',
          }}>
            <input
              type="checkbox"
              checked={!!enabled[w.id]}
              onChange={() => onToggle(w.id)}
              style={{ accentColor: 'var(--accent)', width: 16, height: 16, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, fontWeight: 500 }}>{w.label}</span>
            <span style={{
              marginLeft: 'auto', fontSize: 11, fontWeight: 600,
              color: enabled[w.id] ? 'var(--success)' : 'var(--muted)',
            }}>
              {enabled[w.id] ? 'AAN' : 'UIT'}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
