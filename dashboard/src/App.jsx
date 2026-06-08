import { useState, useCallback, useEffect } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './index.css'

import Topbar from './components/Topbar'
import WidgetPanel from './components/WidgetPanel'
import ErrorBoundary from './components/ErrorBoundary'
import WidgetAsteroids from './widgets/WidgetAsteroids'
import WidgetFireballs from './widgets/WidgetFireballs'
import WidgetEarthquakes from './widgets/WidgetEarthquakes'
import WidgetSimulatorMap from './widgets/WidgetSimulatorMap'
import WidgetRandomAsteroid from './widgets/WidgetRandomAsteroid'
import WidgetDbStatus from './widgets/WidgetDbStatus'
import WidgetStats from './widgets/WidgetStats'
import WidgetNewsArticle from './widgets/WidgetNewsArticle'

const ResponsiveGrid = WidthProvider(Responsive)

const WIDGETS = [
  { id: 'asteroids',   label: 'Asteroïden',        defaultEnabled: true },
  { id: 'fireballs',   label: 'Vuurbolletjes',      defaultEnabled: true },
  { id: 'earthquakes', label: 'Aardbevingen',       defaultEnabled: true },
  { id: 'simulator',   label: 'Impact Simulator',   defaultEnabled: true },
  { id: 'random',      label: 'Willekeurig Object', defaultEnabled: true },
  { id: 'dbstatus',    label: 'Database Status',    defaultEnabled: false },
  { id: 'stats',       label: 'Statistieken',        defaultEnabled: true  },
  { id: 'newsarticle', label: 'AI Nieuwsbericht',    defaultEnabled: true  },
]

// DEFAULT_LAYOUT is the single source of truth for positions AND constraints
const DEFAULT_LAYOUT = [
  { i: 'asteroids',   x: 0, y: 0,  w: 6, h: 8,  minW: 3, minH: 4 },
  { i: 'fireballs',   x: 6, y: 0,  w: 6, h: 8,  minW: 3, minH: 4 },
  { i: 'earthquakes', x: 0, y: 8,  w: 4, h: 7,  minW: 3, minH: 4 },
  { i: 'simulator',   x: 4, y: 8,  w: 5, h: 7,  minW: 4, minH: 6 },
  { i: 'random',      x: 9, y: 8,  w: 3, h: 7,  minW: 2, minH: 4 },
  { i: 'stats',       x: 0, y: 15, w: 6, h: 8,  minW: 3, minH: 5 },
  { i: 'newsarticle', x: 6, y: 15, w: 6, h: 8,  minW: 3, minH: 5 },
  { i: 'dbstatus',    x: 0, y: 23, w: 4, h: 4,  minW: 2, minH: 3 },
]

const DEFAULT_CONSTRAINTS = Object.fromEntries(
  DEFAULT_LAYOUT.map(({ i, minW, minH }) => [i, { minW, minH }])
)

const STORAGE_KEY = 'astro-dashboard-v2'

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') } catch { return null }
}

