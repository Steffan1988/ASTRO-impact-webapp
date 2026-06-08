import { useState } from 'react'

export default function WidgetRandomAsteroid() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetch_ = () => {
    setLoading(true); setError(null)
    fetch('/api/random/asteroid')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  const rows = data ? [
    ['Naam', data.name ?? data.full_name ?? '—'],
    ['Diameter min', data.diameter_min != null ? `${Number(data.diameter_min).toFixed(0)} m` : '—'],
    ['Diameter max', data.diameter_max != null ? `${Number(data.diameter_max).toFixed(0)} m` : '—'],
    ['Snelheid', data.relative_velocity_kms != null ? `${Number(data.relative_velocity_kms).toFixed(2)} km/s` : '—'],
    ['Nadering', data.close_approach_date ?? '—'],
    ['Afstand', data.miss_distance_km != null ? `${Number(data.miss_distance_km).toLocaleString('nl-NL', { maximumFractionDigits: 0 })} km` : '—'],
    ['Gevaarlijk', data.is_potentially_hazardous ? '⚠ Ja' : '✓ Nee'],
  ] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <button onClick={fetch_} disabled={loading} style={{
        padding: '8px 16px', borderRadius: 8, border: 'none',
        background: 'var(--accent2)', color: '#fff', fontWeight: 700,
        cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13,
      }}>
        {loading ? '🔄 Laden...' : '🎲 Willekeurig object'}
      </button>

      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>Fout: {error}</p>}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '6px 10px', background: 'var(--surface2)',
              borderRadius: 6, fontSize: 13,
            }}>
              <span style={{ color: 'var(--muted)' }}>{k}</span>
              <span style={{
                fontWeight: 600,
                color: k === 'Gevaarlijk' && v.startsWith('⚠') ? 'var(--danger)' : 'var(--text)',
              }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {!data && !loading && (
        <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
          Klik op de knop voor een willekeurig NEO-object uit de NASA database.
        </p>
      )}
    </div>
  )
}
