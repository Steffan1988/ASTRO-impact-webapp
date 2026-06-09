import { useEffect, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import InfoTip from '../components/InfoTip'

const COLUMNS = [
  { key: 'naam',        label: 'Naam',              numeric: false },
  { key: 'diameter_min',label: 'Ø min–max (m)',      numeric: true  },
  { key: 'snelheid',    label: 'Snelheid (km/u)',    numeric: true  },
  { key: 'afstand',     label: 'Afstand (km)',       numeric: true  },
  { key: 'gevaarlijk',  label: '⚠',                  numeric: false },
]

export default function WidgetAsteroids() {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')
  const [dragging, setDragging] = useState(null)
  const [sort, setSort]       = useState({ col: 'afstand', dir: 'asc' })
  const [detail, setDetail]   = useState(null)   // { asteroid, data|null, loading, error }

  useEffect(() => {
    fetch('/api/asteroids')
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : d.data ?? []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const openDetail = useCallback(async (asteroid) => {
    setDetail({ asteroid, data: null, loading: true, error: null })
    try {
      const r = await fetch(`/api/asteroid/${asteroid.id}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Fout bij ophalen')
      setDetail({ asteroid, data: d, loading: false, error: null })
    } catch (e) {
      setDetail({ asteroid, data: null, loading: false, error: e.message })
    }
  }, [])

  const handleDragStart = (e, asteroid) => {
    e.dataTransfer.setData('asteroid', JSON.stringify(asteroid))
    e.dataTransfer.effectAllowed = 'copy'
    setDragging(asteroid.id)
  }

  const toggleSort = col => {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: col === 'naam' ? 'asc' : 'asc' }
    )
  }

  const sorted = useMemo(() => {
    const filtered = data.filter(a =>
      !search || JSON.stringify(a).toLowerCase().includes(search.toLowerCase())
    )
    const { col, dir } = sort
    return [...filtered].sort((a, b) => {
      let va = a[col], vb = b[col]
      if (col === 'gevaarlijk') { va = va ? 1 : 0; vb = vb ? 1 : 0 }
      if (va == null) return 1
      if (vb == null) return -1
      const cmp = typeof va === 'string' ? va.localeCompare(vb, 'nl') : Number(va) - Number(vb)
      return dir === 'asc' ? cmp : -cmp
    })
  }, [data, search, sort])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 4 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 8 }}>
          {[3,1,1,1,0.5].map((flex, j) => (
            <div key={j} style={{ flex, height: 20, borderRadius: 4, background: 'var(--surface2)', animation: `skeleton-pulse 1.4s ${i*0.07}s ease-in-out infinite` }} />
          ))}
        </div>
      ))}
    </div>
  )
  if (error) return (
    <div style={{ textAlign: 'center', padding: '32px 16px' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
      <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>NASA API niet bereikbaar</p>
      <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Zoek asteroïde..."
          style={inputStyle}
        />
        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {sorted.length}/{data.length}
        </span>
      </div>

      <p style={{ fontSize: 11, color: 'var(--accent)', margin: 0 }}>
        ☄ Sleep een rij naar de Impact Simulator kaart
      </p>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: 'var(--surface2)', zIndex: 1 }}>
              {COLUMNS.map(col => {
                const active = sort.col === col.key
                return (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    style={{
                      ...thStyle,
                      cursor: 'pointer',
                      userSelect: 'none',
                      color: active ? 'var(--accent)' : 'var(--muted)',
                      whiteSpace: 'nowrap',
                    }}
                    title={`Sorteren op ${col.label}`}
                  >
                    {col.label}
                    {active && (
                      <span style={{ marginLeft: 4, fontSize: 10 }}>
                        {sort.dir === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </th>
                )
              })}
              <th style={{ ...thStyle, width: 28 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 100).map((a, i) => {
              const hazardous = !!(a.gevaarlijk ?? a.is_potentially_hazardous)
              const isActive  = dragging === a.id
              return (
                <tr
                  key={i}
                  draggable
                  onDragStart={e => handleDragStart(e, a)}
                  onDragEnd={() => setDragging(null)}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    cursor: 'grab',
                    background: isActive
                      ? 'rgba(59,130,246,0.18)'
                      : hazardous
                      ? 'rgba(239,68,68,0.04)'
                      : 'transparent',
                    transition: 'background 0.1s',
                    borderLeft: hazardous ? '2px solid var(--danger)' : '2px solid transparent',
                  }}
                  title="Sleep naar de kaart om een inslag te simuleren"
                >
                  <td style={tdStyle}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ color: 'var(--muted)', fontSize: 10, flexShrink: 0 }}>⠿</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                        {a.naam ?? a.name ?? '—'}
                      </span>
                    </span>
                  </td>
                  <td style={tdStyle}>{fmt(a.diameter_min)}–{fmt(a.diameter_max)}</td>
                  <td style={tdStyle}>{fmt(a.snelheid ?? a.relative_velocity_kms)}</td>
                  <td style={tdStyle}>{fmtBig(a.afstand ?? a.miss_distance_km)}</td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      padding: '2px 6px', borderRadius: 20,
                      background: hazardous ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.12)',
                      color: hazardous ? 'var(--danger)' : 'var(--success)',
                      whiteSpace: 'nowrap',
                    }}>
                      {hazardous ? '⚠ PHA' : '✓'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, width: 28 }}>
                    <button
                      onClick={e => { e.stopPropagation(); openDetail(a) }}
                      onMouseDown={e => e.stopPropagation()}
                      title="Details ophalen"
                      style={{
                        width: 22, height: 22, borderRadius: 6,
                        border: '1px solid transparent',
                        background: 'none', color: 'var(--muted)',
                        cursor: 'pointer', fontSize: 13, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--muted)' }}
                    >ⓘ</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sorted.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 16 }}>Geen resultaten</p>}
      </div>

      {detail && (
        <AsteroidDetailModal
          asteroid={detail.asteroid}
          data={detail.data}
          loading={detail.loading}
          error={detail.error}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}

const fmt    = v => v != null ? Number(v).toLocaleString('nl-NL', { maximumFractionDigits: 0 }) : '—'
const fmtBig = v => v != null ? (Number(v) / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) + ' M' : '—'
const fmtDec = (v, n = 4) => v != null ? Number(v).toLocaleString('nl-NL', { maximumFractionDigits: n }) : '—'
const thStyle = { padding: '6px 8px', textAlign: 'left', fontWeight: 600 }
const tdStyle = { padding: '5px 8px', color: 'var(--text)' }
const inputStyle = {
  flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--text)', fontSize: 13,
}

function AsteroidDetailModal({ asteroid, data, loading, error, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const naam = asteroid?.naam ?? asteroid?.name ?? '—'
  const hazardous = !!(asteroid?.gevaarlijk)

  return createPortal(
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 3000, backdropFilter: 'blur(3px)', animation: 'fadeIn 0.15s ease',
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        zIndex: 3001,
        width: 520, maxWidth: 'calc(100vw - 24px)', maxHeight: '85vh',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 28px 90px rgba(0,0,0,0.6)',
        animation: 'fadeInUp 0.18s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', background: 'var(--surface2)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18 }}>☄️</span>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0, wordBreak: 'break-word' }}>
                {naam}
              </h2>
              {hazardous && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                  background: 'rgba(239,68,68,0.18)', color: 'var(--danger)',
                }}>⚠ PHA</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              ID: {asteroid?.id} · Ø {fmt(asteroid?.diameter_min)}–{fmt(asteroid?.diameter_max)} m · {fmt(asteroid?.snelheid)} km/u
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid transparent', borderRadius: 8,
            color: 'var(--muted)', fontSize: 20, cursor: 'pointer',
            lineHeight: 1, padding: '2px 7px', flexShrink: 0, transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--muted)' }}
            title="Sluiten (Escape)"
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 0.7, 0.9, 0.6, 0.8].map((w, i) => (
                <div key={i} style={{
                  height: 14, borderRadius: 4, background: 'var(--surface2)',
                  width: `${w * 100}%`,
                  animation: `skeleton-pulse 1.4s ${i * 0.1}s ease-in-out infinite`,
                }} />
              ))}
            </div>
          )}

          {error && (
            <div style={{
              padding: '12px 16px', borderRadius: 8,
              background: 'rgba(239,68,68,0.08)', border: '1px solid var(--danger)',
              color: 'var(--danger)', fontSize: 13,
            }}>
              ⚠ {error}
            </div>
          )}

          {data && !loading && <AsteroidDetails d={data} />}
        </div>
      </div>
    </>,
    document.body
  )
}

function AsteroidDetails({ d }) {
  const orb = d.orbital ?? {}
  const dia = d.diameter ?? {}
  const ca  = d.close_approaches ?? {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>

      {/* Basisinfo */}
      <Section title="Basisgegevens">
        <Grid>
          <Stat label="Absolute magnitude (H)" val={d.absolute_magnitude != null ? `${d.absolute_magnitude} mag` : '—'} tip={TIPS.magnitude} />
          <Stat label="Diameter" val={`${fmt(dia.min_m)}–${fmt(dia.max_m)} m`} tip={TIPS.diameter} />
          <Stat label="Potentieel gevaarlijk" val={d.is_pha ? '⚠ Ja' : '✓ Nee'} color={d.is_pha ? 'var(--danger)' : 'var(--success)'} tip={TIPS.pha} />
          <Stat label="Sentry-object" val={d.is_sentry ? '⚠ Ja' : 'Nee'} color={d.is_sentry ? 'var(--warning)' : undefined} tip={TIPS.sentry} />
        </Grid>
        {d.nasa_jpl_url && (
          <a href={d.nasa_jpl_url} target="_blank" rel="noopener noreferrer" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
            fontSize: 12, color: 'var(--accent)', textDecoration: 'none',
          }}
            onMouseEnter={e => e.target.style.textDecoration = 'underline'}
            onMouseLeave={e => e.target.style.textDecoration = 'none'}
          >
            🔗 Bekijk op NASA JPL →
          </a>
        )}
      </Section>

      {/* Orbitaaldata */}
      <Section title="Orbitaalgegevens">
        <Grid>
          <Stat label="Orbitaaltype"  val={orb.orbit_class_type ? `${orb.orbit_class_type}` : '—'} tip={TIPS.orbittype} />
          <Stat label="Omlooptijd"    val={orb.period_days ? `${Number(orb.period_days).toFixed(1)} dagen` : '—'} tip={TIPS.period} />
          <Stat label="Halve hoofdas" val={orb.semi_major_axis ? `${fmtDec(orb.semi_major_axis, 4)} AU` : '—'} tip={TIPS.sma} />
          <Stat label="Excentriciteit" val={orb.eccentricity ? fmtDec(orb.eccentricity, 4) : '—'} tip={TIPS.eccentricity} />
          <Stat label="Inclinatie"    val={orb.inclination ? `${fmtDec(orb.inclination, 2)}°` : '—'} tip={TIPS.inclination} />
          <Stat label="Perihelion"    val={orb.perihelion ? `${fmtDec(orb.perihelion, 4)} AU` : '—'} tip={TIPS.perihelion} />
          <Stat label="Aphelion"      val={orb.aphelion ? `${fmtDec(orb.aphelion, 4)} AU` : '—'} tip={TIPS.aphelion} />
          <Stat label="Waarnemingen"  val={orb.obs_used ?? '—'} tip={TIPS.observations} />
        </Grid>
        {(orb.first_obs || orb.last_obs) && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
            Eerste waarneming: <strong>{orb.first_obs ?? '—'}</strong> · Laatste: <strong>{orb.last_obs ?? '—'}</strong>
          </div>
        )}
        {orb.orbit_class && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            {orb.orbit_class}
          </div>
        )}
      </Section>

      {/* Toekomstige naaderingen */}
      {ca.future?.length > 0 && (
        <Section title={`Komende naaderingen (${ca.future.length} van ${ca.total} totaal)`}>
          <ApproachTable rows={ca.future} highlight />
        </Section>
      )}

      {/* Recente naaderingen */}
      {ca.recent?.length > 0 && (
        <Section title="Recente naaderingen">
          <ApproachTable rows={ca.recent} />
        </Section>
      )}
    </div>
  )
}

// ── Tooltip teksten ──────────────────────────────────────────────────────────
const TIPS = {
  magnitude:    'De helderheid van de asteroïde op een vaste standaardafstand. Hoe lager het getal, hoe groter of helderder het object. H < 18 betekent doorgaans groter dan ~140 meter — vergelijkbaar met een wolkenkrabber.',
  diameter:     'Geschatte doorsnede in meters. Omdat we de glans (albedo) van het oppervlak niet precies kennen, geeft NASA een minimum en maximum. Ter vergelijking: een voetbalstadion is ~200 m groot.',
  pha:          'Officieel aangemerkt als "Potentieel Gevaarlijk" door NASA. Dit geldt voor objecten groter dan ~140 m die dichter dan 7,5 miljoen km langs de Aarde kunnen komen. Het betekent niet dat het de Aarde raakt — alleen dat het nauwlettend gevolgd wordt.',
  sentry:       "NASA's Sentry-systeem berekent inslagkansen voor de komende 100 jaar. Een Sentry-object heeft een (zeer kleine) berekende kans om de Aarde te raken. De meeste kansen zijn kleiner dan 1 op een miljoen.",
  orbittype:    "Classificatie van de baan om de Zon. Apollo-asteroïden kruisen de aardbaan (meest voorkomend bij gevaarlijke objecten). Aten-objecten bewegen grotendeels binnen de aardbaan. Amor-objecten komen dicht bij de aarde maar kruisen de baan niet.",
  period:       'Hoe lang de asteroïde erover doet om één keer rond de Zon te draaien, in aardse dagen. Ter vergelijking: de Aarde doet er 365 dagen over. Hoe groter de baan, hoe langer de omlooptijd.',
  sma:          'De gemiddelde afstand tot de Zon, uitgedrukt in Astronomische Eenheden (AU). 1 AU = ~150 miljoen km, gelijk aan de afstand tussen de Aarde en de Zon. Handig als maatstaf: Jupiter staat op 5,2 AU.',
  eccentricity: 'Hoe elliptisch (eivormig) de baan is. 0 = perfecte cirkel, bijna 1 = sterk langgerekte ellips. De Aarde heeft 0,017 (bijna cirkelvormig). Hoge excentriciteit betekent dat de asteroïde soms dicht bij de Zon komt en soms heel ver weg.',
  inclination:  'De kantelhoek van de baan ten opzichte van het vlak waarin de Aarde om de Zon draait. 0° = exact hetzelfde vlak als de Aarde. 90° = loodrecht erop. Een grote inclinatie maakt de baan ongewoner en minder voorspelbaar.',
  perihelion:   'Het punt in de baan dat het dichtst bij de Zon ligt, in AU. Hier beweegt de asteroïde het snelst. Als dit kleiner is dan ~1 AU, kan de baan die van de Aarde kruisen.',
  aphelion:     'Het punt in de baan dat het verst van de Zon ligt, in AU. Hier beweegt de asteroïde het langzaamst. Geeft aan hoe groot de baan maximaal is.',
  observations: 'Aantal telescoopwaarnemingen waarmee de baan is berekend. Meer waarnemingen = nauwkeuriger baan. Bij minder dan ~10 waarnemingen is er grotere onzekerheid over de toekomstige positie.',
  date:         'De datum waarop de asteroïde het dichtst bij de Aarde (of een ander hemellichaam) passeert, berekend op basis van de bekende baan.',
  dist_km:      'De dichtstbijzijnde afstand van de asteroïde tot het middelpunt van de Aarde in kilometer. Ter vergelijking: de Maan staat op ~384.400 km. De meeste weersatellieten vliegen op ~36.000 km hoogte.',
  dist_ld:      'Afstand uitgedrukt in Maanafstanden (Lunar Distance). 1 LD = ~384.400 km. Een nadering binnen 1 LD (dichter dan de Maan) geldt als extreem dichtbij. Alles boven 10 LD is voor de gemiddelde mens een veilige afstand.',
  velocity:     'De snelheid van de asteroïde ten opzichte van de Aarde op het dichtstbijzijnde punt, in km/u. Ter vergelijking: een kogel vliegt ~3.600 km/u. Grote asteroïden komen de atmosfeer in met 50.000–250.000 km/u.',
  body:         'Het hemellichaam waartegen de nadering wordt gemeten. Doorgaans de Aarde, maar NASA berekent ook naaderingen ten opzichte van de Maan, Mars en andere planeten.',
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--accent)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
      }}>{title}</div>
      {children}
    </div>
  )
}

function Grid({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
      {children}
    </div>
  )
}

function Stat({ label, val, color, tip }) {
  return (
    <div style={{
      padding: '6px 10px', background: 'var(--surface2)', borderRadius: 7,
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <span style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {tip && <InfoTip text={tip} />}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color ?? 'var(--text)' }}>{val}</span>
    </div>
  )
}

const APPROACH_COLS = [
  { label: 'Datum',           tip: TIPS.date },
  { label: 'Afstand (km)',    tip: TIPS.dist_km },
  { label: 'Afstand (LD)',    tip: TIPS.dist_ld },
  { label: 'Snelheid (km/u)', tip: TIPS.velocity },
  { label: 'Lichaam',         tip: TIPS.body },
]

function ApproachTable({ rows, highlight }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: 'var(--surface2)' }}>
            {APPROACH_COLS.map(col => (
              <th key={col.label} style={{ padding: '5px 8px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {col.label}
                  <InfoTip text={col.tip} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{
              borderBottom: '1px solid var(--border)',
              background: highlight && i === 0 ? 'rgba(59,130,246,0.06)' : 'transparent',
            }}>
              <td style={{ padding: '5px 8px', color: highlight ? 'var(--accent)' : 'var(--text)', whiteSpace: 'nowrap', fontWeight: highlight && i === 0 ? 600 : 400 }}>
                {r.date}
              </td>
              <td style={{ padding: '5px 8px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {Number(r.miss_km).toLocaleString('nl-NL', { maximumFractionDigits: 0 })}
              </td>
              <td style={{ padding: '5px 8px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                {Number(r.miss_ld).toFixed(2)} LD
              </td>
              <td style={{ padding: '5px 8px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {Number(r.vel_kmu).toLocaleString('nl-NL', { maximumFractionDigits: 0 })}
              </td>
              <td style={{ padding: '5px 8px', color: 'var(--muted)' }}>{r.orbiting}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