export default function App() {
  const saved = loadState()

  const [theme, setTheme]       = useState(saved?.theme ?? 'dark')
  const [enabled, setEnabled]   = useState(saved?.enabled ?? Object.fromEntries(WIDGETS.map(w => [w.id, w.defaultEnabled])))
  const [positions, setPositions] = useState(saved?.positions ?? {})   // { id: {x,y,w,h} }
  const [fullscreen, setFullscreen] = useState(false)
  const [panelOpen, setPanelOpen]   = useState(false)
  const [editMode, setEditMode]     = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, enabled, positions }))
  }, [theme, enabled, positions])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F11') { e.preventDefault(); toggleFullscreen() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setFullscreen(false)
    }
  }, [])

  const toggleWidget = useCallback((id) => {
    setEnabled(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const resetLayout = useCallback(() => {
    setPositions({})
    setEnabled(Object.fromEntries(WIDGETS.map(w => [w.id, w.defaultEnabled])))
  }, [])

  // Build the layout for enabled widgets: stored position + default constraints
  const layout = DEFAULT_LAYOUT
    .filter(def => enabled[def.i])
    .map(def => ({
      ...def,
      ...(positions[def.i] ?? {}),
      // Always enforce constraints from DEFAULT_LAYOUT
      minW: def.minW,
      minH: def.minH,
    }))

  const handleLayoutChange = useCallback((newLayout) => {
    setPositions(prev => {
      const updated = { ...prev }
      newLayout.forEach(({ i, x, y, w, h }) => { updated[i] = { x, y, w, h } })
      return updated
    })
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Topbar
        theme={theme}
        onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        fullscreen={fullscreen}
        onFullscreen={toggleFullscreen}
        editMode={editMode}
        onEditMode={() => setEditMode(e => !e)}
        onPanelToggle={() => setPanelOpen(o => !o)}
        onReset={resetLayout}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {panelOpen && (
          <WidgetPanel
            widgets={WIDGETS}
            enabled={enabled}
            onToggle={toggleWidget}
            onClose={() => setPanelOpen(false)}
          />
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
          <ResponsiveGrid
            layouts={{ lg: layout, md: layout, sm: layout }}
            breakpoints={{ lg: 1200, md: 800, sm: 0 }}
            cols={{ lg: 12, md: 10, sm: 6 }}
            rowHeight={40}
            isDraggable={editMode}
            isResizable={editMode}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".widget-drag-handle"
            draggableCancel=".no-drag"
            margin={[10, 10]}
            measureBeforeMount={false}
          >
            {layout.map(({ i }) => (
              <div key={i} style={{ height: '100%' }}>
                <WidgetWrapper id={i} editMode={editMode} onClose={() => toggleWidget(i)}>
                  <ErrorBoundary key={i}>
                    {i === 'asteroids'   && <WidgetAsteroids />}
                    {i === 'fireballs'   && <WidgetFireballs />}
                    {i === 'earthquakes' && <WidgetEarthquakes />}
                    {i === 'simulator'   && <WidgetSimulatorMap />}
                    {i === 'random'      && <WidgetRandomAsteroid />}
                    {i === 'dbstatus'    && <WidgetDbStatus />}
                    {i === 'stats'       && <WidgetStats />}
                    {i === 'newsarticle' && <WidgetNewsArticle />}
                  </ErrorBoundary>
                </WidgetWrapper>
              </div>
            ))}
          </ResponsiveGrid>
        </div>
      </div>
    </div>
  )
}

const WIDGET_META = {
  asteroids:   { label: 'Asteroïden',        icon: '☄️' },
  fireballs:   { label: 'Vuurbolletjes',      icon: '🔭' },
  earthquakes: { label: 'Aardbevingen',       icon: '🌍' },
  simulator:   { label: 'Impact Simulator',   icon: '💥' },
  random:      { label: 'Willekeurig Object', icon: '🎲' },
  dbstatus:    { label: 'Database Status',    icon: '🗄️' },
  stats:       { label: 'Statistieken',        icon: '📊' },
  newsarticle: { label: 'AI Nieuwsbericht',    icon: '📰' },
}

// Widgets that need zero inner padding (e.g. map fills full area)
const NO_PADDING_WIDGETS = new Set(['simulator'])

function WidgetWrapper({ id, editMode, onClose, children }) {
  const meta = WIDGET_META[id] ?? { label: id, icon: '▪' }
  return (
    <div
      className="widget-enter"
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div
        className="widget-drag-handle"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 12px',
          background: 'var(--surface2)',
          borderBottom: '1px solid var(--border)',
          cursor: editMode ? 'grab' : 'default',
          userSelect: 'none',
          flexShrink: 0,
          gap: 8,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 13, color: 'var(--text)', minWidth: 0 }}>
          {editMode && <span style={{ color: 'var(--muted)', fontSize: 12, flexShrink: 0 }}>⠿</span>}
          <span style={{ flexShrink: 0 }}>{meta.icon}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label}</span>
        </span>
        {editMode && (
          <button
            className="no-drag"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onClose() }}
            style={{
              flexShrink: 0,
              width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: '1px solid transparent', borderRadius: 6,
              color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--danger)'; e.currentTarget.style.color = 'var(--danger)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--muted)' }}
            title="Verberg widget"
          >×</button>
        )}
      </div>
      <div style={{
        flex: 1, overflow: 'auto', minHeight: 0,
        padding: NO_PADDING_WIDGETS.has(id) ? 0 : 12,
      }}>
        {children}
      </div>
    </div>
  )
}
