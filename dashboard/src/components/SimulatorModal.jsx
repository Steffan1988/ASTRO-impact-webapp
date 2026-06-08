import { useState, useEffect } from 'react'

const COMPOSITIONS = [
  {
    id: 'stony',
    label: 'Steen',
    emoji: '🪨',
    color: '#a78bfa',
    desc: 'Meest voorkomend. Desintegreert deels in de atmosfeer — impact is lokaal maar krachtig.',
    animation: 'anim-stony',
  },
  {
    id: 'iron',
    label: 'IJzer',
    emoji: '⚙️',
    color: '#f59e0b',
    desc: 'Dicht en taai. Penetreert de atmosfeer bijna volledig — maximale inslagkracht.',
    animation: 'anim-iron',
  },
  {
    id: 'cometary',
    label: 'Komeet',
    emoji: '☄️',
    color: '#38bdf8',
    desc: 'IJzig en poreus. Explodeert hoog in de atmosfeer als een luchtburst — grote schokgolf, weinig krater.',
    animation: 'anim-cometary',
  },
]

const TARGETS = [
  {
    id: 'rock',
    label: 'Rots / land',
    emoji: '⛰️',
    color: '#86efac',
    desc: 'Harde ondergrond. Vormt een diepe krater en stuurt puin ver weg.',
  },
  {
    id: 'ocean',
    label: 'Oceaan',
    emoji: '🌊',
    color: '#38bdf8',
    desc: 'Water dempt de inslagkracht maar veroorzaakt een massale tsunami.',
  },
  {
    id: 'soft',
    label: 'Zachte grond',
    emoji: '🌿',
    color: '#fbbf24',
    desc: 'Losse bodem absorbeert energie — minder krater, maar grote seismische trilling.',
  },
]

