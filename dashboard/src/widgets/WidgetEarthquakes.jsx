import { useEffect, useState, useMemo } from 'react'

const MAG_COLOR = m => m >= 7 ? 'var(--danger)' : m >= 5 ? 'var(--warning)' : 'var(--success)'

const COLUMNS = [
  { key: 'mag',   label: 'M',       numeric: true  },
  { key: 'place', label: 'Locatie', numeric: false },
  { key: 'time',  label: 'Datum',   numeric: true  },
  { key: 'depth', label: 'Diepte (km)', numeric: true },
]

export default function WidgetEarthquakes() {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [minMag, setMinMag]   = useState(0)
  const [sort, setSort]       = useState({ col: 'time', dir: 'desc' })

  useEffect(() => {
    fetch('/api/usgs/earthquakes')
      .then(r => r.json())
      .then(d => {
        setData(Array.isArray(d) ? d : d.data ?? d.features ?? [])
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const getMag   = q => Number(q.mag  ?? q.properties?.mag   ?? 0)
  const getTime  = q => { const t = q.time ?? q.properties?.time; return t ? (typeof t === 'number' ? t : new Date(t).getTime()) : 0 }
  const getDepth = q => q.depth != null ? Number(q.depth) : null
  const getPlace = q => q.place ?? q.properties?.place ?? ''

  const toggleSort = col => {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: col === 'place' ? 'asc' : 'desc' }
    )
  }

  const sorted = useMemo(() => {
    const filtered = data.filter(q => getMag(q) >= minMag)
    const { col, dir } = sort
    return [...filtered].sort((a, b) => {
      let va, vb
      if (col === 'mag')   { va = getMag(a);   vb = getMag(b) }
      else if (col === 'time')  { va = getTime(a);  vb = getTime(b) }
      else if (col === 'depth') { va = getDepth(a) ?? -1; vb = getDepth(b) ?? -1 }
      else { va = getPlace(a); vb = getPlace(b) }
      const cmp = typeof va === 'string' ? va.localeCompare(vb, 'nl') : va - vb
      return dir === 'asc' ? cmp : -cmp
    })
  }, [data, minMag, sort])

  if (loading) return <p style={{ color: 'var(--muted)', textAlign: 'center', paddingTop: 24 }}>Laden...</p>
  if (error)   return <p style={{ color: 'var(--danger)' }}>Fout: {error}</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          Min. M: <strong style={{ color: 'var(--text)' }}>{minMag}</strong>
        </label>
        <input
          type="range" min={0} max={9} step={0.5} value={minMag}
          onChange={e => setMinMag(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--accent)' }}
        />
        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {sorted.length} events
        </span>
      </div>

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
                      padding: '6px 8px', textAlign: 'left', fontWeight: 600,
                      cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                      color: active ? 'var(--accent)' : 'var(--muted)',
                    }}
                    title={`Sorteren op ${col.label}`}
                  >
                    {col.label}
                    {active && <span style={{ marginLeft: 4, fontSize: 10 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 60).map((q, i) => {
              const mag   = getMag(q)
              const place = getPlace(q)
              const depth = getDepth(q)
              const time  = getTime(q)
              const date  = time ? new Date(time).toLocaleDateString('nl-NL') : '—'

              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: MAG_COLOR(mag) }}>
                      {mag.toFixed(1)}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={place}>
                    {place || '—'}
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {date}
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {depth != null ? `${depth.toFixed(1)} km` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 16 }}>
            Geen aardbevingen boven M{minMag}
          </p>
        )}
      </div>
    </div>
  )
}
