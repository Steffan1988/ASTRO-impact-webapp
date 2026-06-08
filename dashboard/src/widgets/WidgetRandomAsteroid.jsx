import { useState } from 'react'

const HAZARD_COLOR = '#ef4444'
const SAFE_COLOR   = '#22c55e'

export default function WidgetRandomAsteroid() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [spinClass, setSpinClass] = useState('')

  const fetchRandom = () => {
    setLoading(true); setError(null); setSpinClass('spin-once')
    fetch('/api/random/asteroid')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); setTimeout(() => setSpinClass(''), 600) })
      .catch(e => { setError(e.message); setLoading(false); setSpinClass('') })
  }

  const naam      = data?.naam ?? data?.name ?? '—'
  const dMin      = data?.diameter_min
  const dMax      = data?.diameter_max
  const snelheid  = data?.snelheid                     // km/u
  const afstand   = data?.afstand                      // km
  const massa     = data?.massa_kg
  const gevaarlijk = data?.gevaarlijk ?? false

  // Diameter classification
  const avgD = dMin != null && dMax != null ? (Number(dMin) + Number(dMax)) / 2 : null
  const sizeLabel = avgD == null ? null
    : avgD < 25   ? { label: 'Klein', color: '#22c55e', desc: 'Klein object — airburst mogelijk' }
    : avgD < 100  ? { label: 'Middelgroot', color: '#f59e0b', desc: 'Regionale schade bij inslag' }
    : avgD < 500  ? { label: 'Groot', color: '#f97316', desc: 'Landelijk verwoestend bij inslag' }
    : avgD < 2000 ? { label: 'Zeer groot', color: '#ef4444', desc: 'Continentale catastrofe' }
    : { label: 'Massamoordenaar', color: '#7f1d1d', desc: 'Mogelijk extinctie-niveau' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <style>{`
        @keyframes spin-once {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.3); }
          100% { transform: rotate(360deg) scale(1); }
        }
        .spin-once { animation: spin-once 0.6s ease-in-out; }
      `}</style>

      <button
        onClick={fetchRandom}
        disabled={loading}
        style={{
          padding: '10px 16px', borderRadius: 10, border: 'none',
          background: loading ? 'var(--surface2)' : 'var(--accent2)',
          color: loading ? 'var(--muted)' : '#fff',
          fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'all 0.15s',
        }}
      >
        <span className={spinClass} style={{ display: 'inline-block', fontSize: 16 }}>🎲</span>
        {loading ? 'Laden...' : 'Willekeurig object'}
      </button>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)',
          border: '1px solid var(--danger)', fontSize: 12, color: 'var(--danger)',
        }}>
          ⚠ {error}
        </div>
      )}

      {loading && !data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ height: 64, borderRadius: 10, background: 'var(--surface2)', animation: 'skeleton-pulse 1.4s ease-in-out infinite' }} />
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{
              height: 38, borderRadius: 8, background: 'var(--surface2)',
              animation: `skeleton-pulse 1.4s ${i * 0.1}s ease-in-out infinite`,
            }} />
          ))}
        </div>
      )}

      {!data && !loading && !error && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ fontSize: 40 }}>☄️</div>
          <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
            Ontdek een willekeurig Near-Earth Object<br />uit de NASA-database
          </p>
        </div>
      )}

      {data && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Name + hazard badge */}
          <div style={{
            padding: '10px 12px', borderRadius: 10,
            background: gevaarlijk ? 'rgba(239,68,68,0.08)' : 'var(--surface2)',
            border: `1px solid ${gevaarlijk ? HAZARD_COLOR : 'var(--border)'}`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4, wordBreak: 'break-word' }}>
              {naam}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: gevaarlijk ? HAZARD_COLOR : 'rgba(34,197,94,0.15)',
                color: gevaarlijk ? '#fff' : SAFE_COLOR,
              }}>
                {gevaarlijk ? '⚠ GEVAARLIJK' : '✓ Veilig'}
              </span>
              {sizeLabel && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                  background: `${sizeLabel.color}22`, color: sizeLabel.color,
                }}>
                  {sizeLabel.label}
                </span>
              )}
            </div>
            {sizeLabel && (
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{sizeLabel.desc}</p>
            )}
          </div>

          {/* Stats grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              ['📏 Diameter',  dMin != null && dMax != null ? `${fmtN(dMin)} – ${fmtN(dMax)} m` : '—'],
              ['🚀 Snelheid',  snelheid != null ? `${fmtN(snelheid)} km/u` : '—'],
              ['🌍 Afstand',   afstand  != null ? `${fmtBig(afstand)} km` : '—'],
              ['⚖️ Massa',     massa    != null ? `${fmtMass(massa)}` : '—'],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 10px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12,
              }}>
                <span style={{ color: 'var(--muted)' }}>{k}</span>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const fmtN   = v => v != null ? Number(v).toLocaleString('nl-NL', { maximumFractionDigits: 0 }) : '—'
const fmtBig = v => v != null ? (Number(v) / 1_000_000).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) + ' M' : '—'
const fmtMass = v => {
  const n = Number(v)
  if (n >= 1e12) return `${(n/1e12).toLocaleString('nl-NL', {maximumFractionDigits:1})} biljoen kg`
  if (n >= 1e9)  return `${(n/1e9).toLocaleString('nl-NL', {maximumFractionDigits:1})} miljard kg`
  if (n >= 1e6)  return `${(n/1e6).toLocaleString('nl-NL', {maximumFractionDigits:1})} mln kg`
  return `${n.toLocaleString('nl-NL', {maximumFractionDigits:0})} kg`
}
