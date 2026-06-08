const WIDGET_ICONS = {
  asteroids:   '☄️',
  fireballs:   '🔭',
  earthquakes: '🌍',
  simulator:   '💥',
  random:      '🎲',
  dbstatus:    '🗄️',
  stats:       '📊',
  newsarticle: '📰',
}

export default function WidgetPanel({ widgets, enabled, onToggle, onClose }) {
  const activeCount = widgets.filter(w => enabled[w.id]).length

  return (
    <div style={{
      width: 256, flexShrink: 0,
      background: 'var(--surface2)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      animation: 'slide-in-left 0.2s ease',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Widgets</span>
          <span style={{
            marginLeft: 8, fontSize: 11, fontWeight: 600,
            padding: '1px 7px', borderRadius: 20,
            background: 'rgba(59,130,246,0.15)', color: 'var(--accent)',
          }}>
            {activeCount}/{widgets.length}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: 'var(--muted)',
            cursor: 'pointer', fontSize: 18, lineHeight: 1,
            width: 28, height: 28, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >×</button>
      </div>

      <div style={{
        flex: 1, overflow: 'auto', padding: '10px 12px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <p style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 4, lineHeight: 1.5 }}>
          Zet widgets aan of uit. Gebruik <strong style={{ color: 'var(--text)' }}>✏️ Bewerken</strong> om te verplaatsen en resizen.
        </p>

        {widgets.map(w => {
          const on = !!enabled[w.id]
          return (
            <label
              key={w.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px',
                background: on ? 'rgba(59,130,246,0.1)' : 'var(--surface)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 8, cursor: 'pointer', userSelect: 'none',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!on) e.currentTarget.style.borderColor = 'var(--muted)' }}
              onMouseLeave={e => { if (!on) e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{WIDGET_ICONS[w.id] ?? '▪'}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{w.label}</span>
              <div style={{
                width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                background: on ? 'var(--accent)' : 'var(--border)',
                position: 'relative', transition: 'background 0.2s',
                cursor: 'pointer',
              }}
                onClick={() => onToggle(w.id)}
              >
                <div style={{
                  position: 'absolute', top: 2,
                  left: on ? 18 : 2,
                  width: 16, height: 16, borderRadius: 8,
                  background: '#fff',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(w.id)}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                />
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}
