import { useEffect, useState, useMemo } from 'react'

const ENERGY_COLOR = kt =>
  kt >= 100 ? 'var(--danger)' : kt >= 10 ? 'var(--warning)' : kt >= 1 ? '#f97316' : 'var(--muted)'

const COLUMNS = [
  { key: 'date',         label: 'Datum',           numeric: false },
  { key: 'energy_kt',   label: 'Energie (kt TNT)', numeric: true  },
  { key: 'impact_e_kt', label: 'Impact (kt)',       numeric: true  },
  { key: 'vel_kms',     label: 'Snelheid (km/s)',   numeric: true  },
  { key: 'alt_km',      label: 'Hoogte (km)',       numeric: true  },
  { key: 'lat',         label: 'Lat',               numeric: true  },
  { key: 'lng',         label: 'Lon',               numeric: true  },
]

export default function WidgetFireballs() {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [sort, setSort]       = useState({ col: 'energy_kt', dir: 'desc' })

  const load = () => {
    setLoading(true); setError(null)
    fetch('/api/nasa/fireballs')
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : d.data ?? []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const toggleSort = col =>
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: col === 'date' ? 'desc' : 'desc' }
    )

  const sorted = useMemo(() => {
    const { col, dir } = sort
    return [...data].sort((a, b) => {
      const va = a[col], vb = b[col]
      if (va == null) return 1
      if (vb == null) return -1
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : Number(va) - Number(vb)
      return dir === 'asc' ? cmp : -cmp
    })
  }, [data, sort])

  if (loading) return <TableSkeleton rows={8} cols={5} />
  if (error || data.length === 0) return (
    <EmptyState
      icon="🔭"
      title="Fireball data niet beschikbaar"
      subtitle={error ?? 'NASA Fireball API tijdelijk niet bereikbaar.'}
      onRetry={load}
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          Top <strong style={{ color: 'var(--text)' }}>{data.length}</strong> energierijkste vuurbolgebeurtenissen
        </span>
        <button onClick={load} style={refreshBtn} title="Vernieuwen">↺</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: 'var(--surface2)', zIndex: 1 }}>
              {COLUMNS.map(col => {
                const active = sort.col === col.key
                return (
                  <th key={col.key} onClick={() => toggleSort(col.key)} style={{
                    padding: '6px 8px', textAlign: 'left', fontWeight: 600,
                    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                    color: active ? 'var(--accent)' : 'var(--muted)',
                  }} title={`Sorteren op ${col.label}`}>
                    {col.label}
                    {active && <span style={{ marginLeft: 4, fontSize: 10 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((f, i) => {
              const energy = Number(f.energy_kt ?? 0)
              return (
                <tr key={i} style={{
                  borderBottom: '1px solid var(--border)',
                  background: energy >= 100 ? 'rgba(239,68,68,0.04)' : 'transparent',
                }}>
                  <td style={td}>{f.date ?? '—'}</td>
                  <td style={{ ...td, fontWeight: 600, color: ENERGY_COLOR(energy) }}>
                    {energy > 0 ? energy.toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : '—'}
                  </td>
                  <td style={td}>{fmt(f.impact_e_kt)}</td>
                  <td style={td}>{f.vel_kms > 0 ? fmt(f.vel_kms) : '—'}</td>
                  <td style={td}>{f.alt_km > 0 ? fmt(f.alt_km) : '—'}</td>
                  <td style={td}>{f.lat != null ? fmt(f.lat) : '—'}</td>
                  <td style={td}>{f.lng != null ? fmt(f.lng) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TableSkeleton({ rows, cols }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 4 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 8 }}>
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} style={{
              flex: j === 0 ? 2 : 1, height: 20, borderRadius: 4,
              background: 'var(--surface2)',
              animation: 'skeleton-pulse 1.4s ease-in-out infinite',
              animationDelay: `${(i * cols + j) * 0.05}s`,
            }} />
          ))}
        </div>
      ))}
    </div>
  )
}

function EmptyState({ icon, title, subtitle, onRetry }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14, marginBottom: 6 }}>{title}</p>
      <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 16 }}>{subtitle}</p>
      {onRetry && (
        <button onClick={onRetry} style={{
          padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer', fontSize: 12,
        }}>↺ Opnieuw proberen</button>
      )}
    </div>
  )
}

const fmt = v => v != null && Number(v) !== 0
  ? Number(v).toLocaleString('nl-NL', { maximumFractionDigits: 2 })
  : '—'
const td = { padding: '5px 8px', color: 'var(--text)' }
const refreshBtn = {
  marginLeft: 'auto', padding: '3px 8px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--muted)', cursor: 'pointer', fontSize: 12,
}
