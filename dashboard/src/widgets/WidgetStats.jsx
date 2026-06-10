import { useEffect, useState, useCallback, useRef } from 'react'

const ZONE_COLOR = {
  vuurbal:       '#ef4444',
  zware_vern:    '#f97316',
  matige_vern:   '#f59e0b',
  thermisch:     '#ec4899',
  lichte_schade: '#3b82f6',
  seismisch:     '#8b5cf6',
}

const ZONE_BARS = [
  { key: 'r_vuurbal',       label: 'Vuurbal',           color: '#ef4444' },
  { key: 'r_zware_vern',    label: 'Zware verwoesting', color: '#f97316' },
  { key: 'r_matige_vern',   label: 'Matige verwoesting',color: '#f59e0b' },
  { key: 'r_thermisch',     label: 'Thermisch',         color: '#ec4899' },
  { key: 'r_lichte_schade', label: 'Lichte schade',     color: '#3b82f6' },
  { key: 'r_seismisch',     label: 'Seismisch',         color: '#8b5cf6' },
]

const CASUALTY_BARS = [
  { key: 'sl_direct',    label: 'Direct',    color: '#ef4444' },
  { key: 'sl_thermisch', label: 'Thermisch', color: '#f97316' },
  { key: 'sl_shockgolf', label: 'Schokgolf', color: '#eab308' },
  { key: 'sl_seismisch', label: 'Seismisch', color: '#8b5cf6' },
  { key: 'sl_overig',    label: 'Overig',    color: '#64748b' },
]

const fmt = n => {
  if (n == null) return '—'
  n = Number(n)
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' mrd'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + ' mln'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return n.toLocaleString('nl-NL')
}

const fmtKm = r => {
  r = Number(r)
  if (!r) return '—'
  if (r >= 10)   return r.toFixed(0) + ' km'
  if (r >= 1)    return r.toFixed(1) + ' km'
  if (r >= 0.01) return r.toFixed(2) + ' km'
  return '< 0,01 km'
}

