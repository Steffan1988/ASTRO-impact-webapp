export default function Topbar({
  theme, onThemeToggle,
  fullscreen, onFullscreen,
  editMode, onEditMode,
  onPanelToggle, onReset,
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '0 16px', height: 50, flexShrink: 0,
      background: 'var(--surface2)',
      borderBottom: '1px solid var(--border)',
      zIndex: 200,
    }}>
      <span style={{ fontSize: 18, marginRight: 4 }}>☄️</span>
      <span style={{ fontWeight: 700, fontSize: 15, marginRight: 'auto', letterSpacing: 0.5 }}>
        ASTRO-impact Dashboard
      </span>

      <Btn onClick={onPanelToggle} title="Widgets beheren" accent>
        ⊞ Widgets
      </Btn>

      <Btn onClick={onEditMode} active={editMode} title="Lay-out bewerken (drag & resize)">
        {editMode ? '✓ Opslaan' : '✏️ Bewerken'}
      </Btn>

      <Btn onClick={onReset} title="Reset naar standaard lay-out">
        ↺ Reset
      </Btn>

      <Btn onClick={onThemeToggle} title="Thema wisselen">
        {theme === 'dark' ? '☀️' : '🌙'}
      </Btn>

      <Btn onClick={onFullscreen} title="Volledig scherm (F11)">
        {fullscreen ? '⤓' : '⤢'}
      </Btn>
    </div>
  )
}

function Btn({ children, onClick, title, accent, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: '5px 12px',
        borderRadius: 6,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: accent ? 'var(--accent)' : active ? 'rgba(59,130,246,0.15)' : 'var(--surface)',
        color: accent ? '#fff' : 'var(--text)',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}
