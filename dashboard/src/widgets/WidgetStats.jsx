import { useEffect, useState, useCallback } from 'react'

const RANGES = [
  { label: '< 1.000',       min: 0,         max: 1_000,         color: '#22c55e' },
  { label: '1K – 10K',      min: 1_000,     max: 10_000,        color: '#84cc16' },
  { label: '10K – 100K',    min: 10_000,    max: 100_000,       color: '#eab308' },
  { label: '100K – 1M',     min: 100_000,   max: 1_000_000,     color: '#f97316' },
  { label: '1M – 100M',     min: 1_000_000, max: 100_000_000,   color: '#ef4444' },
  { label: '> 100M',        min: 100_000_000, max: Infinity,    color: '#7f1d1d' },
]

const ZONE_LABELS = {
  sl_direct:    { label: 'Direct',     color: '#ef4444' },
  sl_thermisch: { label: 'Thermisch',  color: '#f97316' },
  sl_shockgolf: { label: 'Schokgolf',  color: '#eab308' },
  sl_seismisch: { label: 'Seismisch',  color: '#8b5cf6' },
  sl_overig:    { label: 'Overig',     color: '#64748b' },
}

const ZONES_INFO = [
  { key: 'r_vuurbal',       label: 'Vuurbal',             color: '#ef4444', mortality: 1.00 },
  { key: 'r_zware_vern',    label: 'Zware verwoesting',   color: '#f97316', mortality: 0.97 },
  { key: 'r_matige_vern',   label: 'Matige verwoesting',  color: '#f59e0b', mortality: 0.50 },
  { key: 'r_thermisch',     label: 'Thermisch',           color: '#ec4899', mortality: 0.40 },
  { key: 'r_lichte_schade', label: 'Lichte schade',       color: '#3b82f6', mortality: 0.05 },
  { key: 'r_seismisch',     label: 'Seismisch',           color: '#8b5cf6', mortality: 0.015 },
]

