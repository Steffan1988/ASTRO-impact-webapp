import { useState, useCallback, useEffect } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './index.css'

import Topbar from './components/Topbar'
import WidgetPanel from './components/WidgetPanel'
import ErrorBoundary from './components/ErrorBoundary'
import InfoModal, { InfoSection, InfoTip } from './components/InfoModal'
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
  { id: 'fireballs',   label: 'Vuurbollen',      defaultEnabled: true },
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
  const [selectedSimId, setSelectedSimId] = useState(null)  // null = meest recente
  const [simVersion, setSimVersion] = useState(0)

  const onSimComplete = useCallback(() => {
    setSelectedSimId(null)          // reset naar meest recente
    setSimVersion(v => v + 1)       // trigger reload in alle luisterende widgets
  }, [])

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
                    {i === 'simulator'   && <WidgetSimulatorMap onSimComplete={onSimComplete} />}
                    {i === 'random'      && <WidgetRandomAsteroid />}
                    {i === 'dbstatus'    && <WidgetDbStatus selectedSimId={selectedSimId} onSimSelect={setSelectedSimId} simVersion={simVersion} />}
                    {i === 'stats'       && <WidgetStats selectedSimId={selectedSimId} simVersion={simVersion} />}
                    {i === 'newsarticle' && <WidgetNewsArticle selectedSimId={selectedSimId} simVersion={simVersion} />}
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
  fireballs:   { label: 'Vuurbollen',      icon: '🔭' },
  earthquakes: { label: 'Aardbevingen',       icon: '🌍' },
  simulator:   { label: 'Impact Simulator',   icon: '💥' },
  random:      { label: 'Willekeurig Object', icon: '🎲' },
  dbstatus:    { label: 'Database Status',    icon: '🗄️' },
  stats:       { label: 'Statistieken',        icon: '📊' },
  newsarticle: { label: 'AI Nieuwsbericht',    icon: '📰' },
}

