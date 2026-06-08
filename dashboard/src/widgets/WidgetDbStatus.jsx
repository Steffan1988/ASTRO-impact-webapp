import { useEffect, useState } from 'react'

export default function WidgetDbStatus() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => {
    setLoading(true)
    fetch('/api/db/status')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  if (loading) return <p style={{ color: 'var(--muted)', fontSize: 12 }}>Laden...</p>
  if (error) return (
    <div>
      <p style={{ color: 'var(--danger)', fontSize: 12 }}>DB niet bereikbaar: {error}</p>
      <button onClick={load} style={btnStyle}>↺ Opnieuw</button>
    </div>
  )

  const connected = data?.ok === true || data?.connected === true || data?.status === 'ok'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 8,
        background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
        border: `1px solid ${connected ? 'var(--success)' : 'var(--danger)'}`,
      }}>
        <span style={{ fontSize: 18 }}>{connected ? '🟢' : '🔴'}</span>
        <span style={{ fontWeight: 700, color: connected ? 'var(--success)' : 'var(--danger)' }}>
          {connected ? 'Verbonden' : 'Niet verbonden'}
        </span>
      </div>

      {data && Object.entries(data).filter(([k]) => k !== 'connected' && k !== 'status').map(([k, v]) => (
        <div key={k} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '5px 10px', background: 'var(--surface2)',
          borderRadius: 6, fontSize: 12,
        }}>
          <span style={{ color: 'var(--muted)' }}>{k}</span>
          <span style={{ color: 'var(--text)', fontWeight: 500 }}>{String(v)}</span>
        </div>
      ))}

      <button onClick={load} style={btnStyle}>↺ Vernieuwen</button>
    </div>
  )
}

const btnStyle = {
  padding: '5px 12px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--text)', cursor: 'pointer', fontSize: 12,
}