export default function SimulatorModal({ asteroid, country, lat, lng, onClose, onConfirm }) {
  const [step, setStep] = useState(1)
  const [composition, setComposition] = useState(null)
  const [target, setTarget] = useState(null)
  const [hoveredComp, setHoveredComp] = useState(null)
  const [hoveredTarget, setHoveredTarget] = useState(null)
  const [countries, setCountries] = useState([])
  const [selectedCountry, setSelectedCountry] = useState(country ?? '')
  const [countrySearch, setCountrySearch] = useState(country ?? '')

  useEffect(() => {
    fetch('/api/countries').then(r => r.json())
      .then(d => {
        const list = (Array.isArray(d) ? d : d.data ?? []).map(c => c.naam ?? c.name).sort()
        setCountries(list)
        // Auto-match: find best match from geocoded country name
        const exact = list.find(n => n.toLowerCase() === country?.toLowerCase())
        if (exact) { setSelectedCountry(exact); setCountrySearch(exact) }
      })
      .catch(() => {})
  }, [country])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const filteredCountries = countries.filter(n =>
    n.toLowerCase().includes(countrySearch.toLowerCase())
  ).slice(0, 8)

  const confirm = () => {
    if (composition && target && selectedCountry) onConfirm({ composition, target, country: selectedCountry })
  }

  return (
    <>
      <style>{`
        @keyframes pulse-stony {
          0%,100% { transform: scale(1) rotate(0deg); opacity:1; }
          50% { transform: scale(1.2) rotate(15deg); opacity:0.8; }
        }
        @keyframes pulse-iron {
          0%,100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.3); filter: brightness(1.8); }
        }
        @keyframes pulse-cometary {
          0% { transform: scale(1) translateX(0); opacity:1; }
          30% { transform: scale(1.4) translateX(-4px); opacity:0.9; }
          60% { transform: scale(0.9) translateX(4px); opacity:1; }
          100% { transform: scale(1) translateX(0); opacity:1; }
        }
        .anim-stony    { animation: pulse-stony    1.4s ease-in-out infinite; }
        .anim-iron     { animation: pulse-iron     1s   ease-in-out infinite; }
        .anim-cometary { animation: pulse-cometary 1.2s ease-in-out infinite; }
        @keyframes modal-in {
          from { opacity:0; transform: translate(-50%,-48%) scale(0.96); }
          to   { opacity:1; transform: translate(-50%,-50%) scale(1); }
        }
        @keyframes backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          zIndex: 1000, backdropFilter: 'blur(4px)',
          animation: 'backdrop-in 0.15s ease',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        zIndex: 1001,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 28,
        width: 520,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 32px 100px rgba(0,0,0,0.6)',
        animation: 'modal-in 0.2s ease',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              ☄️ Inslagconfiguratie
            </h2>
            <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
              <span style={{ color: 'var(--muted)' }}>
                Object: <strong style={{ color: 'var(--accent)' }}>{asteroid?.naam ?? asteroid?.name ?? '—'}</strong>
              </span>
              {asteroid?.diameter_min != null && (
                <span style={{ color: 'var(--muted)' }}>
                  Ø <strong style={{ color: 'var(--text)' }}>
                    {Number(asteroid.diameter_min).toFixed(0)}–{Number(asteroid.diameter_max).toFixed(0)} m
                  </strong>
                </span>
              )}
              {asteroid?.snelheid != null && (
                <span style={{ color: 'var(--muted)' }}>
                  🚀 <strong style={{ color: 'var(--text)' }}>{Number(asteroid.snelheid).toLocaleString('nl-NL')} km/u</strong>
                </span>
              )}
              {lat != null && (
                <span style={{ color: 'var(--muted)' }}>
                  📍 <strong style={{ color: 'var(--text)' }}>{lat.toFixed(2)}°, {lng.toFixed(2)}°</strong>
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            title="Sluiten (Escape)"
            style={{
              background: 'none', border: '1px solid transparent', borderRadius: 8,
              color: 'var(--muted)', fontSize: 22, cursor: 'pointer',
              lineHeight: 1, padding: '2px 6px', transition: 'all 0.15s', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--muted)' }}
          >×</button>
        </div>

        {/* Country selector */}
        <div style={{ marginBottom: 16, position: 'relative' }}>
          <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            🌍 Inslagland
          </label>
          <input
            value={countrySearch}
            onChange={e => { setCountrySearch(e.target.value); setSelectedCountry('') }}
            placeholder="Zoek land..."
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 8,
              border: `1px solid ${selectedCountry ? 'var(--success)' : 'var(--border)'}`,
              background: 'var(--surface2)', color: 'var(--text)', fontSize: 13,
            }}
          />
          {selectedCountry && (
            <span style={{
              position: 'absolute', right: 10, top: '50%', marginTop: 2,
              color: 'var(--success)', fontSize: 14, pointerEvents: 'none',
            }}>✓</span>
          )}
          {countrySearch && !selectedCountry && filteredCountries.length > 0 && (
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '100%',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, zIndex: 10, maxHeight: 180, overflow: 'auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}>
              {filteredCountries.map(n => (
                <button
                  key={n}
                  onClick={() => { setSelectedCountry(n); setCountrySearch(n) }}
                  style={{
                    display: 'block', width: '100%', padding: '8px 12px',
                    textAlign: 'left', background: 'none', border: 'none',
                    color: 'var(--text)', cursor: 'pointer', fontSize: 13,
                    borderBottom: '1px solid var(--border)',
                  }}
                  onMouseEnter={e => e.target.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.target.style.background = 'none'}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step indicator */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            {[1, 2].map(s => (
              <div key={s} style={{
                flex: 1, height: 3, borderRadius: 2,
                background: s <= step ? 'var(--accent)' : 'var(--border)',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: step === 1 ? 'var(--accent)' : 'var(--success)', fontWeight: step === 1 ? 700 : 500 }}>
              {step > 1 ? '✓ ' : ''}Stap 1: Samenstelling
            </span>
            <span style={{ color: step === 2 ? 'var(--accent)' : 'var(--muted)', fontWeight: step === 2 ? 700 : 400 }}>
              Stap 2: Doeltype
            </span>
          </div>
        </div>

        {step === 1 && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
              Stap 1 — Kies de <strong style={{ color: 'var(--text)' }}>samenstelling</strong> van het object:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {COMPOSITIONS.map(c => (
                <button
                  key={c.id}
                  onClick={() => setComposition(c.id)}
                  onMouseEnter={() => setHoveredComp(c.id)}
                  onMouseLeave={() => setHoveredComp(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${composition === c.id ? c.color : 'var(--border)'}`,
                    background: composition === c.id
                      ? `${c.color}18`
                      : hoveredComp === c.id ? 'var(--surface2)' : 'transparent',
                    transition: 'all 0.15s',
                    textAlign: 'left',
                  }}
                >
                  <span
                    className={hoveredComp === c.id || composition === c.id ? c.animation : ''}
                    style={{ fontSize: 28, display: 'inline-block', minWidth: 36, textAlign: 'center' }}
                  >
                    {c.emoji}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: composition === c.id ? c.color : 'var(--text)' }}>
                      {c.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>
                      {c.desc}
                    </div>
                  </div>
                  {composition === c.id && (
                    <span style={{ color: c.color, fontSize: 18, fontWeight: 700 }}>✓</span>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => composition && setStep(2)}
              disabled={!composition}
              style={{
                marginTop: 18, width: '100%', padding: '10px 0',
                borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 14,
                background: composition ? 'var(--accent)' : 'var(--border)',
                color: composition ? '#fff' : 'var(--muted)',
                cursor: composition ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
              }}
            >
              Volgende →
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
              Stap 2 — Kies het <strong style={{ color: 'var(--text)' }}>doeltype</strong> op de inslaglocatie:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {TARGETS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTarget(t.id)}
                  onMouseEnter={() => setHoveredTarget(t.id)}
                  onMouseLeave={() => setHoveredTarget(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${target === t.id ? t.color : 'var(--border)'}`,
                    background: target === t.id
                      ? `${t.color}18`
                      : hoveredTarget === t.id ? 'var(--surface2)' : 'transparent',
                    transition: 'all 0.15s',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 28, minWidth: 36, textAlign: 'center' }}>{t.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: target === t.id ? t.color : 'var(--text)' }}>
                      {t.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>
                      {t.desc}
                    </div>
                  </div>
                  {target === t.id && (
                    <span style={{ color: t.color, fontSize: 18, fontWeight: 700 }}>✓</span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--surface2)',
                  color: 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 14,
                }}
              >
                ← Terug
              </button>
              <button
                onClick={confirm}
                disabled={!target}
                style={{
                  flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                  background: target ? 'var(--danger)' : 'var(--border)',
                  color: target ? '#fff' : 'var(--muted)',
                  cursor: target ? 'pointer' : 'not-allowed',
                  fontWeight: 700, fontSize: 14, transition: 'all 0.15s',
                }}
              >
                🚀 Simuleer inslag
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
