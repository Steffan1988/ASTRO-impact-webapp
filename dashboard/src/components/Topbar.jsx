import { useState } from 'react'

export default function Topbar({
  theme, onThemeToggle,
  fullscreen, onFullscreen,
  editMode, onEditMode,
  onPanelToggle, onReset,
}) {
  const [confirmReset, setConfirmReset] = useState(false)

  const handleReset = () => {
    if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 3000); return }
    setConfirmReset(false)
    onReset()
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 16px', height: 50, flexShrink: 0,
        background: 'var(--surface2)',
        borderBottom: '1px solid var(--border)',
        zIndex: 200,
      }}>
        <span style={{ fontSize: 20, marginRight: 4, lineHeight: 1 }}>☄️</span>
        <span style={{ fontWeight: 800, fontSize: 15, marginRight: 'auto', letterSpacing: 0.3, color: 'var(--text)' }}>
          ASTRO<span style={{ color: 'var(--accent)', fontWeight: 400 }}>-impact</span>
        </span>

        <Btn onClick={onPanelToggle} title="Widgets beheren (toon/verberg)" accent>
          ⊞ Widgets
        </Btn>

        <Btn onClick={onEditMode} active={editMode} title="Lay-out bewerken — sleep en vergroot widgets">
          {editMode ? '✓ Opslaan' : '✏️ Bewerken'}
        </Btn>

        <Btn
          onClick={handleReset}
          title="Reset naar standaard lay-out"
          danger={confirmReset}
        >
          {confirmReset ? '⚠ Zeker?' : '↺ Reset'}
        </Btn>

        <Btn onClick={onThemeToggle} title={`Wissel naar ${theme === 'dark' ? 'licht' : 'donker'} thema`}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </Btn>

        <Btn onClick={onFullscreen} title="Volledig scherm (F11)">
          {fullscreen ? '⤓' : '⤢'}
        </Btn>
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div style={{
          height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(59,130,246,0.12)',
          borderBottom: '1px solid rgba(59,130,246,0.3)',
          fontSize: 12, color: 'var(--accent)', fontWeight: 600, gap: 16,
          flexShrink: 0,
          animation: 'fadeIn 0.2s ease',
        }}>
          <span>✏️ Bewerkmodus actief</span>
          <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Sleep widgets om te verplaatsen · Sleep hoek om te resizen · × om te verbergen</span>
        </div>
      )}
    </>
  )
}

function Btn({ children, onClick, title, accent, active, danger }) {
  const [hover, setHover] = useState(false)

  const bg = accent
    ? (hover ? '#2563eb' : 'var(--accent)')
    : danger
    ? (hover ? '#b91c1c' : 'rgba(239,68,68,0.15)')
    : active
    ? (hover ? 'rgba(59,130,246,0.25)' : 'rgba(59,130,246,0.15)')
    : (hover ? 'var(--surface2)' : 'var(--surface)')

  const borderColor = danger ? 'var(--danger)' : active ? 'var(--accent)' : 'var(--border)'
  const color = accent ? '#fff' : danger ? 'var(--danger)' : 'var(--text)'

  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '5px 12px', borderRadius: 6,
        border: `1px solid ${borderColor}`,
        background: bg, color,
        cursor: 'pointer', fontSize: 13, fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}
