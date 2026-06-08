import { useEffect, useState, useCallback } from 'react'

const HIDDEN_KEYS = new Set(['connected', 'status', 'ok'])

export default function WidgetDbStatus() {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [lastCheck, setLastCheck] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/db/status')
      .then(r => r.json())
      .then(d => {
        setData(d)
        setLastCheck(new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 46, borderRadius: 8, background: 'var(--surface2)', animation: 'skeleton-pulse 1.4s ease-in-out infinite' }} />
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          height: 32, borderRadius: 6, background: 'var(--surface2)',
          animation: `skeleton-pulse 1.4s ${i * 0.1}s ease-in-out infinite`,
        }} />
      ))}
    </div>
  )

  if (error) return (
    <div>
      <p style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>DB niet bereikbaar: {error}</p>
      <button onClick={load} style={btnStyle}>↺ Opnieuw</button>
    </div>
  )

  const connected = data?.ok === true || data?.connected === true || data?.status === 'ok'
  const entries = data ? Object.entries(data).filter(([k]) => !HIDDEN_KEYS.has(k)) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 8,
        background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
        border: `1px solid ${connected ? 'var(--success)' : 'var(--danger)'}`,
      }}>
        <span style={{ fontSize: 18 }}>{connected ? '🟢' : '🔴'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: connected ? 'var(--success)' : 'var(--danger)', fontSize: 13 }}>
            {connected ? 'Verbonden' : 'Niet verbonden'}
          </div>
          {lastCheck && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
              Gecontroleerd om {lastCheck}
            </div>
          )}
        </div>
      </div>

      {entries.map(([k, v]) => (
        <div key={k} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '5px 10px', background: 'var(--surface2)',
          borderRadius: 6, fontSize: 12, gap: 8,
        }}>
          <span style={{ color: 'var(--muted)', textTransform: 'capitalize' }}>
            {k.replace(/_/g, ' ')}
          </span>
          <span style={{
            color: typeof v === 'number' ? 'var(--accent)' : 'var(--text)',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {typeof v === 'number' ? Number(v).toLocaleString('nl-NL') : String(v)}
          </span>
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
