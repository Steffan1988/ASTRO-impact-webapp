import { useEffect, useState, useMemo } from 'react'

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

  useEffect(() => {
    fetch('/api/asteroids')
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : d.data ?? []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
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
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
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
                </tr>
              )
            })}
          </tbody>
        </table>
        {sorted.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 16 }}>Geen resultaten</p>}
      </div>
    </div>
  )
}

const fmt    = v => v != null ? Number(v).toLocaleString('nl-NL', { maximumFractionDigits: 0 }) : '—'
const fmtBig = v => v != null ? (Number(v) / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) + ' M' : '—'
const thStyle = { padding: '6px 8px', textAlign: 'left', fontWeight: 600 }
const tdStyle = { padding: '5px 8px', color: 'var(--text)' }
const inputStyle = {
  flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--text)', fontSize: 13,
}
