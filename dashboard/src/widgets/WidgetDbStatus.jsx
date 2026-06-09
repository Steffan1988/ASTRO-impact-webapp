import { useEffect, useState, useCallback } from 'react'

const fmt = n => {
  if (n == null) return '—'
  n = Number(n)
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' mrd'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' mln'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return n.toLocaleString('nl-NL')
}

export default function WidgetDbStatus({ selectedSimId, onSimSelect, simVersion }) {
  const [dbOk, setDbOk]         = useState(null)
  const [simCount, setSimCount] = useState(null)
  const [sims, setSims]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [lastCheck, setLastCheck] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, simsRes] = await Promise.all([
        fetch('/api/db/status'),
        fetch('/api/simulations?limit=100'),
      ])
      const statusData = await statusRes.json()
      setDbOk(statusData.ok === true)
      setSimCount(statusData.simulations ?? null)

      const simsData = await simsRes.json()
      setSims(Array.isArray(simsData) ? simsData : simsData.data ?? [])
      setLastCheck(new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    } catch {
      setDbOk(false)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, simVersion])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 46, borderRadius: 8, background: 'var(--surface2)', animation: 'skeleton-pulse 1.4s ease-in-out infinite' }} />
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ height: 42, borderRadius: 6, background: 'var(--surface2)', animation: `skeleton-pulse 1.4s ${i * 0.1}s ease-in-out infinite` }} />
      ))}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>

      {/* DB status balk */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', borderRadius: 8, flexShrink: 0,
        background: dbOk ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
        border: `1px solid ${dbOk ? 'var(--success)' : 'var(--danger)'}`,
      }}>
        <span style={{ fontSize: 16 }}>{dbOk ? '🟢' : '🔴'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: dbOk ? 'var(--success)' : 'var(--danger)', fontSize: 13 }}>
            {dbOk ? 'Database verbonden' : 'Niet verbonden'}
          </div>
          {lastCheck && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
              {simCount != null ? `${simCount} simulaties opgeslagen · ` : ''}
              Gecontroleerd om {lastCheck}
            </div>
          )}
        </div>
        <button onClick={load} title="Vernieuwen" style={iconBtn}>↺</button>
      </div>

      {/* Simulatiegeschiedenis */}
      {sims.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)', fontSize: 12 }}>
          Nog geen simulaties opgeslagen.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
            Simulatiegeschiedenis
          </div>

          {/* Geselecteerde sim-banner */}
          {selectedSimId && (
            <div style={{
              padding: '5px 10px', borderRadius: 7, flexShrink: 0,
              background: 'rgba(139,92,246,0.12)', border: '1px solid var(--accent2)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
              <span style={{ fontSize: 11, color: 'var(--accent2)' }}>
                🗄️ Simulatie #{selectedSimId} actief in Statistieken &amp; Nieuws
              </span>
              <button
                onClick={() => onSimSelect(null)}
                style={{ ...iconBtn, fontSize: 11, color: 'var(--accent2)', borderColor: 'var(--accent2)' }}
                title="Terug naar meest recente"
              >✕ Wis</button>
            </div>
          )}

          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {sims.map((s, i) => {
              const isLatest   = i === 0 && !selectedSimId
              const isSelected = s.id === selectedSimId
              const ext        = !!s.extinction_event

              return (
                <button
                  key={s.id}
                  onClick={() => onSimSelect(isSelected ? null : s.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 3,
                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${isSelected ? 'var(--accent2)' : isLatest ? 'var(--accent)' : 'var(--border)'}`,
                    background: isSelected
                      ? 'rgba(139,92,246,0.12)'
                      : isLatest
                      ? 'rgba(59,130,246,0.08)'
                      : 'var(--surface2)',
                    textAlign: 'left', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!isSelected && !isLatest) e.currentTarget.style.borderColor = 'var(--muted)' }}
                  onMouseLeave={e => { if (!isSelected && !isLatest) e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  {/* Rij 1: naam + badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? 'var(--accent2)' : isLatest ? 'var(--accent)' : 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isLatest && <span style={{ color: 'var(--accent)', marginRight: 4 }}>●</span>}
                      {s.asteroid_naam ?? '—'} → {s.land_naam ?? '—'}
                    </span>
                    {ext && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: 'rgba(239,68,68,0.15)', color: 'var(--danger)', flexShrink: 0 }}>EXT</span>}
                    {isSelected && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: 'rgba(139,92,246,0.2)', color: 'var(--accent2)', flexShrink: 0 }}>ACTIEF</span>}
                  </div>

                  {/* Rij 2: stats */}
                  <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--muted)' }}>
                    <span>⚡ {s.energie_megaton != null ? `${Number(s.energie_megaton).toFixed(0)} Mt` : '—'}</span>
                    <span>💀 {fmt(s.slachtoffers)}</span>
                    <span>📐 M{s.magnitude != null ? Number(s.magnitude).toFixed(1) : '—'}</span>
                    <span style={{ marginLeft: 'auto' }}>{s.created_at?.slice(0, 10) ?? ''}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

const iconBtn = {
  padding: '3px 8px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--muted)', cursor: 'pointer', fontSize: 12, flexShrink: 0,
}