const WIDGET_INFO = {
  asteroids: {
    content: (
      <>
        <InfoSection title="Wat toont deze widget?">
          Een real-time tabel van <strong>Near-Earth Objects (NEO's)</strong> uit de
          NASA NeoWs-database. De lijst wordt dagelijks bijgewerkt en toont alle
          asteroïden die de komende 7 dagen de baan van de Aarde naderen.
          Rijen met een rode rand zijn officieel bestempeld als{' '}
          <strong style={{ color: 'var(--danger)' }}>Potentially Hazardous Asteroids (PHA)</strong>.
        </InfoSection>
        <InfoSection title="Kolommen">
          <ul style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li><strong>Naam</strong> — officiële IAU-aanduiding</li>
            <li><strong>Ø min–max</strong> — geschatte diameterrange in meters</li>
            <li><strong>Snelheid</strong> — relatieve snelheid in km/u bij nadering</li>
            <li><strong>Afstand</strong> — dichtstbijzijnde passeerafstand in miljoen km</li>
            <li><strong>⚠ PHA</strong> — potentieel gevaarlijk object (ja/nee)</li>
          </ul>
        </InfoSection>
        <InfoSection title="Sorteren &amp; zoeken">
          Klik op een kolomkop om te sorteren. Gebruik het zoekveld om op naam of
          eigenschap te filteren.
        </InfoSection>
        <InfoTip>
          Sleep een rij naar de <strong>Impact Simulator</strong>-kaart om een inslagberekening
          te starten voor dat specifieke object.
        </InfoTip>
      </>
    ),
  },
  fireballs: {
    content: (
      <>
        <InfoSection title="Wat toont deze widget?">
          De <strong>15 energierijkste vuurbolgebeurtenissen</strong> uit de NASA/JPL
          Fireball Data API. Vuurbollen (bolides) zijn meteoren die zo helder opvlakken
          dat ze overdag zichtbaar zijn. De database bevat metingen van satellieten en
          infrasound-netwerken.
        </InfoSection>
        <InfoSection title="Kolommen">
          <ul style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li><strong>Datum</strong> — tijdstip van de waarneming (UTC)</li>
            <li><strong>Energie (kt TNT)</strong> — totale uitgestraalde energie in kiloton TNT-equivalent</li>
            <li><strong>Impact (kt)</strong> — geschatte impactenergie op de grond</li>
            <li><strong>Snelheid</strong> — atmosferische intredesnelheid in km/s</li>
            <li><strong>Hoogte</strong> — hoogte van piekhelderheid in km</li>
            <li><strong>Lat / Lon</strong> — geografische positie van de vuurbol</li>
          </ul>
        </InfoSection>
        <InfoSection title="Kleuren">
          Energie &gt; 100 kt wordt rood gemarkeerd — vergelijkbaar met een kleine
          nucleaire detonatie.
        </InfoSection>
        <InfoTip>
          Ter vergelijking: de Chelyabinsk-meteoor (2013) had ~440 kt. Tunguska (1908)
          schatte men op ~10.000–15.000 kt.
        </InfoTip>
      </>
    ),
  },
  earthquakes: {
    content: (
      <>
        <InfoSection title="Wat toont deze widget?">
          Recente <strong>significante aardbevingen</strong> (M ≥ 4,5) uit de USGS
          Earthquake Hazards Program-feed. De gegevens worden gebruikt als vergelijkingsbasis
          voor de seismische magnitude die ASTRO-impact berekent bij een asteroïde-inslag.
        </InfoSection>
        <InfoSection title="Kolommen">
          <ul style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li><strong>M</strong> — magnitude op de schaal van Richter (kleurgecodeerd)</li>
            <li><strong>Locatie</strong> — regio van het epicentrum (klikbaar naar USGS)</li>
            <li><strong>Datum</strong> — lokale datum van de beving</li>
            <li><strong>Diepte</strong> — hypocenterdiepte in km</li>
          </ul>
        </InfoSection>
        <InfoSection title="Filter">
          Gebruik de schuifregelaar bovenaan om alleen bevingen boven een minimummagnitude
          te tonen.
        </InfoSection>
        <InfoTip>
          De Impact Simulator toont na een simulatie automatisch de dichtstbijzijnde
          historische beving met vergelijkbare magnitude.
        </InfoTip>
      </>
    ),
  },
  simulator: {
    content: (
      <>
        <InfoSection title="Wat toont deze widget?">
          Een interactieve wereldkaart waarmee je een asteroïde-inslag op elke locatie
          ter wereld kunt simuleren. Het impactmodel is gebaseerd op het{' '}
          <strong>Collins et al. (2005)</strong>-model (MAPS 40:817–840), aangevuld met
          Holsapple (1993) voor kraterskalering en Glasstone &amp; Dolan (1977) voor
          thermische en luchtgolfstraling.
        </InfoSection>
        <InfoSection title="Hoe gebruik je de simulator?">
          <ol style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Sleep een asteroïde vanuit de <strong>Asteroïden</strong>-tabel naar de kaart.</li>
            <li>Laat los op de gewenste inslaglocatie.</li>
            <li>Kies de samenstelling (steen / ijzer / komeet) en het doeltype (rots / oceaan / zachte grond).</li>
            <li>Klik op <em>Simuleer inslag</em> — de schaderingen verschijnen op de kaart.</li>
          </ol>
        </InfoSection>
        <InfoSection title="Schaderingen">
          <ul style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <li><span style={{ color: '#ef4444' }}>●</span> <strong>Vuurbal / Krater</strong> — totale vaporisatie</li>
            <li><span style={{ color: '#f97316' }}>●</span> <strong>Zware verwoesting</strong> — &gt;138 kPa, beton ingestort</li>
            <li><span style={{ color: '#f59e0b' }}>●</span> <strong>Matige verwoesting</strong> — &gt;34 kPa, houten gebouwen weg</li>
            <li><span style={{ color: '#ec4899' }}>●</span> <strong>Thermisch</strong> — 3e-graads brandwonden</li>
            <li><span style={{ color: '#3b82f6' }}>●</span> <strong>Lichte schade</strong> — &gt;7 kPa, glasbreuk</li>
            <li><span style={{ color: '#8b5cf6' }}>●</span> <strong>Seismisch</strong> — voelbare schokgolf</li>
          </ul>
        </InfoSection>
        <InfoTip>
          Klik op een cirkel op de kaart voor een uitgebreide beschrijving van die zone.
        </InfoTip>
      </>
    ),
  },
  random: {
    content: (
      <>
        <InfoSection title="Wat toont deze widget?">
          Haalt een <strong>willekeurig Near-Earth Object</strong> op uit de dagelijkse
          NASA-cache en toont de technische kenmerken. Handig om snel een indruk te
          krijgen van de variatie in de huidige NEO-populatie.
        </InfoSection>
        <InfoSection title="Getoonde gegevens">
          <ul style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li><strong>Naam</strong> — officiële aanduiding + gevaarlijkheidsstatus</li>
            <li><strong>Grootteklasse</strong> — klein / middelgroot / groot / zeer groot / massamoordenaar</li>
            <li><strong>Diameter</strong> — geschatte min–max range in meters</li>
            <li><strong>Snelheid</strong> — relatieve snelheid in km/u</li>
            <li><strong>Afstand</strong> — dichtstbijzijnde passeerafstand in miljoen km</li>
            <li><strong>Massa</strong> — geschatte massa op basis van gemiddelde steeindichtheid</li>
          </ul>
        </InfoSection>
        <InfoTip>
          Klik op <strong>Willekeurig object</strong> om steeds een nieuw object te laden.
          Gevaarlijke objecten (PHA) worden oranje/rood gemarkeerd.
        </InfoTip>
      </>
    ),
  },
  dbstatus: {
    content: (
      <>
        <InfoSection title="Wat toont deze widget?">
          Toont de <strong>verbindingsstatus van de database</strong> én een volledige
          <strong> geschiedenis van alle simulaties</strong>. Klik op een simulatie in de
          lijst om die te bekijken in de Statistieken- en Nieuwsartikel-widgets.
        </InfoSection>
        <InfoSection title="Simulatiegeschiedenis">
          <ul style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li><strong>Blauwe rand</strong> — meest recente simulatie (standaard actief)</li>
            <li><strong>Paarse rand + ACTIEF</strong> — de geselecteerde historische simulatie</li>
            <li><strong>EXT-badge</strong> — extinctie-event (Chicxulub-niveau)</li>
            <li>Klik nogmaals op de actieve simulatie om terug te gaan naar de meest recente</li>
          </ul>
        </InfoSection>
        <InfoSection title="Verbindingsproblemen?">
          Als de database niet bereikbaar is:
          <ol style={{ paddingLeft: 16, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Zorg dat MariaDB/MySQL actief is.</li>
            <li>Voer <code>setup_db.sql</code> uit in de root van het project.</li>
            <li>Controleer de DB-credentials in <code>app.py</code> (DB_CONFIG).</li>
            <li>Herstart de Flask-server.</li>
          </ol>
        </InfoSection>
        <InfoTip>
          Klik op <strong>↺ Vernieuwen</strong> om de lijst en status te verversen.
          Na een nieuwe simulatie werkt de lijst automatisch bij.
        </InfoTip>
      </>
    ),
  },
  stats: {
    content: (
      <>
        <InfoSection title="Wat toont deze widget?">
          Gedetailleerde statistieken van de <strong>meest recente simulatie</strong>.
          Voer een nieuwe inslag uit via de Impact Simulator en deze widget werkt automatisch
          bij. Via de <strong>Database</strong>-widget kun je een eerdere simulatie selecteren
          om die te bekijken.
        </InfoSection>
        <InfoSection title="Getoonde gegevens">
          <ul style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li><strong>Kerngetallen</strong> — energie (Mt TNT), seismische magnitude, totale slachtoffers en percentage verwoest oppervlak</li>
            <li><strong>Slachtoffers per oorzaak</strong> — staafdiagram uitgesplitst in direct, thermisch, schokgolf, seismisch en overig</li>
            <li><strong>Schaderingen</strong> — radius van elke beschadigingszone in km</li>
            <li><strong>Impactparameters</strong> — samenstelling, doeltype, invalshoek, airburst, kraterdiameter</li>
          </ul>
        </InfoSection>
        <InfoTip>
          Een blauwe banner bovenaan betekent dat je de meest recente simulatie bekijkt.
          Een paarse banner betekent dat je via de Database-widget een historische simulatie hebt geselecteerd.
        </InfoTip>
      </>
    ),
  },
  newsarticle: {
    content: (
      <>
        <InfoSection title="Wat toont deze widget?">
          Genereert een <strong>fictief Nederlands nieuwsartikel</strong> over een
          opgeslagen simulatie. Als er een geldige Anthropic API-sleutel is ingesteld,
          schrijft <em>Claude Opus</em> het artikel live (gestreamd). Anders wordt
          automatisch een uitgebreid demo-artikel gegenereerd op basis van de simulatiedata.
        </InfoSection>
        <InfoSection title="Hoe gebruik je het?">
          <ol style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Kies een simulatie uit de keuzelijst bovenaan.</li>
            <li>Klik op <strong>✍️ Genereer artikel</strong>.</li>
            <li>Het artikel verschijnt live terwijl het wordt geschreven.</li>
            <li>Daarna worden twee AI-gegenereerde afbeeldingen via Pollinations.AI geladen.</li>
            <li>Klik op <strong>↺</strong> om een nieuw artikel voor dezelfde simulatie te maken.</li>
          </ol>
        </InfoSection>
        <InfoSection title="Afbeeldingen">
          Twee afbeeldingen per artikel: een luchtfoto van het impactgebied en een
          straatfoto van de getroffen stad. Gegenereerd via <strong>Pollinations.AI</strong>
          (gratis, geen API-sleutel vereist).
        </InfoSection>
        <InfoTip>
          Voeg <code>ANTHROPIC_API_KEY=sk-ant-…</code> toe aan het <code>.env</code>-bestand
          in de projectroot om Claude-artikelen in te schakelen.
        </InfoTip>
      </>
    ),
  },
}

// Widgets that need zero inner padding (e.g. map fills full area)
const NO_PADDING_WIDGETS = new Set(['simulator'])

function WidgetWrapper({ id, editMode, onClose, children }) {
  const meta = WIDGET_META[id] ?? { label: id, icon: '▪' }
  const info = WIDGET_INFO[id] ?? null
  const [showInfo, setShowInfo] = useState(false)

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

        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onMouseDown={e => e.stopPropagation()}>
          {info && (
            <button
              onClick={e => { e.stopPropagation(); setShowInfo(true) }}
              title="Info over deze widget"
              style={{
                width: 22, height: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: '1px solid transparent', borderRadius: 6,
                color: 'var(--muted)', cursor: 'pointer', fontSize: 13, lineHeight: 1,
                fontWeight: 700, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--muted)' }}
            >ⓘ</button>
          )}
          {editMode && (
            <button
              onClick={e => { e.stopPropagation(); onClose() }}
              style={{
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
      </div>

      <div style={{
        flex: 1, overflow: 'auto', minHeight: 0,
        padding: NO_PADDING_WIDGETS.has(id) ? 0 : 12,
      }}>
        {children}
      </div>

      {showInfo && info && (
        <InfoModal title={meta.label} icon={meta.icon} onClose={() => setShowInfo(false)}>
          {info.content}
        </InfoModal>
      )}
    </div>
  )
}