export default function WidgetStats({ selectedSimId, simVersion }) {
  const [sim, setSim]               = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [latestId, setLatestId]     = useState(null)
  const [affected, setAffected]     = useState([])
  const affectedRef = useRef(null)

  const load = useCallback(async (id) => {
    setLoading(true); setError(null)
    try {
      if (id) {
        // Specifieke simulatie ophalen via de lijst (geen apart endpoint nodig)
        const r = await fetch('/api/simulations?limit=200')
        const d = await r.json()
        const list = Array.isArray(d) ? d : d.data ?? []
        const found = list.find(s => s.id === id)
        if (found) { setSim(found); setLoading(false); return }
      }
      // Meest recente
      const r = await fetch('/api/simulations?limit=1')
      const d = await r.json()
      const list = Array.isArray(d) ? d : d.data ?? []
      if (list.length > 0) {
        setSim(list[0])
        setLatestId(list[0].id)
      } else {
        setSim(null)
      }
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load(selectedSimId) }, [selectedSimId, simVersion, load])

  useEffect(() => {
    if (!sim?.id) return
    if (affectedRef.current === sim.id) return
    affectedRef.current = sim.id
    fetch(`/api/simulations/${sim.id}/affected`)
      .then(r => r.json())
      .then(d => setAffected(Array.isArray(d.data) ? d.data : []))
      .catch(() => setAffected([]))
  }, [sim?.id])

  if (loading) return <Skeleton />
  if (error)   return <div style={{ color: 'var(--danger)', fontSize: 12, padding: 8 }}>Fout: {error}</div>
  if (!sim)    return (
    <div style={{ textAlign: 'center', paddingTop: 32 }}>
      <p style={{ fontSize: 28 }}>📊</p>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>Nog geen simulaties.</p>
      <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>Sleep een asteroïde op de kaart om te starten.</p>
    </div>
  )

  const isOld = selectedSimId && selectedSimId !== latestId
  const domCasualties = CASUALTY_BARS.reduce((s, b) => s + Number(sim[b.key] ?? 0), 0)
  const intlCasualties = affected.reduce((s, c) => s + Number(c.slachtoffers ?? 0), 0)
  const totCasualties = domCasualties + intlCasualties
  const maxCas = Math.max(...CASUALTY_BARS.map(b => Number(sim[b.key] ?? 0)), 1)
  const maxR   = Math.max(...ZONE_BARS.map(b => Number(sim[b.key] ?? 0)), 1)
  const ext    = sim.extinction_event

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'auto' }}>

      {/* Context-banner */}
      <div style={{
        padding: '6px 10px', borderRadius: 8, fontSize: 11, flexShrink: 0,
        background: isOld ? 'rgba(139,92,246,0.12)' : 'rgba(59,130,246,0.10)',
        border: `1px solid ${isOld ? 'var(--accent2)' : 'var(--accent)'}`,
        color: isOld ? 'var(--accent2)' : 'var(--accent)',
        display: 'flex', gap: 6, alignItems: 'center',
      }}>
        <span>{isOld ? '🗄️' : '🕐'}</span>
        <span>
          {isOld ? 'Geselecteerde simulatie uit geschiedenis' : 'Meest recente simulatie'}
          {' — '}
          <strong>{sim.asteroid_naam ?? '—'}</strong> → <strong>{sim.land_naam ?? '—'}</strong>
          {sim.created_at && <span style={{ color: 'var(--muted)', marginLeft: 4 }}>({sim.created_at.slice(0, 10)})</span>}
        </span>
      </div>

      {/* Extinctie-banner */}
      {ext ? (
        <div style={{
          padding: '6px 12px', borderRadius: 8, flexShrink: 0,
          background: 'rgba(239,68,68,0.12)', border: '1px solid var(--danger)',
          color: 'var(--danger)', fontWeight: 700, fontSize: 12, textAlign: 'center',
        }}>
          ⚠ EXTINCTIE-EVENT — Chicxulub-niveau catastrofe
        </div>
      ) : null}

      {/* Kerngetallen */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        {[
          { label: 'Energie',      val: sim.energie_megaton != null ? `${Number(sim.energie_megaton).toFixed(1)} Mt` : '—', color: 'var(--warning)' },
          { label: 'Magnitude',    val: sim.magnitude != null ? `M ${Number(sim.magnitude).toFixed(1)}` : '—', color: 'var(--accent)' },
          { label: intlCasualties > 0 ? 'Slachtoffers (wereldwijd)' : 'Slachtoffers', val: fmt(totCasualties), color: 'var(--danger)' },
          { label: '% vernietigd', val: sim.procent_land != null ? `${Number(sim.procent_land).toFixed(1)}%` : '—', color: 'var(--warning)' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            flex: 1, minWidth: 80, padding: '7px 10px',
            background: 'var(--surface2)', borderRadius: 8,
            borderLeft: `3px solid ${color}`,
          }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Slachtoffers per oorzaak */}
      <div style={{ flexShrink: 0 }}>
        <SectionTitle>Slachtoffers per oorzaak</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {CASUALTY_BARS.map(b => {
            const v = Number(sim[b.key] ?? 0)
            return (
              <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 72, fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{b.label}</span>
                <div style={{ flex: 1, height: 16, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(v / maxCas) * 100}%`, height: '100%',
                    background: b.color, borderRadius: 4,
                    transition: 'width 0.4s ease', minWidth: v > 0 ? 3 : 0,
                  }} />
                </div>
                <span style={{ width: 52, fontSize: 11, fontWeight: 600, color: 'var(--text)', textAlign: 'right', flexShrink: 0 }}>
                  {fmt(v)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Schaderingen */}
      <div style={{ flexShrink: 0 }}>
        <SectionTitle>Schaderingen (radius)</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {ZONE_BARS.map(b => {
            const v = Number(sim[b.key] ?? 0)
            return (
              <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 130, fontSize: 11, color: 'var(--muted)', flexShrink: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={b.label}>{b.label}</span>
                <div style={{ flex: 1, height: 16, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(v / maxR) * 100}%`, height: '100%',
                    background: b.color, borderRadius: 4,
                    transition: 'width 0.4s ease', minWidth: v > 0 ? 3 : 0,
                  }} />
                </div>
                <span style={{ width: 62, fontSize: 11, fontWeight: 600, color: 'var(--text)', textAlign: 'right', flexShrink: 0 }}>
                  {fmtKm(v)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Internationale impact */}
      {affected.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <SectionTitle>Internationale impact</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {affected.map(c => (
              <div key={c.naam} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: ZONE_COLOR[c.zone] ?? 'var(--muted)',
                }} />
                <span style={{ flex: 1, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.naam}</span>
                <span style={{ color: 'var(--muted)', flexShrink: 0, minWidth: 52, textAlign: 'right' }}>{c.afstand_km} km</span>
                <span style={{ color: ZONE_COLOR[c.zone] ?? 'var(--muted)', flexShrink: 0, fontSize: 10, minWidth: 72, textAlign: 'right' }}>{c.zone_label}</span>
                <span style={{ color: 'var(--text)', fontWeight: 600, flexShrink: 0, minWidth: 52, textAlign: 'right' }}>{fmt(c.slachtoffers)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Impact parameters */}
      <div style={{ flexShrink: 0 }}>
        <SectionTitle>Impactparameters</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {[
            ['Samenstelling', sim.composition ? { cometary: 'Komeet', stony: 'Steen', iron: 'IJzer' }[sim.composition] ?? sim.composition : '—'],
            ['Doeltype',      sim.target_type  ? { rock: 'Rots', ocean: 'Oceaan', soft: 'Zachte grond' }[sim.target_type] ?? sim.target_type : '—'],
            ['Invalshoek',    sim.impact_angle != null ? `${Number(sim.impact_angle).toFixed(0)}°` : '—'],
            ['Airburst',      sim.airburst ? `Ja — ${Number(sim.airburst_alt_km ?? 0).toFixed(0)} km` : 'Nee'],
            ['Kraterdiameter',sim.crater_km > 0.01 ? `Ø ${Number(sim.crater_km).toFixed(1)} km` : '—'],
            ['Vernietigde opp.', sim.vernietigde_opp != null ? `${Number(sim.vernietigde_opp).toLocaleString('nl-NL', { maximumFractionDigits: 0 })} km²` : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: '5px 8px', background: 'var(--surface2)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{k}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginTop: 1 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: 'var(--accent)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      marginBottom: 6,
    }}>{children}</div>
  )
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 4 }}>
      <div style={{ height: 36, borderRadius: 8, background: 'var(--surface2)', animation: 'skeleton-pulse 1.4s ease-in-out infinite' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ flex: 1, height: 48, borderRadius: 8, background: 'var(--surface2)', animation: `skeleton-pulse 1.4s ${i * 0.1}s ease-in-out infinite` }} />
        ))}
      </div>
      {[0.8, 0.6, 0.9, 0.5, 0.7].map((w, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 72, height: 14, borderRadius: 4, background: 'var(--surface2)', animation: `skeleton-pulse 1.4s ${i * 0.08}s ease-in-out infinite`, flexShrink: 0 }} />
          <div style={{ flex: 1, height: 16, borderRadius: 4, background: 'var(--surface2)', animation: `skeleton-pulse 1.4s ${i * 0.08}s ease-in-out infinite`, overflow: 'hidden' }}>
            <div style={{ width: `${w * 100}%`, height: '100%', background: 'var(--border)', borderRadius: 4, opacity: 0.5 }} />
          </div>
          <div style={{ width: 52, height: 14, borderRadius: 4, background: 'var(--surface2)', animation: `skeleton-pulse 1.4s ${i * 0.08}s ease-in-out infinite`, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}
