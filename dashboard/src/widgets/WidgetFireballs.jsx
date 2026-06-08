import { useEffect, useState } from 'react'

export default function WidgetFireballs() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortKey, setSortKey] = useState('date')

  useEffect(() => {
    fetch('/api/nasa/fireballs')
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : d.data ?? d.fireballs ?? []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const sorted = [...data].sort((a, b) => {
    if (sortKey === 'energy') return (b.energy ?? 0) - (a.energy ?? 0)
    if (sortKey === 'alt') return (b.alt ?? 0) - (a.alt ?? 0)
    return (b.date ?? '').localeCompare(a.date ?? '')
  })

  if (loading) return <p style={{ color: 'var(--muted)', textAlign: 'center', paddingTop: 24 }}>Laden...</p>
  if (error || data.length === 0) return (
    <div style={{ padding: 16, textAlign: 'center' }}>
      <p style={{ fontSize: 28, marginBottom: 8 }}>🔭</p>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>NASA Fireball API tijdelijk niet beschikbaar.</p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{error}</p>}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[['date', 'Datum'], ['energy', 'Energie'], ['alt', 'Hoogte']].map(([k, l]) => (
          <button key={k} onClick={() => setSortKey(k)} style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 12,
            border: `1px solid ${sortKey === k ? 'var(--accent)' : 'var(--border)'}`,
            background: sortKey === k ? 'rgba(59,130,246,0.15)' : 'var(--surface2)',
            color: sortKey === k ? 'var(--accent)' : 'var(--muted)',
            cursor: 'pointer',
          }}>{l}</button>
        ))}
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 12, alignSelf: 'center' }}>
          {data.length} events
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: 'var(--surface2)' }}>
              {['Datum', 'Lat', 'Lon', 'Hoogte (km)', 'Energie (GJ)', 'Impact energie (kt)'].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 80).map((f, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={td}>{f.date ?? '—'}</td>
                <td style={td}>{fmt(f.lat)}</td>
                <td style={td}>{fmt(f.lon)}</td>
                <td style={td}>{fmt(f.alt)}</td>
                <td style={td}>{fmt(f.energy)}</td>
                <td style={td}>{fmt(f.impact_e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 16 }}>Geen data</p>}
      </div>
    </div>
  )
}

const fmt = v => v != null ? Number(v).toLocaleString('nl-NL', { maximumFractionDigits: 2 }) : '—'
const td = { padding: '5px 8px', color: 'var(--text)' }