const fmt = n => {
  if (n == null) return '—'
  n = Number(n)
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' mrd'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' mln'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return n.toLocaleString('nl-NL')
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// Estimates casualties for a non-target country in a given zone.
// Uses: population × min(1, zone_area / country_area) × zone_mortality
function estimateCasualties(country, zoneRadius, mortality) {
  const pop  = Number(country.populatie ?? 0)
  const area = Number(country.oppervlakte ?? 1)
  if (!pop) return 0
  const zoneArea = Math.PI * zoneRadius * zoneRadius   // km²
  const fraction = Math.min(1.0, zoneArea / area)
  return Math.round(pop * fraction * mortality)
}

// Returns: array of { ...zone, radius, countries: [..., { ...country, dist, casualties }] }
function getAffectedCountries(sim, countries) {
  if (!sim || !sim.lat || !sim.lng || !countries.length) return []
  const lat = Number(sim.lat)
  const lng = Number(sim.lng)

  return ZONES_INFO
    .filter(z => Number(sim[z.key]) > 0)
    .map(z => {
      const r = Number(sim[z.key])
      const within = countries
        .filter(c => c.lat != null && c.lng != null)
        .map(c => {
          const dist       = haversine(lat, lng, Number(c.lat), Number(c.lng))
          const isTarget   = c.naam === sim.land_naam
          // Target country: use the simulation's exact total casualties
          // Other countries: estimate based on zone overlap + mortality fraction
          const casualties = isTarget
            ? Number(sim.slachtoffers ?? 0)
            : estimateCasualties(c, r, z.mortality)
          return { ...c, dist, casualties }
        })
        .filter(c => c.dist <= r)
        .sort((a, b) => b.casualties - a.casualties)  // highest casualties first
      return { ...z, radius: r, countries: within }
    })
    .filter(z => z.countries.length > 0)
}

export default function WidgetStats() {
  const [sims, setSims] = useState([])
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [countriesLoading, setCountriesLoading] = useState(false)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('ranges')
  const [selectedSimId, setSelectedSimId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/simulations?limit=200')
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : d.data ?? []
        setSims(list)
        if (list.length > 0) setSelectedSimId(prev => prev ?? list[0].id)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const loadCountries = useCallback(() => {
    if (countries.length > 0) return
    setCountriesLoading(true)
    fetch('/api/countries')
      .then(r => r.json())
      .then(d => {
        setCountries(Array.isArray(d) ? d : d.data ?? [])
        setCountriesLoading(false)
      })
      .catch(() => setCountriesLoading(false))
  }, [countries.length])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (tab === 'inslag') loadCountries()
  }, [tab, loadCountries])

  if (loading) return <Loader />
  if (error)   return <Err msg={error} onRetry={load} />
  if (!sims.length) return <Empty onRetry={load} />

  const total = sims.length

  const rangeCounts = RANGES.map(r => ({
    ...r,
    count: sims.filter(s => {
      const v = Number(s.slachtoffers ?? 0)
      return v >= r.min && v < r.max
    }).length,
  }))
  const maxRangeCount = Math.max(...rangeCounts.map(r => r.count), 1)

  const zoneTotals = Object.entries(ZONE_LABELS).map(([key, meta]) => ({
    ...meta, key,
    total: sims.reduce((sum, s) => sum + Number(s[key] ?? 0), 0),
  }))
  const maxZone = Math.max(...zoneTotals.map(z => z.total), 1)

  const landenMap = {}
  sims.forEach(s => {
    const l = s.land_naam ?? '—'
    if (!landenMap[l]) landenMap[l] = { count: 0, slachtoffers: 0 }
    landenMap[l].count++
    landenMap[l].slachtoffers += Number(s.slachtoffers ?? 0)
  })
  const landen = Object.entries(landenMap)
    .map(([naam, d]) => ({ naam, ...d }))
    .sort((a, b) => b.slachtoffers - a.slachtoffers)
    .slice(0, 8)
  const maxLandSlacht = Math.max(...landen.map(l => l.slachtoffers), 1)

  const totSlachtoffers = sims.reduce((s, r) => s + Number(r.slachtoffers ?? 0), 0)
  const avgEnergie = sims.reduce((s, r) => s + Number(r.energie_megaton ?? 0), 0) / total
  const extinctieCount = sims.filter(s => s.extinction_event).length

  const selectedSim = sims.find(s => s.id === selectedSimId) ?? null
  const affectedZones = tab === 'inslag' && selectedSim && countries.length
    ? getAffectedCountries(selectedSim, countries)
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      {/* Summary row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          ['Simulaties', total, 'var(--accent)'],
          ['Totaal slachtoffers', fmt(totSlachtoffers), 'var(--danger)'],
          ['Gem. energie', `${avgEnergie.toFixed(0)} Mt`, 'var(--warning)'],
          ['Extinctie-events', extinctieCount, '#7f1d1d'],
        ].map(([k, v, c]) => (
          <div key={k} style={{
            flex: 1, minWidth: 90,
            background: 'var(--surface2)', borderRadius: 8, padding: '6px 10px',
            borderLeft: `3px solid ${c}`,
          }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{k}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          ['ranges', 'Slachtofferranges'],
          ['zones',  'Per zone'],
          ['landen', 'Top landen'],
          ['inslag', '🌍 Per inslag'],
        ].map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            border: `1px solid ${tab === id ? 'var(--accent)' : 'var(--border)'}`,
            background: tab === id ? 'rgba(59,130,246,0.15)' : 'var(--surface2)',
            color: tab === id ? 'var(--accent)' : 'var(--muted)',
            fontWeight: tab === id ? 600 : 400,
          }}>{lbl}</button>
        ))}
        <button onClick={load} style={{
          marginLeft: 'auto', padding: '4px 8px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--surface2)',
          color: 'var(--muted)', cursor: 'pointer', fontSize: 12,
        }}>↺</button>
      </div>

      {/* Tab content */}
      <div key={tab} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, animation: 'fadeInUp 0.18s ease' }}>

        {tab === 'ranges' && rangeCounts.map(r => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 100, fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{r.label}</span>
            <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 4, height: 20, overflow: 'hidden' }}>
              <div style={{
                width: `${(r.count / maxRangeCount) * 100}%`,
                height: '100%', background: r.color,
                borderRadius: 4, transition: 'width 0.4s ease',
                minWidth: r.count > 0 ? 4 : 0,
              }} />
            </div>
            <span style={{ width: 28, fontSize: 12, fontWeight: 600, color: 'var(--text)', textAlign: 'right', flexShrink: 0 }}>
              {r.count}
            </span>
          </div>
        ))}

        {tab === 'zones' && (
          <>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 4px' }}>
              Totaal aantal slachtoffers per oorzaak over alle simulaties
            </p>
            {zoneTotals.sort((a, b) => b.total - a.total).map(z => (
              <div key={z.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 90, fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{z.label}</span>
                <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 4, height: 20, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(z.total / maxZone) * 100}%`,
                    height: '100%', background: z.color, borderRadius: 4,
                    transition: 'width 0.4s ease', minWidth: z.total > 0 ? 4 : 0,
                  }} />
                </div>
                <span style={{ width: 55, fontSize: 11, fontWeight: 600, color: 'var(--text)', textAlign: 'right', flexShrink: 0 }}>
                  {fmt(z.total)}
                </span>
              </div>
            ))}
          </>
        )}

        {tab === 'landen' && landen.map(l => (
          <div key={l.naam} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 110, fontSize: 11, color: 'var(--muted)', flexShrink: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={l.naam}>{l.naam}</span>
            <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 4, height: 20, overflow: 'hidden' }}>
              <div style={{
                width: `${(l.slachtoffers / maxLandSlacht) * 100}%`,
                height: '100%', background: 'var(--danger)', borderRadius: 4,
                transition: 'width 0.4s ease', minWidth: l.slachtoffers > 0 ? 4 : 0,
              }} />
            </div>
            <span style={{ width: 55, fontSize: 11, fontWeight: 600, color: 'var(--text)', textAlign: 'right', flexShrink: 0 }}>
              {fmt(l.slachtoffers)}
            </span>
            <span style={{ width: 20, fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>×{l.count}</span>
          </div>
        ))}

        {tab === 'inslag' && (
          <InslagTab
            sims={sims}
            selectedSimId={selectedSimId}
            setSelectedSimId={setSelectedSimId}
            selectedSim={selectedSim}
            affectedZones={affectedZones}
            countriesLoading={countriesLoading}
            countries={countries}
          />
        )}

      </div>
    </div>
  )
}

function InslagTab({ sims, selectedSimId, setSelectedSimId, selectedSim, affectedZones, countriesLoading, countries }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Simulatie kiezer */}
      <select
        value={selectedSimId ?? ''}
        onChange={e => setSelectedSimId(Number(e.target.value))}
        style={{
          padding: '6px 8px', borderRadius: 6, fontSize: 12,
          border: '1px solid var(--border)', background: 'var(--surface2)',
          color: 'var(--text)', width: '100%',
        }}
      >
        {sims.map(s => (
          <option key={s.id} value={s.id}>
            #{s.id} — {s.asteroid_naam ?? '?'} → {s.land_naam ?? '?'} ({s.created_at?.slice(0, 10) ?? '?'})
          </option>
        ))}
      </select>

      {/* Impact samenvatting */}
      {selectedSim && (
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap',
          padding: '8px 10px', background: 'var(--surface2)',
          borderRadius: 8, fontSize: 11,
        }}>
          {[
            ['☄️', selectedSim.asteroid_naam],
            ['🌍', selectedSim.land_naam],
            ['📍', selectedSim.lat != null ? `${Number(selectedSim.lat).toFixed(1)}°N, ${Number(selectedSim.lng).toFixed(1)}°E` : '—'],
            ['💥', selectedSim.energie_megaton != null ? `${Number(selectedSim.energie_megaton).toFixed(0)} Mt` : '—'],
            ['💀', fmt(selectedSim.slachtoffers)],
          ].map(([icon, val]) => (
            <span key={icon} style={{ color: 'var(--muted)' }}>
              {icon} <strong style={{ color: 'var(--text)' }}>{val}</strong>
            </span>
          ))}
        </div>
      )}

      {countriesLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              height: 80, borderRadius: 8, background: 'var(--surface2)',
              animation: `skeleton-pulse 1.4s ${i * 0.15}s ease-in-out infinite`,
            }} />
          ))}
        </div>
      )}

      {!countriesLoading && countries.length === 0 && (
        <p style={{ color: 'var(--danger)', fontSize: 12, textAlign: 'center' }}>
          Landen konden niet worden geladen.
        </p>
      )}

      {/* Zones met betrokken landen */}
      {!countriesLoading && affectedZones.length === 0 && selectedSim && countries.length > 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 12 }}>
          Geen landen gevonden binnen de schade-zones.<br />
          <span style={{ fontSize: 11 }}>(Mogelijk een oceaaninslag zonder nabije landen)</span>
        </p>
      )}

      {affectedZones.map(zone => (
        <div key={zone.key} style={{
          borderRadius: 8, overflow: 'hidden',
          border: `1px solid ${zone.color}33`,
        }}>
          {/* Zone header */}
          {(() => {
            const totalCas = zone.countries.reduce((s, c) => s + (c.casualties ?? 0), 0)
            return (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px',
                background: `${zone.color}22`,
                borderBottom: `1px solid ${zone.color}33`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: zone.color, display: 'inline-block', flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: zone.color }}>
                    {zone.label}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  r = {zone.radius >= 10
                    ? `${zone.radius.toFixed(0)} km`
                    : `${zone.radius.toFixed(1)} km`
                  }
                  &nbsp;·&nbsp;
                  {zone.countries.length} {zone.countries.length === 1 ? 'land' : 'landen'}
                  {totalCas > 0 && (
                    <span style={{ color: 'var(--danger)', marginLeft: 6 }}>
                      💀 {fmt(totalCas)}
                    </span>
                  )}
                </span>
              </div>
            )
          })()}

          {/* Countries */}
          <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Column headers */}
            <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--muted)', paddingBottom: 2, borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 18, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>Land</span>
              <span style={{ width: 48, textAlign: 'right', flexShrink: 0 }}>Afstand</span>
              <span style={{ width: 58, textAlign: 'right', flexShrink: 0 }}>Bevolking</span>
              <span style={{ width: 62, textAlign: 'right', flexShrink: 0, color: 'var(--danger)' }}>💀 Slachtoffers</span>
            </div>
            {zone.countries.map((c, i) => {
              const isTarget = c.naam === selectedSim?.land_naam
              return (
                <div key={c.naam} style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
                  background: isTarget ? `${zone.color}11` : 'transparent',
                  borderRadius: 4, padding: '1px 0',
                }}>
                  <span style={{
                    width: 18, textAlign: 'right', flexShrink: 0,
                    color: 'var(--muted)', fontSize: 10,
                  }}>
                    {i + 1}.
                  </span>
                  <span style={{
                    flex: 1, color: isTarget ? zone.color : 'var(--text)',
                    fontWeight: isTarget ? 700 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={c.naam}>
                    {isTarget ? '🎯 ' : ''}{c.naam}
                    {isTarget && (
                      <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>
                        (exact)
                      </span>
                    )}
                  </span>
                  <span style={{ width: 48, color: 'var(--muted)', fontSize: 10, textAlign: 'right', flexShrink: 0 }}>
                    {c.dist.toFixed(0)} km
                  </span>
                  <span style={{ width: 58, color: 'var(--muted)', fontSize: 10, textAlign: 'right', flexShrink: 0 }}>
                    {c.populatie > 0 ? fmt(c.populatie) : '—'}
                  </span>
                  <span style={{
                    width: 62, fontSize: 11, fontWeight: isTarget ? 700 : 500,
                    textAlign: 'right', flexShrink: 0,
                    color: c.casualties > 0 ? (isTarget ? zone.color : 'var(--danger)') : 'var(--muted)',
                  }}>
                    {c.casualties > 0 ? fmt(c.casualties) : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

const Loader = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
    <div style={{ display: 'flex', gap: 8 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          flex: 1, height: 52, borderRadius: 8,
          background: 'var(--surface2)',
          animation: `skeleton-pulse 1.4s ${i * 0.1}s ease-in-out infinite`,
        }} />
      ))}
    </div>
    <div style={{ display: 'flex', gap: 6 }}>
      {[90, 80, 80, 100].map((w, i) => (
        <div key={i} style={{
          width: w, height: 28, borderRadius: 6,
          background: 'var(--surface2)',
          animation: `skeleton-pulse 1.4s ${i * 0.08}s ease-in-out infinite`,
        }} />
      ))}
    </div>
    {[0.75, 0.45, 0.60, 0.90, 0.35, 0.70].map((w, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 90, height: 16, borderRadius: 4, background: 'var(--surface2)', animation: `skeleton-pulse 1.4s ${i*0.08}s ease-in-out infinite`, flexShrink: 0 }} />
        <div style={{ flex: 1, height: 20, borderRadius: 4, background: 'var(--surface2)', animation: `skeleton-pulse 1.4s ${i*0.08}s ease-in-out infinite`, overflow: 'hidden' }}>
          <div style={{ width: `${w*100}%`, height: '100%', background: 'var(--border)', borderRadius: 4, opacity: 0.5 }} />
        </div>
        <div style={{ width: 28, height: 16, borderRadius: 4, background: 'var(--surface2)', animation: `skeleton-pulse 1.4s ${i*0.08}s ease-in-out infinite`, flexShrink: 0 }} />
      </div>
    ))}
  </div>
)
const Err = ({ msg, onRetry }) => (
  <div style={{ textAlign: 'center', paddingTop: 16 }}>
    <p style={{ color: 'var(--danger)', marginBottom: 8, fontSize: 12 }}>
      Database niet bereikbaar: {msg}
    </p>
    <p style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 12 }}>
      Voer <code>setup_db.sql</code> uit en herstart Flask.
    </p>
    <button onClick={onRetry} style={btnStyle}>↺ Opnieuw</button>
  </div>
)
const Empty = ({ onRetry }) => (
  <div style={{ textAlign: 'center', paddingTop: 24 }}>
    <p style={{ fontSize: 28, marginBottom: 8 }}>📊</p>
    <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nog geen simulaties opgeslagen.</p>
    <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>Sleep een asteroïde op de kaart om te starten.</p>
    <button onClick={onRetry} style={{ ...btnStyle, marginTop: 12 }}>↺ Vernieuwen</button>
  </div>
)
const btnStyle = {
  padding: '5px 14px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer', fontSize: 12,
}
